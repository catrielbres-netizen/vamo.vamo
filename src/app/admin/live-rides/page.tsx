'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Map, AdvancedMarker, Pin, useMap, MapControl, ControlPosition } from '@vis.gl/react-google-maps';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MapsProvider } from '@/components/MapsProvider';
import { useFunctions, useFirestore, useCollection } from '@/firebase'; 
import { httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, limit, orderBy } from 'firebase/firestore'; 

// Constants for Map Styling & Initial Position
const MAP_ID = 'admin_live_dispatch';
const INITIAL_CENTER = { lat: -43.3000, lng: -65.1000 }; // Rawson/Trelew area

export default function AdminLiveRidesPage() {
    const firestore = useFirestore();
    const functions = useFunctions();
    const { toast } = useToast();
    const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

    // 1. Data Listeners: Rides
    const ridesQuery = useMemo(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'rides'),
            where('status', 'in', ['searching', 'offered', 'driver_assigned', 'accepted', 'arrived', 'picked_up', 'arriving', 'paused']),
            orderBy('updatedAt', 'desc'),
            limit(100)
        );
    }, [firestore]);

    // 2. Data Listeners: Driver Locations
    const driversQuery = useMemo(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'drivers_locations'),
            where('driverStatus', 'in', ['online', 'busy', 'away']),
            limit(200)
        );
    }, [firestore]);

    const { data: activeRides, isLoading: ridesLoading } = useCollection<any>(ridesQuery);
    const { data: driverLocations, isLoading: driversLoading } = useCollection<any>(driversQuery);

    // 3. Admin Actions
    const handleReassign = async (rideId: string) => {
        if (!functions) return;
        setIsActionLoading('reassign');
        try {
            const reassignFn = httpsCallable(functions, 'reassignRideByAdminV1');
            await reassignFn({ rideId });
            toast({ 
                title: 'Éxito',
                description: 'Viaje reasignado. Buscando nuevo chofer...' 
            });
        } catch (error: any) {
            console.error("Reassign error:", error);
            toast({ 
                title: 'Error',
                description: error.message || 'Error al reasignar vía.',
                variant: 'destructive'
            });
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleCancel = async (rideId: string) => {
        if (!functions) return;
        const confirmed = window.confirm("¿Seguro que querés CANCELAR este viaje por administración?");
        if (!confirmed) return;

        setIsActionLoading('cancel');
        try {
            const cancelFn = httpsCallable(functions, 'cancelRideByAdminV1');
            await cancelFn({ rideId });
            toast({
                title: 'Éxito',
                description: 'Viaje cancelado correctamente.'
            });
            setSelectedRideId(null);
        } catch (error: any) {
            console.error("Cancel error:", error);
            toast({
                title: 'Error',
                description: error.message || 'Error al cancelar vía.',
                variant: 'destructive'
            });
        } finally {
            setIsActionLoading(null);
        }
    };

    // 4. KPI Calculations
    const stats = useMemo(() => {
        if (!activeRides || !driverLocations) return { online: 0, busy: 0, searching: 0, inProgress: 0, totalRides: 0 };
        return {
            online: driverLocations.filter((d: any) => d.driverStatus === 'online').length,
            busy: driverLocations.filter((d: any) => d.driverStatus === 'busy').length,
            searching: activeRides.filter((r: any) => r.status === 'searching' || r.status === 'offered').length,
            inProgress: activeRides.filter((r: any) => r.status === 'picked_up' || r.status === 'arriving').length,
            totalRides: activeRides.length
        };
    }, [activeRides, driverLocations]);

    const statusConfig: Record<string, { label: string, color: string, markerColor: string }> = {
        searching: { label: 'Buscando', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', markerColor: '#f59e0b' },
        offered: { label: 'Ofertado', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', markerColor: '#60a5fa' },
        driver_assigned: { label: 'Asignado', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', markerColor: '#818cf8' },
        accepted: { label: 'En Camino', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', markerColor: '#818cf8' },
        arrived: { label: 'En el Punto', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', markerColor: '#10b981' },
        picked_up: { label: 'En Curso', color: 'text-green-500 bg-green-500/10 border-green-500/20', markerColor: '#22c55e' },
        paused: { label: 'Pausado', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20', markerColor: '#71717a' },
    };

    const selectedRide = useMemo(() => activeRides?.find((r: any) => r.id === selectedRideId), [activeRides, selectedRideId]);

    return (
        <MapsProvider>
            <div className="flex h-[calc(100vh-140px)] -m-6 overflow-hidden relative border-t border-white/5">
                {/* Left: Map Monitoring */}
                <div className="flex-1 relative bg-[#0f0f0f]">
                    <Map
                        defaultZoom={13}
                        defaultCenter={INITIAL_CENTER}
                        mapId={MAP_ID}
                        colorScheme="DARK"
                        disableDefaultUI={true}
                        className="w-full h-full"
                    >
                        {/* Driver Markers */}
                        {driverLocations?.map((driver: any) => (
                            <AdvancedMarker
                                key={driver.id}
                                position={{ lat: driver.currentLocation.lat, lng: driver.currentLocation.lng }}
                                title={`Conductor ${driver.id}`}
                            >
                                <div className={cn(
                                    "relative flex items-center justify-center w-8 h-8 rounded-full border-2 shadow-lg transition-transform hover:scale-110",
                                    driver.driverStatus === 'online' ? "bg-emerald-500 border-emerald-400 shadow-emerald-500/40" : "bg-amber-500 border-amber-400 shadow-amber-500/40"
                                )}>
                                    <VamoIcon name="car" className="w-4 h-4 text-white" />
                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0f0f0f] bg-current" />
                                </div>
                            </AdvancedMarker>
                        ))}

                        {/* Ride Markers: Origins & Destinations */}
                        {activeRides?.map((ride: any) => {
                            const config = statusConfig[ride.status] || { markerColor: '#ffffff' };
                            const isSelected = selectedRideId === ride.id;

                            return (
                                <React.Fragment key={ride.id}>
                                    {/* Origin */}
                                    <AdvancedMarker
                                        position={{ lat: ride.origin.lat, lng: ride.origin.lng }}
                                        onClick={() => setSelectedRideId(ride.id)}
                                    >
                                        <Pin background={config.markerColor} borderColor="white" glyphColor="white" scale={isSelected ? 1.2 : 0.8} />
                                    </AdvancedMarker>
                                    
                                    {/* Destination (only for assigned/in_progress) */}
                                    {ride.status !== 'searching' && ride.status !== 'offered' && (
                                        <AdvancedMarker position={{ lat: ride.destination.lat, lng: ride.destination.lng }}>
                                            <div className="w-3 h-3 rounded-full bg-white border-2 border-zinc-800 shadow-md" />
                                        </AdvancedMarker>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        {/* Custom Map Controls */}
                        <MapControl position={ControlPosition.TOP_LEFT}>
                            <div className="m-4 flex flex-col gap-2">
                                <div className="bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl">
                                    <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Monitor Vivo</h2>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5 font-bold text-sm">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span>{stats.online} Online</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 font-bold text-sm">
                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                            <span>{stats.busy} Busy</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </MapControl>
                    </Map>
                </div>

                {/* Right: Dispatch Sidebar */}
                <div className="w-[400px] border-l border-white/5 bg-black/60 backdrop-blur-3xl flex flex-col overflow-hidden">
                    {/* 1. Statistics Header */}
                    <div className="p-6 grid grid-cols-2 gap-3 border-b border-white/5">
                        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Viajes Activos</span>
                            <span className="text-2xl font-black">{stats.totalRides}</span>
                        </div>
                        <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-1">Buscando</span>
                            <span className="text-2xl font-black text-amber-500">{stats.searching}</span>
                        </div>
                    </div>

                    {/* 2. Operational Actions (When selected) */}
                    {selectedRide && (
                        <div className="p-6 border-b border-white/5 bg-primary/5 animate-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">Acciones Operativas</h3>
                                <button onClick={() => setSelectedRideId(null)} className="text-zinc-500 hover:text-white transition-colors">
                                    <VamoIcon name="x" className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    disabled={!!isActionLoading}
                                    onClick={() => handleReassign(selectedRide.id)}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                                >
                                    {isActionLoading === 'reassign' ? <VamoIcon name="loader" className="w-3 h-3 animate-spin" /> : <VamoIcon name="refresh-cw" className="w-3 h-3" />}
                                    Reasignar
                                </button>
                                <button 
                                    disabled={!!isActionLoading}
                                    onClick={() => handleCancel(selectedRide.id)}
                                    className="px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 disabled:opacity-50 p-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                                >
                                    {isActionLoading === 'cancel' ? <VamoIcon name="loader" className="w-3 h-3 animate-spin" /> : <VamoIcon name="trash" className="w-3 h-3" />}
                                    Anular
                                </button>
                            </div>
                            <p className="mt-3 text-[9px] text-zinc-500 font-bold text-center uppercase tracking-tighter opacity-60 italic">
                                Use estas acciones solo en caso de falla del despacho automático.
                            </p>
                        </div>
                    )}

                    {/* 3. Active Rides List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        <div className="flex items-center justify-between px-2 mb-2">
                            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 italic">Cola de Despacho</h3>
                            {(ridesLoading || driversLoading) && <VamoIcon name="loader" className="w-3 h-3 animate-spin text-zinc-600" />}
                        </div>

                        {activeRides?.length === 0 ? (
                            <div className="py-12 text-center flex flex-col items-center">
                                <VamoIcon name="coffee" className="w-8 h-8 text-zinc-800 mb-3" />
                                <p className="text-xs font-bold text-zinc-700 uppercase tracking-widest">Sin actividad operativa</p>
                            </div>
                        ) : (
                            activeRides?.map((ride: any) => {
                                const config = statusConfig[ride.status] || { label: ride.status, color: '' };
                                const isSelected = selectedRideId === ride.id;

                                return (
                                    <Card 
                                        key={ride.id} 
                                        onClick={() => setSelectedRideId(ride.id)}
                                        className={cn(
                                            "group bg-zinc-900/40 border-white/5 rounded-2xl overflow-hidden hover:bg-zinc-900/60 transition-all cursor-pointer",
                                            isSelected && "ring-1 ring-primary/50 border-primary/20 bg-primary/5"
                                        )}
                                    >
                                        <div className="p-4 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-black tracking-tight">{ride.passengerName || 'VamO User'}</span>
                                                        <Badge className={cn("text-[8px] font-black uppercase px-2 py-0 border", config.color)}>
                                                            {config.label}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-[10px] text-zinc-600 font-mono">ID: {ride.id.substring(0, 8)}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-black text-white leading-none">${Math.floor(ride.pricing?.total || 0)}</span>
                                                    <span className="text-[9px] block text-zinc-600 font-bold uppercase mt-0.5">
                                                        {ride.updatedAt?.toDate ? format(ride.updatedAt.toDate(), "HH:mm") : '...'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5 relative pl-3">
                                                <div className="absolute left-0 top-1 bottom-1 w-px bg-zinc-800" />
                                                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                                    <div className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                                                    <p className="line-clamp-1">{ride.origin.address}</p>
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-white/80">
                                                    <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                                                    <p className="line-clamp-1 truncate">{ride.destination.address}</p>
                                                </div>
                                            </div>

                                            {isSelected && ride.driverName && (
                                                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center">
                                                            <VamoIcon name="user" className="w-3 h-3 text-indigo-400" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{ride.driverName}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </MapsProvider>
    );
}

