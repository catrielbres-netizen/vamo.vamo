'use client';

import React, { useState, useMemo } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { VamoMarker } from '@/components/VamoMarker';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Types ---
export interface RideLiveStatus {
    id: string;
    passengerId: string;
    passengerName: string;
    status: 'searching' | 'offered' | 'driver_assigned' | 'accepted' | 'arrived' | 'picked_up' | 'in_progress' | 'paused' | 'scheduled';
    serviceType: string;
    origin: { lat: number; lng: number; address: string; zoneName?: string };
    destination: { lat: number; lng: number; address: string };
    pricing?: { estimatedTotal: number; estimatedDistanceMeters: number };
    isSimulation?: boolean;
    isScheduled?: boolean;
    scheduledAt?: any;
    driverId?: string;
    driverName?: string;
}

export function LiveRidesLayer({ rides }: { rides: RideLiveStatus[] }) {
    const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
    const selectedRide = useMemo(() => rides.find(r => r.id === selectedRideId), [rides, selectedRideId]);

    // Ensure rides have valid origin location before trying to map them
    const validRides = rides.filter(r => r.origin && typeof r.origin.lat === 'number' && typeof r.origin.lng === 'number');

    return (
        <>
            {validRides.map(ride => (
                <VamoMarker
                    key={ride.id}
                    position={{ lat: ride.origin.lat, lng: ride.origin.lng }}
                    onClick={() => {
                        setSelectedRideId(ride.id);
                        console.log("📍 [LIVE_MAP_RIDE_SELECTED]:", ride.id);
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
                            <p className="font-black text-white truncate">{selectedRide.passengerName || 'Pasajero'}</p>
                            <div className="flex gap-1.5 items-center mt-1">
                                <Badge className={cn("text-[8px] font-black uppercase", selectedRide.status === 'scheduled' ? "bg-purple-500/20 text-purple-400" : "bg-amber-500/20 text-amber-400")}>
                                    {selectedRide.status === 'scheduled' ? 'Reserva' : selectedRide.status}
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
                                <p className="text-xs font-bold uppercase text-indigo-400">{selectedRide.serviceType || 'professional'}</p>
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
    const isScheduled = ride.status === 'scheduled';
    const isPool = ride.serviceType === 'pool';

    let colorClass = 'bg-[#10b981] border border-white/40';
    let shadowClass = 'shadow-[0_0_12px_rgba(16,185,129,0.6)]';
    let animationClass = '';

    if (isSearching) {
        colorClass = 'bg-[#f59e0b]';
        shadowClass = 'shadow-[0_0_12px_rgba(245,158,11,0.6)]';
        animationClass = 'animate-pulse';
    } else if (isScheduled) {
        colorClass = 'bg-purple-500';
        shadowClass = 'shadow-[0_0_12px_rgba(168,85,247,0.6)]';
    }

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
                <div className={cn("w-[260px] bg-[#0B1220] border shadow-[0_10px_40px_rgba(0,0,0,0.8)] rounded-2xl p-4 flex flex-col pointer-events-none", isScheduled ? "border-purple-500/25" : isSearching ? "border-[#f59e0b]/25" : "border-[#10b981]/25")}>
                    <h4 className="text-xs font-black text-white truncate">{ride.passengerName || 'Pasajero'}</h4>
                    <p className={cn("text-[9px] font-bold uppercase mt-1 tracking-widest", isScheduled ? "text-purple-400" : isSearching ? "text-[#f59e0b]" : "text-[#10b981]")}>
                        {isScheduled ? 'Reserva Próxima' : ride.status}
                    </p>
                    <div className="border-t border-white/5 mt-2 pt-2 text-[9px] text-zinc-400 space-y-1">
                        <p className="truncate"><span className="font-bold text-zinc-500">De:</span> {ride.origin?.address || 'No informado'}</p>
                        <p className="truncate"><span className="font-bold text-zinc-500">A:</span> {ride.destination?.address || 'No informado'}</p>
                        <p><span className="font-bold text-zinc-500">Tipo:</span> <span className="uppercase font-bold text-indigo-400">{ride.serviceType || 'professional'}</span></p>
                        {isScheduled && ride.scheduledAt && (
                            <p><span className="font-bold text-purple-400">Hora:</span> {ride.scheduledAt?.toDate ? format(ride.scheduledAt.toDate(), "HH:mm'hs' d/M/yy") : 'Pendiente'}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Taxi Stands Layer ---

export function TaxiStandsLayer({ stands }: { stands: any[] }) {
    const [selectedStandId, setSelectedStandId] = useState<string | null>(null);
    const selectedStand = useMemo(() => stands.find(s => s.id === selectedStandId), [stands, selectedStandId]);

    // Ensure valid coordinates using safe parsing for GeoPoint and plain objects
    const validStands = stands.map(s => {
        const lat = s.location?.lat ?? s.location?.latitude ?? s.location?._latitude;
        const lng = s.location?.lng ?? s.location?.longitude ?? s.location?._longitude;
        return { ...s, normalizedLocation: { lat, lng } };
    }).filter(s => typeof s.normalizedLocation.lat === 'number' && typeof s.normalizedLocation.lng === 'number');

    return (
        <>
            {validStands.map(stand => (
                <VamoMarker
                    key={stand.id}
                    position={{ lat: stand.normalizedLocation.lat, lng: stand.normalizedLocation.lng }}
                    onClick={() => {
                        setSelectedStandId(stand.id);
                        console.log("📍 [LIVE_MAP_STAND_SELECTED]:", stand.id);
                    }}
                >
                    <StandMarker stand={stand} isSelected={selectedStandId === stand.id} onClick={() => setSelectedStandId(stand.id)} />
                </VamoMarker>
            ))}

            {/* Selection Sidebar (Stands) */}
            {selectedStand && (
                <div className="absolute top-24 right-6 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-sky-500">Parada Oficial</h3>
                        <button onClick={() => setSelectedStandId(null)} className="text-zinc-500 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center">
                            <VamoIcon name="map-pin" className="w-6 h-6 text-sky-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-white truncate">{selectedStand.name || 'Parada Sin Nombre'}</p>
                            <div className="flex gap-1.5 items-center mt-1">
                                <Badge className={cn("text-[8px] font-black uppercase", selectedStand.status === 'active' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                                    {selectedStand.status === 'active' ? 'Operativa' : 'Inactiva'}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Operador Físico</p>
                            <p className="text-xs font-bold uppercase text-white">
                                {selectedStand.hasOperator ? 'Sí (Con Operador)' : 'No (Automática)'}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Radio</p>
                                <p className="text-xs font-bold text-sky-400">{selectedStand.radiusMeters || 500} metros</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function StandMarker({ stand, isSelected, onClick }: { stand: any, isSelected?: boolean, onClick?: () => void }) {
    const isActive = stand.status === 'active';
    const colorClass = isActive ? 'bg-sky-500' : 'bg-zinc-600';
    const shadowClass = isActive ? 'shadow-[0_0_12px_rgba(14,165,233,0.6)]' : 'shadow-sm';

    return (
        <div 
            className="relative group cursor-pointer pointer-events-auto"
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
        >
            <div className={cn(
                "relative flex items-center justify-center w-10 h-10 rounded-2xl border-[2px] border-white/90 transition-all duration-300 transform group-hover:scale-110",
                isSelected ? "scale-125 ring-4 ring-white/20 z-50 border-white" : "",
                colorClass,
                shadowClass
            )}>
                <VamoIcon name="map-pin" className="h-5 w-5 text-white drop-shadow-sm" />
            </div>

            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 origin-bottom scale-95 group-hover:scale-100">
                <div className="w-[200px] bg-[#0B1220] border border-sky-500/25 shadow-[0_10px_40px_rgba(0,0,0,0.8)] rounded-2xl p-3 flex flex-col pointer-events-none text-center">
                    <h4 className="text-xs font-black text-white truncate">{stand.name || 'Parada'}</h4>
                    <p className={cn("text-[9px] font-bold uppercase mt-1 tracking-widest", isActive ? "text-sky-400" : "text-zinc-500")}>
                        {isActive ? 'Operativa' : 'Inactiva'}
                    </p>
                </div>
            </div>
        </div>
    );
}

// --- Alerts Layer ---

export function AlertsLayer({ alerts }: { alerts: any[] }) {
    const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
    const selectedAlert = useMemo(() => alerts.find(a => a.id === selectedAlertId), [alerts, selectedAlertId]);

    // Ensure valid coordinates
    const validAlerts = alerts.map(a => {
        const lat = a.location?.lat ?? a.location?.latitude ?? a.location?._latitude;
        const lng = a.location?.lng ?? a.location?.longitude ?? a.location?._longitude;
        return { ...a, normalizedLocation: { lat, lng } };
    }).filter(a => typeof a.normalizedLocation.lat === 'number' && typeof a.normalizedLocation.lng === 'number' && !a.resolved);

    return (
        <>
            {validAlerts.map(alert => (
                <VamoMarker
                    key={alert.id}
                    position={{ lat: alert.normalizedLocation.lat, lng: alert.normalizedLocation.lng }}
                    onClick={() => {
                        setSelectedAlertId(alert.id);
                        console.log("📍 [LIVE_MAP_ALERT_SELECTED]:", alert.id);
                    }}
                >
                    <AlertMarker alert={alert} isSelected={selectedAlertId === alert.id} onClick={() => setSelectedAlertId(alert.id)} />
                </VamoMarker>
            ))}

            {/* Selection Sidebar (Alerts) */}
            {selectedAlert && (
                <div className="absolute top-24 right-6 w-80 bg-zinc-950/90 backdrop-blur-2xl border border-red-500/30 rounded-[2rem] shadow-2xl p-6 animate-in slide-in-from-right-4 duration-300 z-50">
                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2 text-red-500">
                            <VamoIcon name="shield-alert" className="w-4 h-4 animate-pulse" />
                            <h3 className="text-[10px] font-black uppercase tracking-widest">Alerta de Pánico</h3>
                        </div>
                        <button onClick={() => setSelectedAlertId(null)} className="text-zinc-500 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-4 mb-4">
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                            <p className="text-[8px] font-black text-red-400 uppercase mb-1">Origen de Alerta</p>
                            <p className="text-xs font-bold text-white uppercase">
                                {selectedAlert.triggeredByRole === 'driver' ? 'Conductor' : 'Pasajero'}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Viaje ID</p>
                                <p className="text-[10px] font-bold text-zinc-300 truncate">
                                    {selectedAlert.rideId ? selectedAlert.rideId.slice(0, 8) : 'N/A'}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Estado</p>
                                <p className="text-xs font-bold text-red-400 animate-pulse">ACTIVA</p>
                            </div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Hora</p>
                            <p className="text-xs font-bold text-white">
                                {selectedAlert.createdAt?.toDate ? format(selectedAlert.createdAt.toDate(), "HH:mm'hs' d/M/yy", { locale: es }) : 'Reciente'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function AlertMarker({ alert, isSelected, onClick }: { alert: any, isSelected?: boolean, onClick?: () => void }) {
    return (
        <div 
            className="relative group cursor-pointer pointer-events-auto"
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
        >
            <div className={cn(
                "relative flex items-center justify-center w-12 h-12 rounded-full border-[2px] border-white/90 transition-all duration-300 transform group-hover:scale-110",
                isSelected ? "scale-125 ring-4 ring-white/20 z-50 border-white" : "",
                "bg-red-600 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.8)]"
            )}>
                <VamoIcon name="shield-alert" className="h-6 w-6 text-white drop-shadow-sm" />
            </div>

            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 origin-bottom scale-95 group-hover:scale-100">
                <div className="w-[200px] bg-[#0B1220] border border-red-500/50 shadow-[0_10px_40px_rgba(220,38,38,0.8)] rounded-2xl p-3 flex flex-col pointer-events-none text-center">
                    <h4 className="text-xs font-black text-red-500 truncate uppercase">Emergencia</h4>
                    <p className="text-[9px] font-bold uppercase mt-1 tracking-widest text-white">
                        {alert.triggeredByRole === 'driver' ? 'Conductor' : 'Pasajero'}
                    </p>
                </div>
            </div>
        </div>
    );
}
