'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { Map, useMap } from '@vis.gl/react-google-maps';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { safeFixed } from '@/lib/formatters';
import { VamoMarker } from '@/components/VamoMarker';
import { Badge } from '@/components/ui/badge';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';

interface DriverLiveStatus {
    id: string;
    driverName: string;
    driverStatus: 'online' | 'offline' | 'in_ride' | 'busy';
    currentLocation: { lat: number; lng: number } | null;
    lastSeenAt: any;
    driverType?: string;
    municipalStatus: string;
    municipalCode?: string;
    isSuspended?: boolean;
    vehicleBrand: string;
    vehicleModel: string;
    vehiclePlate: string;
    vehicleColor: string;
    docsComplete: boolean;
    missingDocs?: string[];
    expiredDocs?: string[];
    photoUrl?: string;
}

// ─── Safe Coordinates Engine ──────────────────────────────────────────────────
function toNumber(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function getValidLatLng(driver: any): { lat: number; lng: number } | null {
    if (!driver) return null;

    const rawLat =
        driver?.lat ??
        driver?.latitude ??
        driver?.location?.lat ??
        driver?.location?.latitude ??
        driver?.lastLocation?.lat ??
        driver?.lastLocation?.latitude ??
        driver?.currentLocation?.lat ??
        driver?.currentLocation?.latitude ??
        driver?.currentLocation?.latitude;

    const rawLng =
        driver?.lng ??
        driver?.longitude ??
        driver?.location?.lng ??
        driver?.location?.longitude ??
        driver?.lastLocation?.lng ??
        driver?.lastLocation?.longitude ??
        driver?.currentLocation?.lng ??
        driver?.currentLocation?.longitude;

    const lat = toNumber(rawLat);
    const lng = toNumber(rawLng);

    if (lat === null || lng === null) return null;
    if (lat < -90 || lat > 90) return null;
    if (lng < -180 || lng > 180) return null;

    return { lat, lng };
}

export default function TrafficMapPage() {
    const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || 'vamo-traffic-tactical';
    const { cityKey, cityName, cityCenter, cityZoom, loading: contextLoading } = useMunicipalContext();
    const telemetry = useTelemetry();

    // Map stability state
    const [mapCenter, setMapCenter] = useState(cityCenter);
    const [mapZoom, setMapZoom] = useState(cityZoom);
    const [hasInteracted, setHasInteracted] = useState(false);

    useEffect(() => {
        if (!hasInteracted && cityCenter) {
            setMapCenter(cityCenter);
            setMapZoom(cityZoom);
        }
    }, [cityCenter, cityZoom, hasInteracted]);

    useEffect(() => {
        if (!contextLoading && cityKey) {
            telemetry.trackEvent({
                type: 'municipal_operation',
                eventName: 'traffic_map_loaded',
                metadata: {
                    cityKey,
                    cityName
                }
            });
        }
    }, [contextLoading, cityKey, cityName]);

    const handleMapInteraction = () => {
        if (!hasInteracted) {
            console.log("📍 [LIVE_MAP_USER_INTERACTION] Traffic User interacted.");
            setHasInteracted(true);
        }
    };

    if (contextLoading) return (
        <div className="h-screen flex items-center justify-center bg-black">
            <VamoIcon name="loader" className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
    );

    return (
        <div className="h-[calc(100vh-80px)] w-full relative overflow-hidden rounded-3xl border border-white/5 bg-zinc-950">
            <Map
                center={mapCenter}
                zoom={mapZoom}
                onCenterChanged={(e) => {
                    setMapCenter(e.detail.center);
                    handleMapInteraction();
                }}
                onZoomChanged={(e) => {
                    setMapZoom(e.detail.zoom);
                    handleMapInteraction();
                    console.log("📍 [LIVE_MAP_ZOOM_CHANGED] Traffic:", e.detail.zoom);
                }}
                mapId={MAP_ID}
                disableDefaultUI={false}
                gestureHandling={'greedy'}
                className="w-full h-full"
                colorScheme="DARK"
            >
                <TrafficDriversLayer cityKey={cityKey} />
            </Map>
        </div>
    );
}

function TrafficDriversLayer({ cityKey }: { cityKey: string | null | undefined }) {
    const db = useFirestore();
    const map = useMap();
    const router = useRouter();
    const telemetry = useTelemetry();

    const [drivers, setDrivers] = useState<DriverLiveStatus[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'in_ride' | 'stale' | 'suspended'>('all');

    if (!cityKey) {
        return (
            <div className="absolute top-6 left-6 z-10 w-96 bg-zinc-950/90 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] shadow-2xl p-6 flex flex-col pointer-events-auto">
                <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Fiscalización de Tránsito</h2>
                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mt-1">Centro de Control de Flotas</p>
                <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <VamoIcon name="alert-triangle" className="w-8 h-8 text-amber-500 mx-auto mb-2 animate-pulse" />
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Sin ciudad asignada</p>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase font-medium">Este operador no tiene una jurisdicción municipal válida configurada.</p>
                </div>
            </div>
        );
    }

    // Subscribe to driver locations
    useEffect(() => {
        if (!db || !cityKey) return;

        const q = query(
            collection(db, 'drivers_locations'),
            where('cityKey', '==', cityKey),
            limit(200)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => {
                const data = doc.data();
                
                // Robust normalization of location coordinates
                const validLoc = getValidLatLng(data);

                return {
                    id: doc.id,
                    driverName: data.driverName || 'Conductor',
                    driverStatus: data.driverStatus || 'offline',
                    currentLocation: validLoc,
                    lastSeenAt: data.lastSeenAt,
                    driverType: data.driverType || 'No informado',
                    municipalStatus: data.municipalStatus || 'No informado',
                    municipalCode: data.municipalCode || '',
                    isSuspended: data.isSuspended || false,
                    vehicleBrand: data.vehicle?.brand || 'No informado',
                    vehicleModel: data.vehicle?.model || '',
                    vehiclePlate: data.vehicle?.plate || 'No informado',
                    vehicleColor: data.vehicle?.color || '',
                    docsComplete: data.docsComplete,
                    missingDocs: data.missingDocs || [],
                    expiredDocs: data.expiredDocs || [],
                    photoUrl: data.photoUrl || null
                } as DriverLiveStatus;
            });

            // Handle Overlaps (Displacement logic)
            const locationCounts: Record<string, number> = {};
            const processed = fetched.map(d => {
                if (!d.currentLocation) return d;
                
                const key = `${safeFixed(d.currentLocation.lat, 4)},${safeFixed(d.currentLocation.lng, 4)}`;
                const count = locationCounts[key] || 0;
                locationCounts[key] = count + 1;

                if (count > 0) {
                    const offsetLat = (count % 2 === 0 ? 1 : -1) * Math.ceil(count / 2) * 0.00015;
                    const offsetLng = (count % 3 === 0 ? 1 : -1) * Math.ceil(count / 2) * 0.00015;
                    
                    return {
                        ...d,
                        currentLocation: {
                            lat: d.currentLocation.lat + offsetLat,
                            lng: d.currentLocation.lng + offsetLng
                        }
                    };
                }
                return d;
            });

            setDrivers(processed);
        });

        return () => unsubscribe();
    }, [db, cityKey]);

    // Check if location reports are stale (updated > 10 minutes ago)
    const isStale = (driver: DriverLiveStatus) => {
        if (!driver.lastSeenAt) return true;
        let lastSeenMs = 0;
        if (typeof driver.lastSeenAt.toMillis === 'function') {
            lastSeenMs = driver.lastSeenAt.toMillis();
        } else if (typeof driver.lastSeenAt.seconds === 'number') {
            lastSeenMs = driver.lastSeenAt.seconds * 1000;
        } else {
            lastSeenMs = new Date(driver.lastSeenAt).getTime();
        }
        return Number.isNaN(lastSeenMs) ? true : (Date.now() - lastSeenMs) > 10 * 60 * 1000;
    };

    // Filter and search drivers in-memory
    const filteredDrivers = useMemo(() => {
        return drivers.filter(d => {
            const queryClean = searchQuery.toLowerCase().trim();
            const matchesSearch = !queryClean || 
                d.driverName.toLowerCase().includes(queryClean) ||
                d.vehiclePlate.toLowerCase().includes(queryClean) ||
                (d.municipalCode && d.municipalCode.toLowerCase().includes(queryClean)) ||
                (d.vehicleBrand + ' ' + d.vehicleModel).toLowerCase().includes(queryClean);

            if (!matchesSearch) return false;

            const drvIsStale = isStale(d);
            const isSuspended = d.isSuspended || d.municipalStatus?.toLowerCase() === 'suspended' || d.municipalStatus?.toLowerCase() === 'suspendido';

            if (filterStatus === 'all') return true;
            if (filterStatus === 'online') return d.driverStatus === 'online' && !drvIsStale && !isSuspended;
            if (filterStatus === 'in_ride') return (d.driverStatus === 'in_ride' || d.driverStatus === 'busy') && !drvIsStale && !isSuspended;
            if (filterStatus === 'stale') return drvIsStale && !isSuspended;
            if (filterStatus === 'suspended') return isSuspended;

            return true;
        });
    }, [drivers, searchQuery, filterStatus]);

    // Separate drivers based on coordinate validity
    const driversWithValidLocation = useMemo(() => {
        return filteredDrivers.filter(d => d.currentLocation !== null) as (DriverLiveStatus & { currentLocation: { lat: number; lng: number } })[];
    }, [filteredDrivers]);

    const selectedDriver = useMemo(() => drivers.find(d => d.id === selectedDriverId), [drivers, selectedDriverId]);

    const handleSelectDriver = (driver: DriverLiveStatus) => {
        setSelectedDriverId(driver.id);
        if (map && driver.currentLocation) {
            map.panTo(driver.currentLocation);
            map.setZoom(16);
            console.log("📍 [LIVE_MAP_DRIVER_SELECTED] Centered map on:", driver.id);
        }
        telemetry.trackEvent({
            type: 'municipal_operation',
            eventName: 'traffic_driver_selected',
            metadata: {
                driverId: driver.id,
                driverName: driver.driverName,
                vehiclePlate: driver.vehiclePlate,
                cityKey
            }
        });
    };

    return (
        <>
            {/* Markers on Map (Strictly using verified coordinates) */}
            {driversWithValidLocation.map(driver => (
                <VamoMarker
                    key={driver.id}
                    position={driver.currentLocation}
                    onClick={() => handleSelectDriver(driver)}
                >
                    <TrafficDriverMarker 
                        driver={driver} 
                        isSelected={selectedDriverId === driver.id} 
                        isStale={isStale(driver)}
                        onClick={() => handleSelectDriver(driver)} 
                    />
                </VamoMarker>
            ))}

            {/* Tactical Control Sidebar (Left side, absolute positioning) */}
            <div className="absolute top-6 left-6 z-10 w-96 bg-zinc-950/90 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] shadow-2xl p-6 flex flex-col max-h-[calc(100vh-140px)] pointer-events-auto">
                <div>
                    <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Fiscalización de Tránsito</h2>
                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em]">Centro de Control de Flotas</p>
                </div>

                {/* Search Bar */}
                <div className="mt-4 relative">
                    <input
                        type="text"
                        placeholder="Buscar conductor, patente o móvil..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                    <VamoIcon name="search" className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500" />
                </div>

                {/* State Filters */}
                <div className="mt-4 flex flex-wrap gap-1.5 border-b border-white/5 pb-4">
                    {[
                        { id: 'all', label: 'Todos' },
                        { id: 'online', label: 'Libres', color: 'bg-emerald-500' },
                        { id: 'in_ride', label: 'En Viaje', color: 'bg-indigo-500' },
                        { id: 'stale', label: 'Inactivos', color: 'bg-amber-500' },
                        { id: 'suspended', label: 'Suspendidos', color: 'bg-rose-500' }
                    ].map(btn => (
                        <button
                            key={btn.id}
                            onClick={() => setFilterStatus(btn.id as any)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5",
                                filterStatus === btn.id 
                                    ? "bg-indigo-600 border-indigo-500 text-white" 
                                    : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"
                            )}
                        >
                            {btn.color && <span className={cn("w-1.5 h-1.5 rounded-full", btn.color)} />}
                            {btn.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable Results List */}
                <div className="mt-4 overflow-y-auto flex-1 divide-y divide-white/5 space-y-2 pr-1 min-h-[150px]">
                    {filteredDrivers.length === 0 ? (
                        <p className="text-zinc-600 text-[10px] italic text-center py-8 uppercase font-bold tracking-widest">No se encontraron móviles activos</p>
                    ) : (
                        filteredDrivers.map(drv => {
                            const drvIsStale = isStale(drv);
                            const isOnline = drv.driverStatus === 'online' && !drvIsStale;
                            const isBusy = (drv.driverStatus === 'in_ride' || drv.driverStatus === 'busy') && !drvIsStale;
                            const isSuspended = drv.isSuspended || drv.municipalStatus?.toLowerCase() === 'suspended' || drv.municipalStatus?.toLowerCase() === 'suspendido';
                            const hasLocation = drv.currentLocation !== null;

                            let statusBadge = (
                                <span className="text-[8px] font-black uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Offline</span>
                            );
                            if (isSuspended) {
                                statusBadge = (
                                    <span className="text-[8px] font-black uppercase bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded">Suspendido</span>
                                );
                            } else if (!hasLocation) {
                                statusBadge = (
                                    <span className="text-[8px] font-black uppercase bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-0.5 rounded">Sin Señal</span>
                                );
                            } else if (drvIsStale) {
                                statusBadge = (
                                    <span className="text-[8px] font-black uppercase bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded">Inactivo</span>
                                );
                            } else if (isOnline) {
                                statusBadge = (
                                    <span className="text-[8px] font-black uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Libre</span>
                                );
                            } else if (isBusy) {
                                statusBadge = (
                                    <span className="text-[8px] font-black uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">En Viaje</span>
                                );
                            }

                            return (
                                <button
                                    key={drv.id}
                                    onClick={() => handleSelectDriver(drv)}
                                    className={cn(
                                        "w-full text-left py-2 px-3 rounded-2xl transition-all duration-300 flex items-center justify-between gap-2 hover:bg-white/5",
                                        selectedDriverId === drv.id ? "bg-white/10 border border-white/10" : "border border-transparent"
                                    )}
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-white truncate">{drv.driverName}</p>
                                        <p className="text-[9px] text-zinc-500 truncate font-mono uppercase mt-0.5">
                                            {drv.vehicleBrand} {drv.vehicleModel} · <span className="text-indigo-400">{drv.vehiclePlate}</span>
                                        </p>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1">
                                        {statusBadge}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Selection Sidebar (Right side, absolute positioning) */}
            {selectedDriver && (
                <div className="absolute top-6 right-6 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 z-50 pointer-events-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Unidad de Control</h3>
                        <button onClick={() => setSelectedDriverId(null)} className="text-zinc-500 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center">
                            {selectedDriver.photoUrl ? (
                                <img src={selectedDriver.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <VamoIcon name="user" className="w-7 h-7 text-zinc-700" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-white truncate text-lg tracking-tighter">{selectedDriver.driverName}</p>
                            <div className="flex gap-1.5 mt-1">
                                <Badge className={cn(
                                    "text-[8px] font-black uppercase", 
                                    selectedDriver.isSuspended || selectedDriver.municipalStatus?.toLowerCase() === 'suspended'
                                        ? "bg-rose-500/20 text-rose-400"
                                        : !selectedDriver.currentLocation
                                            ? "bg-zinc-800 text-zinc-500"
                                            : isStale(selectedDriver)
                                                ? "bg-amber-500/20 text-amber-500"
                                                : selectedDriver.driverStatus === 'online' 
                                                    ? "bg-emerald-500/20 text-emerald-500" 
                                                    : "bg-indigo-500/20 text-indigo-400"
                                )}>
                                    {selectedDriver.isSuspended || selectedDriver.municipalStatus?.toLowerCase() === 'suspended'
                                        ? 'SUSPENDIDO'
                                        : !selectedDriver.currentLocation
                                            ? 'SIN SEÑAL'
                                            : isStale(selectedDriver)
                                                ? 'INACTIVO'
                                                : selectedDriver.driverStatus === 'online' 
                                                    ? 'LIBRE' 
                                                    : 'EN SERVICIO'}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 mb-6">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Patente</p>
                                <p className="text-xs font-mono font-bold text-indigo-400">{selectedDriver.vehiclePlate}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Muni</p>
                                <p className={cn(
                                    "text-xs font-bold uppercase", 
                                    selectedDriver.municipalStatus === 'active' || selectedDriver.municipalStatus === 'habilitado' 
                                        ? "text-emerald-500" 
                                        : "text-amber-500"
                                )}>
                                    {selectedDriver.municipalStatus}
                                </p>
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Vehículo</p>
                            <p className="text-xs font-bold text-zinc-300 truncate">{selectedDriver.vehicleBrand} {selectedDriver.vehicleModel}</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => {
                            console.log("📍 [LIVE_MAP_DRIVER_DETAIL_OPEN] Traffic:", selectedDriver.id);
                            router.push(`/traffic/drivers/${selectedDriver.id}`);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-12 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                    >
                        Ver Documentación
                    </button>
                    <p className="text-[8px] text-zinc-600 font-bold text-center mt-3 uppercase tracking-tighter italic">
                        Posición reportada: {selectedDriver.lastSeenAt?.toDate ? selectedDriver.lastSeenAt.toDate().toLocaleTimeString('es-AR') : 'N/A'}
                    </p>
                </div>
            )}

            {/* Legend (Bottom left, absolute positioning) */}
            <div className="absolute bottom-6 left-6 z-10 flex gap-2 flex-wrap max-w-lg pointer-events-auto">
               <LegendItem color="bg-emerald-500" label="Libre" />
               <LegendItem color="bg-indigo-500" label="En Viaje" />
               <LegendItem color="bg-amber-500" label="Inactivo" />
               <LegendItem color="bg-rose-500" label="Suspendido" />
            </div>
        </>
    );
}

function LegendItem({ color, label }: { color: string, label: string }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-full border border-white/5 shadow-md">
            <div className={cn("w-2 h-2 rounded-full", color)} />
            <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">{label}</span>
        </div>
    );
}

function TrafficDriverMarker({ driver, isSelected, isStale, onClick }: { driver: DriverLiveStatus & { currentLocation: { lat: number; lng: number } }, isSelected?: boolean, isStale: boolean, onClick?: () => void }) {
    const isOnline = driver.driverStatus === 'online' && !isStale;
    const isBusy = (driver.driverStatus === 'in_ride' || driver.driverStatus === 'busy') && !isStale;
    const isSuspended = driver.isSuspended || driver.municipalStatus?.toLowerCase() === 'suspended' || driver.municipalStatus?.toLowerCase() === 'suspendido';

    const colorClass = isSuspended 
        ? 'bg-rose-500' 
        : isStale 
            ? 'bg-amber-500' 
            : isOnline 
                ? 'bg-[#22c55e]' 
                : 'bg-[#1D7CFF]';

    const shadowClass = isSuspended 
        ? 'shadow-[0_0_12px_rgba(239,68,68,0.6)]' 
        : isStale 
            ? 'shadow-[0_0_12px_rgba(245,158,11,0.6)]' 
            : isOnline 
                ? 'shadow-[0_2px_4px_rgba(0,0,0,0.3)]' 
                : 'shadow-[0_0_12px_rgba(29,124,255,0.6)]';

    const animationClass = isOnline ? 'animate-pulse' : '';

    return (
        <div 
            className="relative group cursor-pointer pointer-events-auto"
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
        >
            <div className={cn(
                "relative flex items-center justify-center w-8 h-8 rounded-full border-[1.5px] border-white/90 transition-all duration-300 transform group-hover:scale-125",
                isSelected ? "scale-150 ring-4 ring-white/20 z-50 border-white" : "",
                colorClass,
                shadowClass,
                animationClass
            )}>
                <VamoIcon name="car" className="h-4 w-4 text-white drop-shadow-sm" />
            </div>

            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 origin-bottom scale-95 group-hover:scale-100">
                <div className="w-[300px] bg-[#0B1220] border border-[#1D7CFF]/25 shadow-[0_10px_40px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden flex flex-col pointer-events-none">
                    <div className="p-4 border-b border-white/5 flex gap-3 items-start">
                        <div className="w-12 h-12 bg-[#050912] rounded-full flex-shrink-0 overflow-hidden border border-white/10 flex items-center justify-center">
                            {driver.photoUrl ? (
                                <img src={driver.photoUrl} alt={driver.driverName} className="w-full h-full object-cover" />
                            ) : (
                                <VamoIcon name="user" className="w-6 h-6 text-zinc-500" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black text-white truncate">{driver.driverName}</h3>
                            <div className="flex flex-wrap gap-1 mt-1">
                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-[9px] font-bold text-zinc-300 uppercase">{driver.driverType || 'No informado'}</span>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase",
                                    isSuspended 
                                        ? 'bg-rose-500/20 text-rose-400' 
                                        : isStale 
                                            ? 'bg-amber-500/20 text-amber-500' 
                                            : isOnline 
                                                ? 'bg-[#22c55e]/20 text-[#22c55e]' 
                                                : 'bg-[#1D7CFF]/20 text-[#1D7CFF]'
                                )}>
                                    {isSuspended ? 'SUSPENDIDO' : isStale ? 'INACTIVO' : driver.driverStatus}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 space-y-3 bg-[#050912]/50">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Vehículo</p>
                                <p className="text-xs font-bold text-zinc-200 truncate">{driver.vehicleBrand} {driver.vehicleModel} {driver.vehicleColor ? `(${driver.vehicleColor})` : ''}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Patente</p>
                                <p className="text-xs font-mono font-bold text-[#1D7CFF]">{driver.vehiclePlate}</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Estado Municipal</p>
                            <span className={cn(
                                "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest",
                                driver.municipalStatus?.toLowerCase() === 'active' || driver.municipalStatus?.toLowerCase() === 'habilitado' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' :
                                driver.municipalStatus?.toLowerCase() === 'observado' || driver.municipalStatus?.toLowerCase() === 'pendiente' ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' :
                                driver.municipalStatus?.toLowerCase() === 'bloqueado' || driver.municipalStatus?.toLowerCase() === 'suspended' || driver.municipalStatus?.toLowerCase() === 'suspendido' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' :
                                'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            )}>{driver.municipalStatus || 'No informado'}</span>
                        </div>
                        <div className="border-t border-white/5 pt-3">
                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Documentación</p>
                            {driver.docsComplete ? (
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                    <VamoIcon name="check-circle" className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold">100% Completa</span>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {driver.expiredDocs && driver.expiredDocs.length > 0 && (
                                        <div className="flex items-start gap-1.5 text-rose-400">
                                            <VamoIcon name="alert-triangle" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                            <span className="text-[10px] leading-tight">Vencido: {driver.expiredDocs.join(', ')}</span>
                                        </div>
                                    )}
                                    {driver.missingDocs && driver.missingDocs.length > 0 && (
                                        <div className="flex items-start gap-1.5 text-amber-400">
                                            <VamoIcon name="clock" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                            <span className="text-[10px] leading-tight">Pendiente: {driver.missingDocs.join(', ')}</span>
                                        </div>
                                    )}
                                    {(!driver.expiredDocs?.length && !driver.missingDocs?.length) && (
                                        <span className="text-[10px] text-zinc-400 italic">Estado no informado</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Footer Disclaimer */}
                    <div className="bg-white/5 py-1.5 text-center">
                        <span className="text-[8px] uppercase tracking-widest font-black text-zinc-500 italic">Información actualizada del sistema</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
