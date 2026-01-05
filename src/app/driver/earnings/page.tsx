
// src/app/driver/earnings/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, Timestamp, doc, setDoc } from 'firebase/firestore';
import { Ride, DriverSummary } from '@/lib/types';
import { Card, CardContent, CardHeader, CardFooter, CardDescription, CardTitle } from '@/components/ui/card';
import { getWeek, getYear, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';


function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

const getCommissionInfo = (rideCount: number): { rate: number, nextTier: number | null, ridesToNext: number | null } => {
    if (rideCount < 30) {
        return { rate: 0.08, nextTier: 30, ridesToNext: 30 - rideCount }; // 8%
    }
    if (rideCount < 50) {
        return { rate: 0.06, nextTier: 50, ridesToNext: 50 - rideCount }; // 6%
    }
    return { rate: 0.04, nextTier: null, ridesToNext: null }; // 4%
}


export default function EarningsPage() {
    const firestore = useFirestore();
    const { user, profile } = useUser();
    const { toast } = useToast();

    const [weeklyRides, setWeeklyRides] = useState<Ride[]>([]);
    const [summary, setSummary] = useState<DriverSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const today = new Date();
    const weekStartsOn = 1; // Monday
    const firstDayOfWeek = startOfWeek(today, { weekStartsOn });
    const weekId = `${getYear(firstDayOfWeek)}-W${getWeek(firstDayOfWeek, { weekStartsOn })}`;

    useEffect(() => {
        if (!firestore || !user?.uid) return;

        const fetchWeeklyData = async () => {
            setIsLoading(true);
            const beginningOfWeek = startOfWeek(new Date(), { weekStartsOn: 1 /* Monday */ });
            const beginningOfWeekTimestamp = Timestamp.fromDate(beginningOfWeek);

            const summaryQuery = query(
                collection(firestore, 'driver_summaries'),
                where('driverId', '==', user.uid),
                where('weekId', '==', weekId)
            );
            
            const summarySnapshot = await getDocs(summaryQuery);
            const existingSummary = summarySnapshot.empty ? null : { ...summarySnapshot.docs[0].data(), id: summarySnapshot.docs[0].id } as DriverSummary & { id: string };

            const ridesQuery = query(
                collection(firestore, 'rides'),
                where('driverId', '==', user.uid),
                where('status', '==', 'finished'),
                where('finishedAt', '>=', beginningOfWeekTimestamp)
            );

            try {
                const ridesSnapshot = await getDocs(ridesQuery);

                const rides = ridesSnapshot.docs.map(doc => doc.data() as Ride);
                setWeeklyRides(rides);
                
                const commissionInfo = getCommissionInfo(rides.length);
                const totalEarnings = rides.reduce((acc, ride) => acc + (ride.pricing.finalTotal || ride.pricing.estimatedTotal || 0), 0);
                const bonusesCovered = rides.reduce((acc, ride) => acc + (ride.pricing.discountAmount || 0), 0);
                const commissionOwed = rides.reduce((acc, ride) => acc + (ride.pricing.rideCommission || 0), 0);
                
                const summaryData: DriverSummary = {
                    driverId: user.uid,
                    weekId: weekId,
                    totalEarnings: totalEarnings,
                    commissionOwed: commissionOwed,
                    commissionRate: commissionInfo.rate,
                    bonusesApplied: bonusesCovered,
                    status: existingSummary?.status || 'pending', // Preserve paid status if already set
                    updatedAt: Timestamp.now(),
                };

                const summaryRef = doc(firestore, 'driver_summaries', existingSummary?.id || `${user.uid}_${weekId}`);
                await setDoc(summaryRef, summaryData, { merge: true });
                setSummary(summaryData);
                
            } catch (error) {
                console.error("Error fetching weekly data:", error);
                toast({ variant: 'destructive', title: 'Error al cargar las ganancias.' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchWeeklyData();

    }, [firestore, user?.uid, weekId, toast]);
    

    if (isLoading || !profile) {
        return <p className="text-center">Cargando panel financiero...</p>;
    }

    if (!summary) {
        return <p className="text-center text-muted-foreground">No hay datos de ganancias para esta semana.</p>;
    }
    
    const ridesCount = weeklyRides.length;
    const { totalEarnings, commissionOwed, bonusesApplied, commissionRate } = summary;
    
    const netToReceive = totalEarnings - commissionOwed + bonusesApplied;
    const commissionInfo = getCommissionInfo(ridesCount);
    const progressToNextTier = commissionInfo.nextTier ? (ridesCount / commissionInfo.nextTier) * 100 : 100;
    
    // Check if platform credit covers the commission
    const platformCreditPaid = profile.platformCreditPaid ?? 0;
    const commissionCovered = platformCreditPaid >= 0;

    return (
        <div className="space-y-6">
            <Card className="border-primary">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><VamoIcon name="trending-up"/> Metas Semanales</CardTitle>
                    <CardDescription>Completá más viajes para reducir la comisión de la plataforma.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex justify-between items-baseline">
                        <p className="text-sm font-medium">Tasa de comisión actual</p>
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
                                ¡Te faltan <strong>{commissionInfo.ridesToNext} {commissionInfo.ridesToNext === 1 ? 'viaje' : 'viajes'}</strong> para bajar tu comisión al <strong>{(getCommissionInfo(ridesCount + commissionInfo.ridesToNext).rate * 100)}%</strong>!
                             </p>
                        ) : (
                            <p className="text-center text-sm font-semibold text-green-500 flex items-center justify-center gap-2">
                                <VamoIcon name="target"/> ¡Alcanzaste la comisión más baja!
                            </p>
                        )}
                     </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Resumen Financiero Semanal</CardTitle>
                    <CardDescription>Tus ganancias desde el {startOfWeek(today, { locale: es, weekStartsOn }).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Viajes completados</span>
                            <span className="font-medium">{ridesCount}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">Total bruto (cobrado a pasajeros)</span>
                            <span className="font-medium">{formatCurrency(totalEarnings)}</span>
                        </div>
                        {bonusesApplied > 0 && (
                            <div className="flex justify-between text-blue-500">
                                <span className="flex items-center gap-1"><VamoIcon name="percent" className="w-3 h-3" /> Reembolso por bonos de VamO</span>
                                <span className="font-medium">{formatCurrency(bonusesApplied)}</span>
                            </div>
                        )}
                     </div>
                     <div className="border-t pt-4 space-y-2 text-base">
                        <div className="flex justify-between items-center text-red-500">
                            <span className="font-medium">Comisión de plataforma ({(commissionRate * 100).toFixed(0)}%)</span>
                            <span className="font-bold">{formatCurrency(commissionOwed)}</span>
                        </div>
                         <div className="flex justify-between items-center">
                            <span className="font-medium">Estado de comisión</span>
                            {commissionCovered ? (
                                <span className="text-green-500 font-semibold text-sm">Liquidada automáticamente</span>
                            ) : (
                                <span className="text-yellow-500 font-semibold text-sm">Pendiente por saldo</span>
                            )}
                        </div>
                        <div className="flex justify-between items-center text-green-500 font-bold border-t pt-2 mt-2">
                            <span>Tu ganancia neta en mano</span>
                            <span>{formatCurrency(totalEarnings)}</span>
                        </div>
                     </div>
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        Tu ganancia neta en mano es el total cobrado a los pasajeros. La comisión de plataforma se debita de tu crédito prepago.
                     </p>
                </CardContent>
            </Card>
            
            <Alert>
                <VamoIcon name="info" className="h-4 w-4" />
                <AlertTitle>¿Cómo funciona la comisión?</AlertTitle>
                <AlertDescription>
                   La comisión por el uso de la plataforma se descuenta automáticamente de tu Crédito de Plataforma al finalizar cada viaje.
                   <br />
                   <strong>Si tu saldo es insuficiente, no podrás recibir nuevos viajes hasta recargarlo.</strong>
                </AlertDescription>
            </Alert>
        </div>
    );
}
