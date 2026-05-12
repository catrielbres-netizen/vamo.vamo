'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MapsProvider } from '@/components/MapsProvider';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { safeFixed } from '@/lib/formatters';

interface DriverLiveStatus {
    id: string;
    driverName: string;
    driverStatus: 'online' | 'offline' | 'in_ride';
    currentLocation: { lat: number; lng: number };
    lastSeenAt: any;
    driverType?: string;
    municipalStatus: string;
    vehicleBrand: string;
    vehicleModel: string;
    vehiclePlate: string;
    vehicleColor: string;
    docsComplete: boolean;
    missingDocs?: string[];
    expiredDocs?: string[];
    photoUrl?: string;
}

export default function TrafficMapPage() {
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || 'vamo-traffic-tactical';

    const { cityKey, cityName, cityCenter, cityZoom, loading: contextLoading } = useMunicipalContext();
    const router = useRouter();

    // [MAP STABILITY ENGINE]
    const [mapCenter, setMapCenter] = useState(cityCenter);
    const [mapZoom, setMapZoom] = useState(cityZoom);
    const [hasInteracted, setHasInteracted] = useState(false);

    useEffect(() => {
        if (!hasInteracted && cityCenter) {
            setMapCenter(cityCenter);
            setMapZoom(cityZoom);
        }
    }, [cityCenter, cityZoom, hasInteracted]);

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

            {/* Tactical Overlay */}
            <div className="absolute top-6 left-6 z-10 space-y-4">
                <div className="px-6 py-4 bg-zinc-950/90 backdrop-blur-2xl border border-white/5 rounded-[2rem] shadow-2xl">
                    <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Monitoreo de Flota</h2>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">{cityName}</p>
                </div>

                <div className="flex gap-2">
                     <button 
                        onClick={() => router.push('/traffic/drivers')}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
                     >
                        <VamoIcon name="search" className="w-4 h-4" />
                        Buscar Conductor
                     </button>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-10 left-6 z-10 flex flex-col gap-2">
               <LegendItem color="bg-emerald-500" label="Patrullando (Libre)" />
               <LegendItem color="bg-indigo-500" label="En Servicio (Ocupado)" />
               <LegendItem color="bg-zinc-600" label="Fuera de Servicio" />
            </div>
        </div>
    );
}

function LegendItem({ color, label }: { color: string, label: string }) {
    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-950/80 backdrop-blur-md rounded-2xl border border-white/5">
            <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
            <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">{label}</span>
        </div>
    );
}

function TrafficDriversLayer({ cityKey }: { cityKey: string | null | undefined }) {
    const db = useFirestore();
    const map = useMap();
    const router = useRouter();
    const [drivers, setDrivers] = useState<DriverLiveStatus[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const selectedDriver = useMemo(() => drivers.find(d => d.id === selectedDriverId), [drivers, selectedDriverId]);

    useEffect(() => {
        if (!db || !cityKey) return;

        const q = query(
            collection(db, 'drivers_locations'),
            where('driverStatus', 'in', ['online', 'in_ride', 'busy']),
            limit(200)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    driverName: data.driverName || 'Conductor',
                    driverStatus: data.driverStatus || 'offline',
                    currentLocation: data.currentLocation,
                    lastSeenAt: data.lastSeenAt,
                    driverType: data.driverType || 'No informado',
                    municipalStatus: data.municipalStatus || 'No informado',
                    vehicleBrand: data.vehicle?.brand || 'No informado',
                    vehicleModel: data.vehicle?.model || '',
                    vehiclePlate: data.vehicle?.plate || 'No informado',
                    vehicleColor: data.vehicle?.color || '',
                    docsComplete: data.docsComplete,
                    missingDocs: data.missingDocs || [],
                    expiredDocs: data.expiredDocs || [],
                    photoUrl: data.photoUrl || null
                } as DriverLiveStatus;
            }).filter(d => d.currentLocation);

            // Handle Overlaps (Displacement logic)
            const locationCounts: Record<string, number> = {};
            const processed = fetched.map(d => {
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

    return (
        <>
            {drivers.map(driver => (
                <AdvancedMarker
                    key={driver.id}
                    position={driver.driverStatus === 'offline' ? undefined : driver.currentLocation}
                    onClick={() => {
                        setSelectedDriverId(driver.id);
                        console.log("📍 [LIVE_MAP_DRIVER_SELECTED] Traffic:", driver.id);
                    }}
                >
                    <TrafficDriverMarker driver={driver} isSelected={selectedDriverId === driver.id} onClick={() => setSelectedDriverId(driver.id)} />
                </AdvancedMarker>
            ))}

            {/* Selection Sidebar (Traffic) */}
            {selectedDriver && (
                <div className="absolute top-24 right-6 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-white/5 rounded-[2rem] shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Unidad de Control</h3>
                        <button onClick={() => setSelectedDriverId(null)} className="text-zinc-500 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center">
                            {selectedDriver.photoUrl ? <img src={selectedDriver.photoUrl} alt="" className="w-full h-full object-cover" /> : <VamoIcon name="user" className="w-7 h-7 text-zinc-700" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-white truncate text-lg tracking-tighter">{selectedDriver.driverName}</p>
                            <div className="flex gap-1.5 mt-1">
                                <Badge className={cn("text-[8px] font-black uppercase", selectedDriver.driverStatus === 'online' ? "bg-emerald-500/20 text-emerald-500" : "bg-indigo-500/20 text-indigo-400")}>
                                    {selectedDriver.driverStatus === 'online' ? 'LIBRE' : 'EN SERVICIO'}
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
                                <p className={cn("text-xs font-bold uppercase", selectedDriver.municipalStatus === 'active' ? "text-emerald-500" : "text-amber-500")}>
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
                        Posición reportada: {selectedDriver.lastSeenAt?.toDate ? selectedDriver.lastSeenAt.toDate().toLocaleTimeString() : 'N/A'}
                    </p>
                </div>
            )}
        </>
    );
}

function TrafficDriverMarker({ driver, isSelected, onClick }: { driver: DriverLiveStatus, isSelected?: boolean, onClick?: () => void }) {
    const isOnline = driver.driverStatus === 'online';
    const isBusy = driver.driverStatus === 'in_ride';
    const isOffline = driver.driverStatus === 'offline';

    const colorClass = isOnline ? 'bg-[#22c55e]' : isBusy ? 'bg-[#1D7CFF]' : 'bg-[#6b7280]';
    const shadowClass = isOnline ? 'shadow-[0_2px_4px_rgba(0,0,0,0.3)]' : isBusy ? 'shadow-[0_0_12px_rgba(29,124,255,0.6)]' : 'shadow-sm';
    const animationClass = isOnline ? 'animate-pulse' : '';

    return (
        <div 
            className="relative group cursor-pointer pointer-events-auto"
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
        >
            {/* Animación base dependiendo del estado */}
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
                                    isOnline ? 'bg-[#22c55e]/20 text-[#22c55e]' : isBusy ? 'bg-[#1D7CFF]/20 text-[#1D7CFF]' : 'bg-zinc-800 text-zinc-400'
                                )}>{driver.driverStatus}</span>
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
                                driver.municipalStatus?.toLowerCase() === 'bloqueado' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' :
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
