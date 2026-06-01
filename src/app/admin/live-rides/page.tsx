'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { MapsProvider } from '@/components/MapsProvider';
import { useFunctions, useFirestore, useCollection } from '@/firebase'; 
import { VamoMarker } from '@/components/VamoMarker';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, limit, orderBy } from 'firebase/firestore'; 
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { safeFixed } from '@/lib/formatters';

const MAP_ID = 'admin_live_dispatch';

export default function AdminLiveRidesPage() {
    const router = useRouter();
    const firestore = useFirestore();
    const functions = useFunctions();
    const { toast } = useToast();
    const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

    const { cityKey: activeCityKey, cityName, cityCenter, cityZoom } = useMunicipalContext();

    const ridesQuery = useMemo(() => {
        if (!firestore) return null;
        const constraints = [
            where('status', 'in', ['searching', 'offered', 'driver_assigned', 'accepted', 'arrived', 'picked_up', 'arriving', 'paused']),
            orderBy('updatedAt', 'desc'),
            limit(100)
        ];
        if (activeCityKey) constraints.push(where('cityKey', '==', activeCityKey));
        return query(collection(firestore, 'rides'), ...constraints);
    }, [firestore, activeCityKey]);

    const driversQuery = useMemo(() => {
        if (!firestore) return null;
        const constraints = [
            where('driverStatus', 'in', ['online', 'busy', 'away']),
            limit(200)
        ];
        if (activeCityKey) constraints.push(where('cityKey', '==', activeCityKey));
        return query(collection(firestore, 'drivers_locations'), ...constraints);
    }, [firestore, activeCityKey]);

    const { data: activeRides } = useCollection<any>(ridesQuery);
    const { data: driverLocations } = useCollection<any>(driversQuery);

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

    const [hoveredDriverId, setHoveredDriverId] = useState<string | null>(null);
    const [mapCenter, setMapCenter] = useState(cityCenter);
    const [mapZoom, setMapZoom] = useState(cityZoom);
    const [hasInteracted, setHasInteracted] = useState(false);

    useEffect(() => {
        if (!hasInteracted) {
            setMapCenter(cityCenter);
            setMapZoom(cityZoom);
        }
    }, [cityCenter, cityZoom, hasInteracted]);

    const handleMapInteraction = () => {
        if (!hasInteracted) {
            setHasInteracted(true);
        }
    };

    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const selectedDriver = useMemo(() => driverLocations?.find((d: any) => d.id === selectedDriverId), [driverLocations, selectedDriverId]);

    const statusConfig: any = {
        searching: { label: 'Buscando', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
        offered: { label: 'Ofertado', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
        driver_assigned: { label: 'Asignado', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
        accepted: { label: 'En Camino', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
        arrived: { label: 'En el Punto', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
        picked_up: { label: 'En Curso', color: 'text-green-500 bg-green-500/10 border-green-500/20' },
        paused: { label: 'Pausado', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
    };

    return (
        <div className="flex h-[calc(100vh-140px)] -m-6 overflow-hidden relative border-t border-white/5">
            <div className="flex-1 relative bg-[#0f0f0f]">
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
                    }}
                    mapId={MAP_ID}
                    colorScheme="DARK"
                    disableDefaultUI={false}
                    gestureHandling={'greedy'}
                    className="w-full h-full"
                >
                    {driverLocations?.map((d: any) => {
                        if (!d.currentLocation) return null;
                        return (
                            <VamoMarker
                                key={d.id}
                                position={d.currentLocation}
                                onClick={() => setSelectedDriverId(d.id)}
                            >
                                <div 
                                    className={cn(
                                        "relative flex items-center justify-center w-8 h-8 rounded-full border-2 shadow-lg transition-all duration-300 cursor-pointer pointer-events-auto",
                                        selectedDriverId === d.id ? "scale-150 z-50 border-white ring-4 ring-primary/40" : "scale-100",
                                        d.driverStatus === 'online' ? "bg-emerald-500 border-emerald-400" : "bg-indigo-500 border-indigo-400"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDriverId(d.id);
                                    }}
                                >
                                    <VamoIcon name="car" className="w-4 h-4 text-white" />
                                </div>
                            </VamoMarker>
                        );
                    })}
                </Map>

                {/* Overlay Cards */}
                <div className="absolute top-6 left-6 z-10 flex gap-3">
                    <Card className="bg-black/80 backdrop-blur-xl border-white/10 rounded-2xl">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="text-center">
                                <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">En Línea</p>
                                <p className="text-2xl font-black text-emerald-500">{stats.online}</p>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="text-center">
                                <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">En Viaje</p>
                                <p className="text-2xl font-black text-indigo-500">{stats.busy}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Right: Selection Detail */}
            {selectedDriver && (
                <div className="w-96 bg-zinc-950 border-l border-white/5 p-8 overflow-y-auto animate-in slide-in-from-right-full duration-500">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Detalle del Conductor</h3>
                        <button onClick={() => setSelectedDriverId(null)} className="text-zinc-600 hover:text-white transition-colors">
                            <VamoIcon name="x" className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center">
                            {selectedDriver.photoUrl ? <img src={selectedDriver.photoUrl} alt="" className="w-full h-full object-cover" /> : <VamoIcon name="user" className="w-8 h-8 text-zinc-700" />}
                        </div>
                        <div>
                            <h4 className="text-xl font-black text-white tracking-tight">{selectedDriver.driverName}</h4>
                            <Badge className={cn("mt-1 uppercase text-[8px] font-black", selectedDriver.driverStatus === 'online' ? "bg-emerald-500/20 text-emerald-500" : "bg-indigo-500/20 text-indigo-400")}>
                                {selectedDriver.driverStatus === 'online' ? 'Disponible' : 'En Viaje'}
                            </Badge>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-8">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Patente</p>
                            <p className="text-sm font-black text-indigo-400">{selectedDriver.plateNumber || 'S/P'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
                            <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Teléfono</p>
                            <p className="text-sm font-black text-white">{selectedDriver.driverPhone || 'N/A'}</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => router.push(`/admin/drivers?search=${selectedDriver.id}`)}
                        className="w-full bg-white text-black h-12 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                    >
                        Ver Perfil Completo
                    </button>
                </div>
            )}
        </div>
    );
}
