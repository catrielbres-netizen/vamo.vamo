'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

export default function TrafficDocuments() {
    const { profile } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const telemetry = useTelemetry();
    const { cityKey, cityName } = useMunicipalContext();
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = async () => {
        if (!cityKey) return;
        setLoading(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const searchDrivers = httpsCallable(functions, 'searchTrafficDriversV1');
            
            const res = await searchDrivers({ 
                cityKey: cityKey,
                status: 'pending',
                limit: 50 
            });
            setAlerts((res.data as any).drivers);
            telemetry.trackEvent({
                type: 'municipal_operation',
                eventName: 'traffic_documents_loaded',
                metadata: {
                    cityKey: cityKey,
                    count: (res.data as any).drivers?.length || 0
                }
            });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo sincronizar el estado documental.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (profile && cityKey) fetchAlerts();
    }, [profile, cityKey]);

    if (!profile) return null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            {/* HEADER */}
            <div>
                <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Control Documental</h1>
                <p className="text-zinc-500 font-medium">Conductores con trámites pendientes o documentación observada en {cityName}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-[2.5rem] bg-zinc-900/30" />)
                ) : alerts.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-4 bg-zinc-950/50 rounded-[3rem] border border-white/5">
                        <VamoIcon name="check-circle" className="w-16 h-16 text-emerald-500/20 mx-auto" />
                        <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs italic">No hay alertas documentales críticas en este momento</p>
                    </div>
                ) : (
                    alerts.map((driver) => (
                        <Card key={driver.id} className="rounded-[2.5rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden hover:bg-white/[0.02] transition-all group">
                            <CardContent className="p-8 space-y-6">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center font-black text-zinc-500">
                                        {driver.name?.charAt(0)}
                                    </div>
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] font-black uppercase tracking-widest">
                                        REVISIÓN PENDIENTE
                                    </Badge>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white italic tracking-tight">{driver.name}</h3>
                                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">{driver.municipalCode || 'Sin código'}</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                                        <VamoIcon name="alert-circle" className="w-4 h-4 text-amber-500/50" />
                                        <span>Trámite iniciado: {driver.createdAt ? new Date(driver.createdAt._seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-white/5 flex gap-2">
                                    <Button 
                                        className="flex-1 rounded-xl bg-white text-black font-black text-xs h-10 hover:bg-zinc-200"
                                        onClick={() => router.push(`/traffic/drivers/${driver.id}`)}
                                    >
                                        GESTIONAR
                                    </Button>
                                    <Button variant="ghost" size="icon" className="rounded-xl border border-white/5 text-zinc-500 h-10 w-10">
                                        <VamoIcon name="bell" className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
