'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useFirestore, useCollection } from '@/firebase'; 
import { collection, query, where, limit, orderBy } from 'firebase/firestore'; 
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { VamoIcon } from '@/components/VamoIcon';

function HeatmapLayerComponent({
    data,
    gradient,
    visible
}: {
    data: { lat: number; lng: number }[];
    gradient: string[];
    visible: boolean;
}) {
    const map = useMap('admin_heatmap');
    const visualization = useMapsLibrary('visualization');
    const [heatmap, setHeatmap] = useState<google.maps.visualization.HeatmapLayer | null>(null);

    useEffect(() => {
        if (!map || !visualization) return;
        const layer = new visualization.HeatmapLayer({
            radius: 35,
            opacity: 0.8,
            gradient
        });
        setHeatmap(layer);
        return () => {
            layer.setMap(null);
        };
    }, [map, visualization, gradient]);

    useEffect(() => {
        if (!heatmap) return;
        if (visible) {
            heatmap.setMap(map);
            heatmap.setData(data.map(d => new google.maps.LatLng(d.lat, d.lng)));
        } else {
            heatmap.setMap(null);
        }
    }, [heatmap, map, visible, data]);

    return null;
}

export default function AdminHeatmapPage() {
    const firestore = useFirestore();
    const { cityKey: activeCityKey, cityCenter, cityZoom } = useMunicipalContext();

    const [showDrivers, setShowDrivers] = useState(true);
    const [showRides, setShowRides] = useState(true);

    const ridesQuery = useMemo(() => {
        if (!firestore) return null;
        const constraints = [
            where('status', 'in', ['searching', 'offered', 'driver_assigned', 'accepted', 'arrived', 'picked_up', 'arriving', 'paused', 'completed', 'cancelled']),
            orderBy('updatedAt', 'desc'),
            limit(500)
        ];
        if (activeCityKey) constraints.push(where('cityKey', '==', activeCityKey));
        return query(collection(firestore, 'rides'), ...constraints);
    }, [firestore, activeCityKey]);

    const driversQuery = useMemo(() => {
        if (!firestore) return null;
        const constraints = [
            limit(500)
        ];
        if (activeCityKey) constraints.push(where('cityKey', '==', activeCityKey));
        return query(collection(firestore, 'drivers_locations'), ...constraints);
    }, [firestore, activeCityKey]);

    const { data: rides } = useCollection<any>(ridesQuery);
    const { data: driverLocations } = useCollection<any>(driversQuery);

    const ridesPoints = useMemo(() => {
        if (!rides) return [];
        return rides
            .filter((r: any) => r.origin && r.origin.lat && r.origin.lng)
            .map((r: any) => ({ lat: r.origin.lat, lng: r.origin.lng }));
    }, [rides]);

    const driversPoints = useMemo(() => {
        if (!driverLocations) return [];
        return driverLocations
            .filter((d: any) => d.currentLocation && d.currentLocation.lat && d.currentLocation.lng)
            .map((d: any) => ({ lat: d.currentLocation.lat, lng: d.currentLocation.lng }));
    }, [driverLocations]);

    // Blue/Red gradient for Rides (Demand)
    const ridesGradient = [
        "rgba(0, 255, 255, 0)",
        "rgba(0, 255, 255, 1)",
        "rgba(0, 191, 255, 1)",
        "rgba(0, 127, 255, 1)",
        "rgba(0, 63, 255, 1)",
        "rgba(0, 0, 255, 1)",
        "rgba(0, 0, 223, 1)",
        "rgba(0, 0, 191, 1)",
        "rgba(0, 0, 159, 1)",
        "rgba(0, 0, 127, 1)",
        "rgba(63, 0, 91, 1)",
        "rgba(127, 0, 63, 1)",
        "rgba(191, 0, 31, 1)",
        "rgba(255, 0, 0, 1)"
    ];

    // Green gradient for Drivers (Supply)
    const driversGradient = [
        "rgba(0, 255, 0, 0)",
        "rgba(60, 255, 60, 1)",
        "rgba(100, 255, 100, 1)",
        "rgba(150, 255, 150, 1)",
        "rgba(200, 255, 200, 1)",
        "rgba(255, 255, 0, 1)",
        "rgba(255, 200, 0, 1)",
        "rgba(255, 150, 0, 1)"
    ];

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
                    mapId="admin_heatmap"
                    colorScheme="DARK"
                    disableDefaultUI={false}
                    gestureHandling={'greedy'}
                    className="w-full h-full"
                >
                    <HeatmapLayerComponent 
                        data={ridesPoints} 
                        gradient={ridesGradient} 
                        visible={showRides} 
                    />
                    <HeatmapLayerComponent 
                        data={driversPoints} 
                        gradient={driversGradient} 
                        visible={showDrivers} 
                    />
                </Map>

                {/* Controls Overlay */}
                <div className="absolute top-6 left-6 z-10">
                    <Card className="bg-black/80 backdrop-blur-xl border-white/10 rounded-2xl w-72">
                        <CardContent className="p-4 flex flex-col gap-4">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                                <VamoIcon name="map" className="w-5 h-5 text-indigo-400" />
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Heatmap Operativo</h3>
                                    <p className="text-[10px] text-zinc-400 font-medium">Visualización en tiempo real</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,0,0,0.8)]" />
                                    <Label className="text-xs font-bold text-zinc-300">Demanda (Pedidos)</Label>
                                </div>
                                <Switch checked={showRides} onCheckedChange={setShowRides} />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                    <Label className="text-xs font-bold text-zinc-300">Oferta (Conductores)</Label>
                                </div>
                                <Switch checked={showDrivers} onCheckedChange={setShowDrivers} />
                            </div>

                            <div className="pt-2 border-t border-white/10">
                                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                                    <span>Puntos de demanda:</span>
                                    <span className="font-bold text-zinc-300">{ridesPoints.length}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                                    <span>Puntos de oferta:</span>
                                    <span className="font-bold text-zinc-300">{driversPoints.length}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
