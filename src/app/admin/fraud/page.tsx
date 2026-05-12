'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    orderBy, 
    limit,
    Timestamp,
    QueryConstraint
} from 'firebase/firestore';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type FraudIncident = {
    id: string;
    type: 'DUPLICATE_PLATE' | 'HIGH_CANCELLATION' | 'WALLET_SUSPICION' | 'FREQUENT_SAME_MATCH';
    severity: 'low' | 'medium' | 'high' | 'critical';
    entityType: 'driver' | 'passenger' | 'ride';
    entityId: string;
    entityName: string;
    description: string;
    timestamp: Date;
};

export default function AdminFraudControlPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const { cityKey: activeCityKey, loading: loadingContext } = useMunicipalContext();
    const [loading, setLoading] = useState(true);
    const [incidents, setIncidents] = useState<FraudIncident[]>([]);

    useEffect(() => {
        if (!firestore || profile?.role !== 'admin' || loadingContext) return;
        runHeuristics();
    }, [firestore, profile, activeCityKey, loadingContext]);

    const runHeuristics = async () => {
        setLoading(true);
        const detected: FraudIncident[] = [];
        try {
            const usersColl = collection(firestore!, 'users');
            const ridesColl = collection(firestore!, 'rides');

            // --- FILTERS ---
            const userConstraints: QueryConstraint[] = [where('role', '==', 'driver'), where('approved', '==', true)];
            const rideConstraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(200)];
            const incidentConstraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(50)];

            if (activeCityKey) {
                userConstraints.push(where('cityKey', '==', activeCityKey));
                rideConstraints.push(where('cityKey', '==', activeCityKey));
                incidentConstraints.push(where('cityKey', '==', activeCityKey));
            }

            // 1. DUPLICATE PLATES HEURISTIC
            const driversSnap = await getDocs(query(usersColl, ...userConstraints));
            const plateMap = new Map<string, string[]>();
            
            driversSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.plateNumber) {
                    const plate = data.plateNumber.toUpperCase().replace(/\s/g, '');
                    const existing = plateMap.get(plate) || [];
                    plateMap.set(plate, [...existing, doc.id]);
                }
            });

            plateMap.forEach((ids, plate) => {
                if (ids.length > 1) {
                    const driverNames = ids.map(id => {
                        const d = driversSnap.docs.find(doc => doc.id === id);
                        return d?.data().name || id;
                    }).join(', ');

                    detected.push({
                        id: `plate-${plate}`,
                        type: 'DUPLICATE_PLATE',
                        severity: 'critical',
                        entityType: 'driver',
                        entityId: ids[0],
                        entityName: plate,
                        description: `Varios conductores registrados con la misma patente: ${driverNames}`,
                        timestamp: new Date()
                    });
                }
            });

            // 2. HIGH CANCELLATION HEURISTIC (Recent rides)
            const recentRidesSnap = await getDocs(query(ridesColl, ...rideConstraints));
            const driverCancellations = new Map<string, { total: number, cancelled: number, name: string }>();

            recentRidesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.driverId) {
                    const entry = driverCancellations.get(data.driverId) || { total: 0, cancelled: 0, name: data.driverName || 'Anon' };
                    entry.total++;
                    if (data.status === 'cancelled' && data.cancelledBy === 'driver') entry.cancelled++;
                    driverCancellations.set(data.driverId, entry);
                }
            });

            driverCancellations.forEach((stats, id) => {
                const rate = stats.cancelled / stats.total;
                if (stats.total >= 5 && rate > 0.4) {
                    detected.push({
                        id: `cancel-${id}`,
                        type: 'HIGH_CANCELLATION',
                        severity: 'medium',
                        entityType: 'driver',
                        entityId: id,
                        entityName: stats.name,
                        description: `Tasa de cancelación inusual: ${Math.round(rate * 100)}% (${stats.cancelled}/${stats.total} viajes recientes)`,
                        timestamp: new Date()
                    });
                }
            });

            // 3. SUSPICIOUS WALLET MOVEMENTS (Negative vs Debt)
            driversSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.currentBalance < -5000) {
                    detected.push({
                        id: `debt-${doc.id}`,
                        type: 'WALLET_SUSPICION',
                        severity: 'high',
                        entityType: 'driver',
                        entityId: doc.id,
                        entityName: data.name || 'Conductor',
                        description: `Deuda excesiva con la plataforma: ${data.currentBalance}. Posible evasión de comisiones.`,
                        timestamp: new Date()
                    });
                }
            });

            // 4. SELF-DEALING / FREQUENT MATCH HEURISTIC (Last 24hs)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const dailyRideConstraints: QueryConstraint[] = [where('createdAt', '>=', Timestamp.fromDate(oneDayAgo))];
            if (activeCityKey) dailyRideConstraints.push(where('cityKey', '==', activeCityKey));
            
            const dailyRidesSnap = await getDocs(query(ridesColl, ...dailyRideConstraints));
            
            const pairsMap = new Map<string, { count: number, driverName: string, passengerName: string, driverId: string }>();
            
            dailyRidesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.driverId && data.passengerId && data.status === 'completed') {
                    const key = `${data.driverId}_${data.passengerId}`;
                    const entry = pairsMap.get(key) || { 
                        count: 0, 
                        driverName: data.driverName || 'Conductor', 
                        passengerName: data.passengerName || 'Pasajero',
                        driverId: data.driverId
                    };
                    entry.count++;
                    pairsMap.set(key, entry);
                }
            });

            // 5. FETCH RECORDED INCIDENTS (Real-time backend alerts)
            const incidentsSnap = await getDocs(query(collection(firestore!, 'fraud_incidents'), ...incidentConstraints));
            incidentsSnap.docs.forEach(doc => {
                const data = doc.data();
                detected.push({
                    id: doc.id,
                    type: data.type || 'UNKNOWN',
                    severity: data.severity || 'medium',
                    entityType: 'driver', // Default to driver for grouping
                    entityId: data.driverId || '',
                    entityName: data.driverName || 'Incidente Detectado',
                    description: data.description || 'Alerta de comportamiento inusual.',
                    timestamp: data.createdAt?.toDate() || new Date()
                });
            });

            // Final Sort: Most critical first
            const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            detected.sort((a, b) => (severityOrder[b.severity as keyof typeof severityOrder] || 0) - (severityOrder[a.severity as keyof typeof severityOrder] || 0));

            setIncidents(detected);
        } catch (e) {
            console.error("Fraud detection error:", e);
        } finally {
            setLoading(false);
        }
    };

    const severityConfig = {
        low:      { color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', icon: 'info' },
        medium:   { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: 'alert-triangle' },
        high:     { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: 'shield-alert' },
        critical: { color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: 'zap' }
    };

    return (
        <div className="p-6 space-y-8 max-w-6xl mx-auto pb-24">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-red-600/10 border border-red-600/20">
                            <VamoIcon name="shield-alert" className="h-6 w-6 text-red-500" />
                        </div>
                        Inteligencia de Fraude
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-1">Detección de anomalías y prevención de estafas.</p>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={runHeuristics} 
                    disabled={loading}
                    className="rounded-xl border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800"
                >
                    <VamoIcon name="refresh-cw" className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Escaneo Profundo
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <StatCard title="Incidentes Hoy" value={incidents.length} icon="alert-circle" color="red" />
                 <StatCard title="Puntos Críticos" value={incidents.filter(i => i.severity === 'critical').length} icon="zap" color="amber" />
                 <StatCard title="Estado Global" value="Vigilancia" icon="eye" color="indigo" />
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl w-full" />)}
                </div>
            ) : incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-900 rounded-[3rem] bg-zinc-900/20">
                    <VamoIcon name="shield-check" className="h-12 w-12 text-zinc-800 mb-4" />
                    <p className="text-sm font-black text-zinc-600 uppercase tracking-widest">No se detectaron patrones de fraude activos.</p>
                    <p className="text-[10px] text-zinc-700 mt-1 uppercase font-bold tracking-tighter">Último escaneo: Justo ahora</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {incidents.map((incident) => {
                        const config = severityConfig[incident.severity];
                        return (
                            <Card key={incident.id} className="overflow-hidden border-zinc-800 bg-black/40 backdrop-blur-xl group hover:border-zinc-700 transition-all">
                                <div className="p-5 flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-5 flex-1">
                                        <div className={cn("p-3 rounded-2xl border", config.color)}>
                                            <VamoIcon name={config.icon as any} className="h-6 w-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3">
                                                <Badge className={cn("text-[9px] font-black uppercase", config.color)}>
                                                    {incident.type.replace(/_/g, ' ')}
                                                </Badge>
                                                <span className="text-sm font-black text-white">{incident.entityName}</span>
                                            </div>
                                            <p className="text-xs text-zinc-400 font-medium">{incident.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Link href={`/admin/${incident.entityType === 'driver' ? 'driver-detail?id=' : 'rides?id='}${incident.entityId}`}>
                                            <Button variant="outline" size="sm" className="h-9 rounded-xl border-zinc-800 hover:bg-zinc-800 font-bold text-[10px] gap-2">
                                                EXAMINAR <VamoIcon name="search" className="h-3.5 w-3.5" />
                                            </Button>
                                        </Link>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-zinc-600 hover:text-red-500">
                                            <VamoIcon name="trash" className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <div className="rounded-3xl bg-zinc-900/50 border border-zinc-800 p-8 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                     <VamoIcon name="activity" className="h-8 w-8 text-indigo-500" />
                </div>
                <div>
                    <h3 className="text-xl font-black italic uppercase">Monitoreo Antifraude Avanzado</h3>
                    <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                        Los algoritmos heurísticos analizan comportamientos en tiempo real para proteger el balance de la plataforma y la seguridad de los usuarios.
                    </p>
                </div>
                <div className="flex gap-3 pt-2">
                     <Badge variant="outline" className="text-[9px] border-zinc-800 uppercase font-bold text-zinc-600">Cross-License Check</Badge>
                     <Badge variant="outline" className="text-[9px] border-zinc-800 uppercase font-bold text-zinc-600">Velocity Limits</Badge>
                     <Badge variant="outline" className="text-[9px] border-zinc-800 uppercase font-bold text-zinc-600">GPS spoof detection</Badge>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color }: any) {
    const colors: any = {
        red: "text-red-500 bg-red-500/10 border-red-500/20",
        amber: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        indigo: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20"
    };
    return (
        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
            <CardContent className="p-5 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{title}</p>
                    <div className="text-2xl font-black text-white">{value}</div>
                </div>
                <div className={cn("p-2 rounded-xl border", colors[color])}>
                    <VamoIcon name={icon} className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}
