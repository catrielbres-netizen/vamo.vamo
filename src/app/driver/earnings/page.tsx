// src/app/driver/earnings/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, Timestamp, doc, setDoc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Ride, DriverSummary } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getWeek, getYear, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, CheckCircle, Percent, TrendingUp, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';


function formatCurrency(value: number) {
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
    const { user } = useUser();
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

            const ridesQuery = query(
                collection(firestore, 'rides'),
                where('driverId', '==', user.uid),
                where('status', '==', 'finished'),
                where('finishedAt', '>=', beginningOfWeekTimestamp)
            );
            
            const summaryQuery = query(
                collection(firestore, 'driver_summaries'),
                where('driverId', '==', user.uid),
                where('weekId', '==', weekId)
            );

            try {
                const [ridesSnapshot, summarySnapshot] = await Promise.all([
                    getDocs(ridesQuery),
                    getDocs(summaryQuery)
                ]);

                const rides = ridesSnapshot.docs.map(doc => doc.data() as Ride);
                setWeeklyRides(rides);
                
                const commissionInfo = getCommissionInfo(rides.length);
                const totalEarnings = rides.reduce((acc, ride) => acc + (ride.pricing.finalTotal || ride.pricing.estimatedTotal || 0), 0);
                const bonusesCovered = rides.reduce((acc, ride) => acc + (ride.pricing.discountAmount || 0), 0);
                const commissionOwed = totalEarnings * commissionInfo.rate;
                
                if (summarySnapshot.empty) {
                    const newSummary: DriverSummary = {
                        driverId: user.uid,
                        weekId: weekId,
                        totalEarnings: totalEarnings,
                        commissionOwed: commissionOwed,
                        commissionRate: commissionInfo.rate,
                        bonusesApplied: bonusesCovered,
                        status: 'pending',
                        updatedAt: Timestamp.now(),
                    };
                    const summaryRef = doc(firestore, 'driver_summaries', `${user.uid}_${weekId}`);
                    setDoc(summaryRef, newSummary, { merge: true });
                    setSummary(newSummary);
                } else {
                    const existingSummary = { ...summarySnapshot.docs[0].data(), id: summarySnapshot.docs[0].id } as DriverSummary & { id: string };
                    const summaryRef = doc(firestore, 'driver_summaries', existingSummary.id as string);
                    
                    if(existingSummary.totalEarnings !== totalEarnings || existingSummary.commissionOwed !== commissionOwed || existingSummary.bonusesApplied !== bonusesCovered || existingSummary.commissionRate !== commissionInfo.rate) {
                        existingSummary.totalEarnings = totalEarnings;
                        existingSummary.commissionOwed = commissionOwed;
                        existingSummary.bonusesApplied = bonusesCovered;
                        existingSummary.commissionRate = commissionInfo.rate;
                        updateDocumentNonBlocking(summaryRef, { 
                            totalEarnings: totalEarnings,
                            commissionOwed: commissionOwed,
                            bonusesApplied: bonusesCovered,
                            commissionRate: commissionInfo.rate,
                            updatedAt: Timestamp.now()
                        });
                    }
                    setSummary(existingSummary);
                }

            } catch (error) {
                console.error("Error fetching weekly data:", error);
                toast({ variant: 'destructive', title: 'Error al cargar las ganancias.' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchWeeklyData();

    }, [firestore, user?.uid, weekId, toast]);

    const handleRegisterPayment = async () => {
        if (!firestore || !user || !summary) return;

        const summaryRef = doc(firestore, 'driver_summaries', `${user.uid}_${weekId}`);
        const updatedSummary: DriverSummary = {
            ...summary,
            status: 'paid',
            updatedAt: Timestamp.now()
        };

        try {
            await setDoc(summaryRef, updatedSummary, { merge: true });
            setSummary(updatedSummary);
            toast({
                title: '¡Pago Registrado!',
                description: 'Gracias por ponerte al día con tu comisión.',
            });
        } catch (error) {
            console.error("Error registering payment:", error);
            toast({ variant: 'destructive', title: 'No se pudo registrar el pago.' });
        }
    };
    
    const isPaymentWindow = () => {
        // SIMULACION: Se simula que es domingo a las 18hs para habilitar el botón.
        return true;
        
        // Lógica original:
        // const now = new Date();
        // const day = now.getDay(); // 0 = Sunday
        // const hour = now.getHours();
        // return day === 0 && hour >= 18 && hour < 20;
    }

    if (isLoading) {
        return <p className="text-center">Cargando ganancias de la semana...</p>;
    }

    if (!summary) {
        return <p className="text-center text-muted-foreground">No hay datos de ganancias para esta semana.</p>;
    }

    const netToReceive = summary.totalEarnings - summary.commissionOwed + summary.bonusesApplied;
    const commissionInfo = getCommissionInfo(weeklyRides.length);

    const progressToNextTier = commissionInfo.nextTier ? (weeklyRides.length / commissionInfo.nextTier) * 100 : 100;

    return (
        <div className="space-y-6">
            <Card className="border-primary">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><TrendingUp/> Metas Semanales</CardTitle>
                    <CardDescription>Completá más viajes para reducir tu comisión.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex justify-between items-baseline">
                        <p className="text-sm font-medium">Comisión actual</p>
                        <p className="text-2xl font-bold text-primary">{(commissionInfo.rate * 100)}%</p>
                    </div>
                     <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Viajes completados: {weeklyRides.length}</span>
                            {commissionInfo.nextTier && <span>Meta: {commissionInfo.nextTier}</span>}
                        </div>
                        <Progress value={progressToNextTier} />
                        {commissionInfo.ridesToNext !== null ? (
                             <p className="text-center text-sm text-muted-foreground">
                                ¡Te faltan <strong>{commissionInfo.ridesToNext} {commissionInfo.ridesToNext === 1 ? 'viaje' : 'viajes'}</strong> para bajar tu comisión al <strong>{(getCommissionInfo(weeklyRides.length + commissionInfo.ridesToNext).rate * 100)}%</strong>!
                             </p>
                        ) : (
                            <p className="text-center text-sm font-semibold text-green-500 flex items-center justify-center gap-2">
                                <Target/> ¡Alcanzaste la comisión más baja!
                            </p>
                        )}
                     </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Resumen Semanal</CardTitle>
                    <CardDescription>Tus ganancias desde el {startOfWeek(today, { locale: es, weekStartsOn }).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Viajes completados</span>
                            <span className="font-medium">{weeklyRides.length}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">Total bruto facturado</span>
                            <span className="font-medium">{formatCurrency(summary.totalEarnings)}</span>
                        </div>
                        {summary.bonusesApplied > 0 && (
                            <div className="flex justify-between text-blue-500">
                                <span className="flex items-center gap-1"><Percent className="w-3 h-3" /> Reembolso por bonos</span>
                                <span className="font-medium">{formatCurrency(summary.bonusesApplied)}</span>
                            </div>
                        )}
                     </div>
                     <div className="border-t pt-4 space-y-2 text-base">
                        <div className="flex justify-between items-center text-red-500">
                            <span className="font-medium">Comisión VamO ({(summary.commissionRate * 100).toFixed(0)}%)</span>
                            <span className="font-bold">{formatCurrency(summary.commissionOwed)}</span>
                        </div>
                        <div className="flex justify-between items-center text-green-500">
                            <span className="font-medium">Total a recibir</span>
                            <span className="font-bold">{formatCurrency(netToReceive)}</span>
                        </div>
                     </div>
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        El total a recibir es el bruto facturado, menos la comisión, más los bonos de pasajero que VamO te cubre.
                     </p>
                </CardContent>
                {summary.status === 'pending' && summary.commissionOwed > 0 && (
                    <CardFooter>
                        <Button className="w-full" onClick={handleRegisterPayment} disabled={!isPaymentWindow()}>
                            Registrar Pago de Comisión
                        </Button>
                    </CardFooter>
                )}
            </Card>

             {summary.status === 'paid' ? (
                <Alert variant="default" className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-700 dark:text-green-400">Comisión Pagada</AlertTitle>
                    <AlertDescription className="text-green-600 dark:text-green-500">
                        ¡Gracias! La comisión de esta semana ya fue registrada.
                    </AlertDescription>
                </Alert>
             ) : !isPaymentWindow() && summary.commissionOwed > 0 ? (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Ventana de Pagos</AlertTitle>
                    <AlertDescription>
                        El registro de pago de comisiones está habilitado únicamente los días domingo entre las 18:00 y 20:00 hs.
                    </AlertDescription>
                </Alert>
             ) : null}

        </div>
    );
}
