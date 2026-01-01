// src/app/admin/drivers/[driverId]/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, Timestamp, doc } from 'firebase/firestore';
import { Ride, DriverSummary, UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getWeek, getYear, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle, Percent } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WithId } from '@/firebase/firestore/use-collection';


function formatCurrency(value: number) {
    if (typeof value !== 'number') return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

const getCommissionInfo = (rideCount: number): { rate: number, nextTier: number | null, ridesToNext: number | null } => {
    if (rideCount < 30) return { rate: 0.08, nextTier: 30, ridesToNext: 30 - rideCount };
    if (rideCount < 50) return { rate: 0.06, nextTier: 50, ridesToNext: 50 - rideCount };
    return { rate: 0.04, nextTier: null, ridesToNext: null };
}

export default function DriverDetailPage({ params }: { params: { driverId: string } }) {
    const firestore = useFirestore();
    const { driverId } = params;

    const [weeklyRides, setWeeklyRides] = useState<WithId<Ride>[]>([]);
    const [summary, setSummary] = useState<DriverSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const driverProfileRef = useMemoFirebase(() => firestore ? doc(firestore, 'users', driverId) : null, [firestore, driverId]);
    const { data: driver, isLoading: isDriverLoading } = useDoc<UserProfile>(driverProfileRef);
    
    const today = new Date();
    const weekStartsOn = 1; // Monday
    const firstDayOfWeek = startOfWeek(today, { weekStartsOn });
    const weekId = `${getYear(firstDayOfWeek)}-W${getWeek(firstDayOfWeek, { weekStartsOn })}`;

    useEffect(() => {
        if (!firestore || !driverId) return;

        const fetchWeeklyData = async () => {
            setIsLoading(true);
            const beginningOfWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
            const beginningOfWeekTimestamp = Timestamp.fromDate(beginningOfWeek);

            const summaryQuery = query(
                collection(firestore, 'driver_summaries'),
                where('driverId', '==', driverId),
                where('weekId', '==', weekId)
            );
            
            const ridesQuery = query(
                collection(firestore, 'rides'),
                where('driverId', '==', driverId),
                where('status', '==', 'finished'),
                where('finishedAt', '>=', beginningOfWeekTimestamp)
            );

            try {
                const [summarySnapshot, ridesSnapshot] = await Promise.all([
                    getDocs(summaryQuery),
                    getDocs(ridesQuery)
                ]);

                const existingSummary = summarySnapshot.empty ? null : summarySnapshot.docs[0].data() as DriverSummary;
                setSummary(existingSummary);

                const rides = ridesSnapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
                setWeeklyRides(rides);

            } catch (error) {
                console.error("Error fetching weekly data for driver:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchWeeklyData();

    }, [firestore, driverId, weekId]);

    if (isLoading || isDriverLoading) {
        return <p className="text-center">Cargando detalles del conductor...</p>;
    }
    
    if (!driver) {
        return <p className="text-center text-destructive">No se encontró al conductor.</p>
    }

    const ridesCount = weeklyRides.length;
    const commissionInfo = getCommissionInfo(ridesCount);
    const progressToNextTier = commissionInfo.nextTier ? (ridesCount / commissionInfo.nextTier) * 100 : 100;
    const totalEarnings = summary?.totalEarnings ?? 0;
    const commissionOwed = summary?.commissionOwed ?? 0;
    const bonusesApplied = summary?.bonusesApplied ?? 0;
    const netToReceive = totalEarnings - commissionOwed + bonusesApplied;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{driver.name}</h1>
                    <p className="text-muted-foreground">{driver.email}</p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/admin/rides">Volver a la lista</Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card className="border-primary">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Target/> Metas Semanales</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between items-baseline">
                            <p className="text-sm font-medium">Comisión actual</p>
                            <p className="text-2xl font-bold text-primary">{(commissionInfo.rate * 100)}%</p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Viajes completados: {ridesCount}</span>
                                {commissionInfo.nextTier && <span>Meta: {commissionInfo.nextTier}</span>}
                            </div>
                            <Progress value={progressToNextTier} />
                            {commissionInfo.ridesToNext !== null ? (
                                <p className="text-center text-sm text-muted-foreground">
                                    A <strong>{commissionInfo.ridesToNext} {commissionInfo.ridesToNext === 1 ? 'viaje' : 'viajes'}</strong> de bajar su comisión al <strong>{(getCommissionInfo(ridesCount + commissionInfo.ridesToNext).rate * 100)}%</strong>.
                                </p>
                            ) : (
                                <p className="text-center text-sm font-semibold text-green-500 flex items-center justify-center gap-2">
                                    <CheckCircle className="w-4 h-4" /> ¡Alcanzó la comisión más baja!
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Resumen Semanal</CardTitle>
                         <CardDescription>Desde el {startOfWeek(today, { locale: es, weekStartsOn }).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total bruto facturado</span>
                            <span className="font-medium">{formatCurrency(totalEarnings)}</span>
                        </div>
                        <div className="flex justify-between text-blue-500">
                                <span className="flex items-center gap-1"><Percent className="w-3 h-3" /> Reembolso por bonos</span>
                                <span className="font-medium">{formatCurrency(bonusesApplied)}</span>
                            </div>
                        <div className="flex justify-between items-center text-red-500">
                            <span className="font-medium">Comisión VamO ({(summary?.commissionRate ?? commissionInfo.rate * 100).toFixed(0)}%)</span>
                            <span className="font-bold">{formatCurrency(commissionOwed)}</span>
                        </div>
                        <div className="flex justify-between items-center text-green-500 font-bold border-t pt-2 mt-2">
                            <span>Total a recibir por el conductor</span>
                            <span>{formatCurrency(netToReceive)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Viajes de la Semana ({ridesCount})</CardTitle>
                </CardHeader>
                <CardContent>
                    {weeklyRides.length > 0 ? (
                        <ul className="space-y-3">
                            {weeklyRides.map(ride => (
                                <li key={ride.id} className="border p-3 rounded-lg flex justify-between items-center">
                                    <div>
                                        <p className="font-medium">A {ride.destination.address}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {(ride.finishedAt as Timestamp).toDate().toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}hs
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-primary">{formatCurrency(ride.pricing.finalTotal || ride.pricing.estimatedTotal)}</p>
                                        <Badge variant="outline" className="capitalize mt-1">{ride.serviceType}</Badge>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Este conductor no ha completado viajes esta semana.</p>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
