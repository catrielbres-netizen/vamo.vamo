'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MapsProvider } from '@/components/MapsProvider';
import { VamoIcon } from '@/components/VamoIcon';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { VamoMarker } from '@/components/VamoMarker';
import { Badge } from '@/components/ui/badge';
import { useLiveDriversMap } from '@/hooks/useLiveDriversMap';

// --- Types ---
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

export default function MunicipalMapPage() {
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || 'vamo-muni-tactical';


    const { cityKey, cityName, cityCenter, cityZoom, loading: contextLoading } = useMunicipalContext();

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
            console.log("📍 [LIVE_MAP_USER_INTERACTION] Municipal User interacted.");
            setHasInteracted(true);
        }
    };

    if (contextLoading) return <div className="h-screen flex items-center justify-center bg-black"><VamoIcon name="loader" className="h-8 w-8 animate-spin text-indigo-500" /></div>;

    return (
        <div className="h-[calc(100vh-80px)] w-full relative overflow-hidden rounded-3xl border border-white/5 bg-zinc-950">
            <Map
                defaultCenter={mapCenter}
                defaultZoom={mapZoom}
                onCenterChanged={(e) => {
                    setMapCenter(e.detail.center);
                    setHasInteracted(true);
                    console.log("📍 [LIVE_MAP_CENTER_CHANGED] Municipal:", e.detail.center);
                }}
                onZoomChanged={(e) => {
                    setMapZoom(e.detail.zoom);
                    setHasInteracted(true);
                    console.log("📍 [LIVE_MAP_ZOOM_CHANGED] Municipal:", e.detail.zoom);
                }}
                mapId={MAP_ID}
                disableDefaultUI={false}
                gestureHandling={'greedy'}
                className="w-full h-full"
                colorScheme="DARK"
            >
                <MunicipalDriversLayer cityKey={cityKey} />
                <MunicipalRidesLayer cityKey={cityKey} />
            </Map>

            {/* Tactical Overlay */}
            <div className="absolute top-6 left-6 z-10 space-y-2">
                <div className="px-4 py-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                    <h2 className="text-lg font-black text-white tracking-tight">Mapa Operativo: {cityName}</h2>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Monitoreo en Tiempo Real</p>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-10 left-6 z-10 flex gap-2 flex-wrap max-w-lg">
               <LegendItem color="bg-emerald-500" label="Libre" />
               <LegendItem color="bg-indigo-500" label="En Viaje" />
               <LegendItem color="bg-[#f59e0b] animate-pulse" label="Buscando Conductor" />
               <LegendItem color="bg-emerald-500 border border-white/40" label="Viaje Activo" />
               <LegendItem color="bg-zinc-600" label="Desconectado" />
            </div>
        </div>
    );
}

function LegendItem({ color, label }: { color: string, label: string }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/5">
            <div className={cn("w-2 h-2 rounded-full", color)} />
            <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{label}</span>
        </div>
    );
}

function MunicipalDriversLayer({ cityKey }: { cityKey: string | null }) {
    const map = useMap();
    const { drivers, debugDrivers, rawCounts } = useLiveDriversMap(cityKey);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const selectedDriver = useMemo(() => drivers.find((d: any) => d.driverId === selectedDriverId), [drivers, selectedDriverId]);
    const router = useRouter();
    
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === 'true';

    return (
        <>
            {drivers.filter((d: any) => d.visibleOnMap).map((driver: any) => {
                return (
                    <VamoMarker
                        key={driver.driverId}
                        position={driver.location}
                        onClick={() => {
                            setSelectedDriverId(driver.driverId);
                            console.log("📍 [LIVE_MAP_DRIVER_SELECTED] Municipal:", driver.driverId);
                        }}
                    >
                        <DriverMarker driver={driver} isSelected={selectedDriverId === driver.driverId} onClick={() => setSelectedDriverId(driver.driverId)} />
                    </VamoMarker>
                );
            })}

            {/* Selection Sidebar (Municipal) */}
            {selectedDriver && (
                <div className="absolute top-24 right-6 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Detalle Operativo</h3>
                        <button onClick={() => setSelectedDriverId(null)} className="text-zinc-500 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center">
                            {selectedDriver.photoUrl ? <img src={selectedDriver.photoUrl} alt="" className="w-full h-full object-cover" /> : <VamoIcon name="user" className="w-6 h-6 text-zinc-700" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-white truncate">{selectedDriver.displayName}</p>
                            <Badge className={cn("text-[8px] font-black uppercase mt-1", selectedDriver.liveStatus === 'online' ? "bg-emerald-500/20 text-emerald-500" : "bg-indigo-500/20 text-indigo-400")}>
                                {selectedDriver.liveStatus}
                            </Badge>
                        </div>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Patente</p>
                                <p className="text-xs font-mono font-bold text-indigo-400">{selectedDriver.plate}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Estado</p>
                                <p className={cn("text-xs font-bold uppercase", selectedDriver.municipalStatus === 'active' ? "text-emerald-500" : "text-amber-500")}>
                                    {selectedDriver.municipalStatus || 'N/A'}
                                </p>
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Vehículo</p>
                            <p className="text-xs font-bold text-white truncate">{selectedDriver.vehicleBrand} {selectedDriver.vehicleModel}</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => {
                            console.log("📍 [LIVE_MAP_DRIVER_DETAIL_OPEN] Municipal:", selectedDriver.driverId);
                            router.push(`/municipal/drivers/${selectedDriver.driverId}`);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-12 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                    >
                        Ver Perfil Municipal
                    </button>
                </div>
            )}
            {/* Debug Overlay */}
            {isDebug && (
                <div className="absolute bottom-6 right-6 z-50 w-96 bg-black/90 border border-red-500/50 p-4 rounded-xl text-xs font-mono text-zinc-300 max-h-[400px] overflow-y-auto">
                    <h3 className="text-red-400 font-bold mb-2 uppercase tracking-widest border-b border-red-500/20 pb-2">Debug Panel Muni</h3>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div>Users: <span className="text-white">{rawCounts?.users}</span></div>
                        <div>Locations: <span className="text-white">{rawCounts?.locations}</span></div>
                        <div>Profiles: <span className="text-white">{rawCounts?.profiles}</span></div>
                        <div>Rides: <span className="text-white">{rawCounts?.rides}</span></div>
                    </div>
                    <div className="space-y-3">
                        {debugDrivers?.slice(0, 20).map((d: any) => (
                            <div key={d.driverId} className="border border-white/10 p-2 rounded bg-white/5">
                                <div className="font-bold text-white mb-1">{d.displayName} ({d.driverId.slice(0,5)}...)</div>
                                <div>U:<span className={d._debug.hasUser ? "text-green-400" : "text-red-400"}>{d._debug.hasUser?"Y":"N"}</span> ({d._debug.userStatus}) 
                                L:<span className={d._debug.hasLocation ? "text-green-400" : "text-red-400"}>{d._debug.hasLocation?"Y":"N"}</span> ({d._debug.locStatus}) 
                                P:<span className={d._debug.hasProfile ? "text-green-400" : "text-red-400"}>{d._debug.hasProfile?"Y":"N"}</span>
                                </div>
                                <div className="mt-1">
                                    Map: <span className={d.visibleOnMap ? "text-green-400" : "text-red-400"}>{d.visibleOnMap?"Y":"N"}</span> | 
                                    List: <span className={d.visibleInSideList ? "text-green-400" : "text-red-400"}>{d.visibleInSideList?"Y":"N"}</span>
                                </div>
                                {(!d.visibleOnMap && !d.visibleInSideList) && (
                                    <div className="text-red-400 mt-1 truncate">Discard: {d._debug.discardReason}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

function DriverMarker({ driver, isSelected, onClick }: { driver: any, isSelected?: boolean, onClick?: () => void }) {
    const isOnline = driver.liveStatus === 'online';
    const isBusy = driver.liveStatus === 'in_ride';

    const colorClass = isOnline ? (driver.locationStale ? 'bg-amber-500' : 'bg-[#22c55e]') : isBusy ? 'bg-[#1D7CFF]' : driver.isSuspended ? 'bg-rose-500' : 'bg-[#6b7280]';
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
                            <h3 className="text-sm font-black text-white truncate">{driver.displayName}</h3>
                            <div className="flex flex-wrap gap-1 mt-1">
                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-[9px] font-bold text-zinc-300 uppercase">{driver.driverSubtype || 'No informado'}</span>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase",
                                    isOnline ? 'bg-[#22c55e]/20 text-[#22c55e]' : isBusy ? 'bg-[#1D7CFF]/20 text-[#1D7CFF]' : 'bg-zinc-800 text-zinc-400'
                                )}>{driver.liveStatus}</span>
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
                                <p className="text-xs font-mono font-bold text-[#1D7CFF]">{driver.plate}</p>
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

// ─── Live Rides Layer Component ────────────────────────────────────────────────
interface RideLiveStatus {
    id: string;
    passengerId: string;
    passengerName: string;
    status: 'searching' | 'offered' | 'driver_assigned' | 'accepted' | 'arrived' | 'picked_up' | 'in_progress' | 'paused';
    serviceType: string;
    origin: { lat: number; lng: number; address: string; zoneName?: string };
    destination: { lat: number; lng: number; address: string };
    pricing?: { estimatedTotal: number; estimatedDistanceMeters: number };
    isSimulation?: boolean;
    driverId?: string;
    driverName?: string;
}

function MunicipalRidesLayer({ cityKey }: { cityKey: string | null }) {
    const db = useFirestore();
    const [rides, setRides] = useState<RideLiveStatus[]>([]);
    const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
    const selectedRide = useMemo(() => rides.find(r => r.id === selectedRideId), [rides, selectedRideId]);

    useEffect(() => {
        if (!db || !cityKey) return;

        console.log(`[TAKTIK_MAP] Subscribing to active rides in ${cityKey}`);
        
        const q = query(
            collection(db, 'rides'),
            where('cityKey', '==', cityKey),
            where('status', 'in', ['searching', 'offered', 'driver_assigned', 'accepted', 'in_progress', 'arrived', 'picked_up']),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => {
                const data = doc.data();
                let originLoc = null;
                if (data.origin) {
                    const lat = Number(data.origin.latitude ?? data.origin.lat);
                    const lng = Number(data.origin.longitude ?? data.origin.lng);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        originLoc = { ...data.origin, lat, lng };
                    }
                }
                let destLoc = null;
                if (data.destination) {
                    const lat = Number(data.destination.latitude ?? data.destination.lat);
                    const lng = Number(data.destination.longitude ?? data.destination.lng);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        destLoc = { ...data.destination, lat, lng };
                    }
                }
                return {
                    id: doc.id,
                    passengerId: data.passengerId,
                    passengerName: data.passengerName || 'Pasajero',
                    status: data.status,
                    serviceType: data.serviceType || 'professional',
                    origin: originLoc,
                    destination: destLoc,
                    pricing: data.pricing,
                    isSimulation: data.isSimulation || false,
                    driverId: data.driverId,
                    driverName: data.driverName
                } as any;
            }).filter(r => r.origin !== null);

            setRides(fetched);
        });

        return () => unsubscribe();
    }, [db, cityKey]);

    return (
        <>
            {rides.map(ride => (
                <VamoMarker
                    key={ride.id}
                    position={{ lat: ride.origin.lat, lng: ride.origin.lng }}
                    onClick={() => {
                        setSelectedRideId(ride.id);
                        console.log("📍 [LIVE_MAP_RIDE_SELECTED] Municipal:", ride.id);
                    }}
                >
                    <RideMarker ride={ride} isSelected={selectedRideId === ride.id} onClick={() => setSelectedRideId(ride.id)} />
                </VamoMarker>
            ))}

            {/* Selection Sidebar (Rides) */}
            {selectedRide && (
                <div className="absolute top-24 right-6 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-500">Detalle del Viaje</h3>
                        <button onClick={() => setSelectedRideId(null)} className="text-zinc-500 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center">
                            <VamoIcon name="user" className="w-6 h-6 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-white truncate">{selectedRide.passengerName}</p>
                            <div className="flex gap-1.5 items-center mt-1">
                                <Badge className="text-[8px] font-black uppercase bg-amber-500/20 text-amber-400">
                                    {selectedRide.status}
                                </Badge>
                                {selectedRide.isSimulation && (
                                    <Badge className="text-[8px] font-black uppercase bg-purple-500/20 text-purple-400">
                                        SIMULACIÓN
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Origen</p>
                            <p className="text-xs font-bold text-white truncate">{selectedRide.origin?.address || 'No informado'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Destino</p>
                            <p className="text-xs font-bold text-white truncate">{selectedRide.destination?.address || 'No informado'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Servicio</p>
                                <p className="text-xs font-bold uppercase text-indigo-400">{selectedRide.serviceType}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Costo Estimado</p>
                                <p className="text-xs font-bold text-emerald-400">
                                    ${selectedRide.pricing?.estimatedTotal || 0}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function RideMarker({ ride, isSelected, onClick }: { ride: RideLiveStatus, isSelected?: boolean, onClick?: () => void }) {
    const isSearching = ride.status === 'searching' || ride.status === 'offered';
    const isPool = ride.serviceType === 'pool';

    const colorClass = isSearching ? 'bg-[#f59e0b]' : 'bg-[#10b981] border border-white/40';
    const shadowClass = isSearching ? 'shadow-[0_0_12px_rgba(245,158,11,0.6)]' : 'shadow-[0_0_12px_rgba(16,185,129,0.6)]';
    const animationClass = isSearching ? 'animate-pulse' : '';

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
                <VamoIcon name={isPool ? "users" : "user"} className="h-4 w-4 text-white drop-shadow-sm" />
            </div>

            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 origin-bottom scale-95 group-hover:scale-100">
                <div className="w-[260px] bg-[#0B1220] border border-[#f59e0b]/25 shadow-[0_10px_40px_rgba(0,0,0,0.8)] rounded-2xl p-4 flex flex-col pointer-events-none">
                    <h4 className="text-xs font-black text-white truncate">{ride.passengerName}</h4>
                    <p className="text-[9px] text-[#f59e0b] font-bold uppercase mt-1 tracking-widest">{ride.status}</p>
                    <div className="border-t border-white/5 mt-2 pt-2 text-[9px] text-zinc-400 space-y-1">
                        <p className="truncate"><span className="font-bold text-zinc-500">De:</span> {ride.origin?.address || 'No informado'}</p>
                        <p className="truncate"><span className="font-bold text-zinc-500">A:</span> {ride.destination?.address || 'No informado'}</p>
                        <p><span className="font-bold text-zinc-500">Tipo:</span> <span className="uppercase font-bold text-indigo-400">{ride.serviceType}</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
