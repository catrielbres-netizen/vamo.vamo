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
import { LiveRidesLayer, TaxiStandsLayer, AlertsLayer } from '@/components/LiveMapLayers';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

function normalizeSubtype(st: string | undefined | null) {
    if (!st) return 'Sin clasificar';
    const s = st.toLowerCase().trim();
    if (s === 'taxi') return 'Taxi';
    if (s === 'remis' || s === 'remís' || s === 'remise') return 'Remís';
    if (s === 'express' || s === 'particular' || s === 'private') return 'Particular';
    if (s === 'professional') return 'Taxi / Remís';
    return 'Sin clasificar';
}

export default function MunicipalMapPage() {
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || 'vamo-muni-tactical';

    const { cityKey, cityName, cityCenter, cityZoom, loading: contextLoading } = useMunicipalContext();
    const liveData = useLiveDriversMap(cityKey);

    // [MAP STABILITY ENGINE]
    const [mapCenter, setMapCenter] = useState(cityCenter);
    const [mapZoom, setMapZoom] = useState(cityZoom);
    const [hasInteracted, setHasInteracted] = useState(false);
    
    // [LAYERS STATE]
    const [layers, setLayers] = useState({
        taxis: true,
        remises: true,
        particulares: true,
        freeDrivers: true,
        busyDrivers: true,
        searchingRides: true,
        activeRides: true,
        scheduledRides: false,
        taxiStands: true,
        offlineDrivers: false,
        alerts: true
    });

    useEffect(() => {
        if (!hasInteracted && cityCenter) {
            setMapCenter(cityCenter);
            setMapZoom(cityZoom);
        }
    }, [cityCenter, cityZoom, hasInteracted]);

    const filteredRides = useMemo(() => {
        if (!liveData.activeRides) return [];
        return liveData.activeRides.filter((r: any) => {
            if (!layers.searchingRides && (r.status === 'searching' || r.status === 'offered')) return false;
            if (!layers.scheduledRides && r.status === 'scheduled') return false;
            if (!layers.activeRides && !['searching', 'offered', 'scheduled'].includes(r.status)) return false;
            return true;
        });
    }, [liveData.activeRides, layers.searchingRides, layers.scheduledRides, layers.activeRides]);

    const handleMapInteraction = () => {
        if (!hasInteracted) {
            console.log("📍 [LIVE_MAP_USER_INTERACTION] Municipal User interacted.");
            setHasInteracted(true);
        }
    };

    if (contextLoading) return <div className="h-screen flex items-center justify-center bg-black"><VamoIcon name="loader" className="h-8 w-8 animate-spin text-indigo-500" /></div>;

    if (!cityKey) {
        return (
            <div className="h-[calc(100vh-80px)] w-full flex flex-col items-center justify-center bg-zinc-950 border border-white/5 rounded-3xl">
                <VamoIcon name="map-pin" className="h-12 w-12 text-zinc-700 mb-4" />
                <h2 className="text-xl font-black text-white uppercase tracking-widest">Sin Ciudad Asignada</h2>
                <p className="text-sm text-zinc-500 mt-2 max-w-md text-center">
                    Su usuario municipal no tiene una ciudad vinculada para operar el mapa táctico.
                </p>
            </div>
        );
    }

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
                <MunicipalDriversLayer 
                    drivers={liveData.drivers} 
                    debugDrivers={liveData.debugDrivers} 
                    rawCounts={liveData.rawCounts} 
                    layers={layers} 
                />
                <LiveRidesLayer rides={filteredRides} />
                {layers.taxiStands && <TaxiStandsLayer stands={liveData.taxiStands} />}
                {layers.alerts && <AlertsLayer alerts={liveData.panicAlerts} />}
            </Map>

            {/* Tactical Overlay */}
            <div className="absolute top-6 left-6 z-10 space-y-2 pointer-events-auto">
                <div className="px-4 py-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                    <h2 className="text-lg font-black text-white tracking-tight">Mapa Operativo: {cityName}</h2>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Monitoreo en Tiempo Real</p>
                </div>
                
                <Popover>
                    <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 px-4 py-2 rounded-2xl shadow-2xl border bg-black/80 backdrop-blur-xl border-white/10 text-zinc-300 hover:text-white transition-all w-full justify-center">
                            <VamoIcon name="layers" className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Capas del Mapa</span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 bg-zinc-950/95 backdrop-blur-3xl border-white/10 rounded-2xl p-4 shadow-2xl z-50 ml-6" align="start" sideOffset={8}>
                        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 border-b border-white/10 pb-2">Filtros Avanzados</h3>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Conductores</h4>
                                <LayerToggle id="freeDrivers" label="Libres (Online)" checked={layers.freeDrivers} onChange={(v) => setLayers(p => ({ ...p, freeDrivers: v }))} />
                                <LayerToggle id="busyDrivers" label="En Viaje (Ocupados)" checked={layers.busyDrivers} onChange={(v) => setLayers(p => ({ ...p, busyDrivers: v }))} />
                                <LayerToggle id="offlineDrivers" label="Desconectados" checked={layers.offlineDrivers} onChange={(v) => setLayers(p => ({ ...p, offlineDrivers: v }))} />
                            </div>
                            
                            <div className="space-y-2">
                                <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Tipos de Servicio</h4>
                                <LayerToggle id="taxis" label="Taxis" checked={layers.taxis} onChange={(v) => setLayers(p => ({ ...p, taxis: v }))} />
                                <LayerToggle id="remises" label="Remises" checked={layers.remises} onChange={(v) => setLayers(p => ({ ...p, remises: v }))} />
                                <LayerToggle id="particulares" label="Particulares (Express)" checked={layers.particulares} onChange={(v) => setLayers(p => ({ ...p, particulares: v }))} />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Viajes</h4>
                                <LayerToggle id="activeRides" label="Viajes Activos" checked={layers.activeRides} onChange={(v) => setLayers(p => ({ ...p, activeRides: v }))} />
                                <LayerToggle id="searchingRides" label="Buscando Conductor" checked={layers.searchingRides} onChange={(v) => setLayers(p => ({ ...p, searchingRides: v }))} />
                                <LayerToggle id="scheduledRides" label="Reservas Próximas" checked={layers.scheduledRides} onChange={(v) => setLayers(p => ({ ...p, scheduledRides: v }))} />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Infraestructura</h4>
                                <LayerToggle id="taxiStands" label="Paradas Oficiales" checked={layers.taxiStands} onChange={(v) => setLayers(p => ({ ...p, taxiStands: v }))} />
                                <LayerToggle id="alerts" label="Alertas de Pánico" checked={layers.alerts} onChange={(v) => setLayers(p => ({ ...p, alerts: v }))} />
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Legend */}
            <div className="absolute bottom-10 left-6 z-10 flex gap-2 flex-wrap max-w-lg">
               <LegendItem color="bg-emerald-500" label="Libre" />
               <LegendItem color="bg-indigo-500" label="En Viaje" />
               <LegendItem color="bg-[#f59e0b] animate-pulse" label="Buscando" />
               <LegendItem color="bg-emerald-500 border border-white/40" label="Viaje Activo" />
               <LegendItem color="bg-purple-500" label="Reserva" />
               <LegendItem color="bg-sky-500 border-2 border-white/90" label="Parada Oficial" />
               <LegendItem color="bg-red-600 animate-pulse" label="Alerta" />
               {layers.offlineDrivers && <LegendItem color="bg-zinc-600" label="Desconectado" />}
            </div>
        </div>
    );
}

function LayerToggle({ id, label, checked, onChange }: { id: string, label: string, checked: boolean, onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between">
            <Label htmlFor={id} className="text-[10px] font-bold text-zinc-300 cursor-pointer">{label}</Label>
            <Switch id={id} checked={checked} onCheckedChange={onChange} className="scale-75 data-[state=checked]:bg-indigo-500" />
        </div>
    );
}

function LegendItem({ color, label }: { color: string, label: string }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/5">
            <div className={cn("w-3 h-3 rounded-full", color)} />
            <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{label}</span>
        </div>
    );
}

function MunicipalDriversLayer({ drivers, debugDrivers, rawCounts, layers }: { drivers: any[], debugDrivers: any[], rawCounts: any, layers: any }) {
    const map = useMap();
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const selectedDriver = useMemo(() => drivers?.find((d: any) => d.driverId === selectedDriverId), [drivers, selectedDriverId]);
    const router = useRouter();
    
    const searchParams = useSearchParams();
    const isDebug = searchParams.get('debug') === 'true';

    const filteredDrivers = useMemo(() => {
        if (!drivers) return [];
        return drivers.filter((d: any) => {
            if (!d.visibleOnMap) return false;
            if (!layers.offlineDrivers && d.liveStatus === 'offline' && !d.isSuspended) return false;
            if (!layers.freeDrivers && d.liveStatus === 'online') return false;
            if (!layers.busyDrivers && d.liveStatus === 'in_ride') return false;
            
            const norm = normalizeSubtype(d.driverSubtype);
            if (!layers.taxis && (norm === 'Taxi' || norm === 'Taxi / Remís')) return false;
            if (!layers.remises && (norm === 'Remís' || norm === 'Taxi / Remís')) return false;
            if (!layers.particulares && norm === 'Particular') return false;
            return true;
        });
    }, [
        drivers, 
        layers.offlineDrivers, 
        layers.freeDrivers, 
        layers.busyDrivers, 
        layers.taxis, 
        layers.remises, 
        layers.particulares
    ]);

    return (
        <>
            {filteredDrivers.map((driver: any) => {
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
                        <div>Stands: <span className="text-white">{rawCounts?.stands}</span></div>
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
