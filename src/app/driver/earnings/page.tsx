
// src/app/driver/earnings/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, Timestamp, doc, setDoc } from 'firebase/firestore';
import { Ride, DriverSummary, UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getWeek, getYear, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon, WhatsAppLogo } from '@/components/VamoIcon';
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
    const { user, profile } = useUser();
    const { toast } = useToast();

    const [weeklyRides, setWeeklyRides] = useState<Ride[]>([]);
    const [summary, setSummary] = useState<DriverSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaying, setIsPaying] = useState(false);

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
                if (existingSummary?.status !== 'paid') {
                  setWeeklyRides(rides);
                } else {
                  setWeeklyRides([]);
                }
                
                const commissionInfo = getCommissionInfo(rides.length);
                const totalEarnings = rides.reduce((acc, ride) => acc + (ride.pricing.finalTotal || ride.pricing.estimatedTotal || 0), 0);
                const bonusesCovered = rides.reduce((acc, ride) => acc + (ride.pricing.discountAmount || 0), 0);
                const commissionOwed = totalEarnings * commissionInfo.rate;
                
                if (!existingSummary) {
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
                    await setDoc(summaryRef, newSummary, { merge: true });
                    setSummary(newSummary);
                } else {
                    const summaryRef = doc(firestore, 'driver_summaries', existingSummary.id as string);
                    
                    const needsUpdate = existingSummary.totalEarnings !== totalEarnings || 
                                       existingSummary.commissionOwed !== commissionOwed || 
                                       existingSummary.bonusesApplied !== bonusesCovered || 
                                       existingSummary.commissionRate !== commissionInfo.rate;

                    if(needsUpdate && existingSummary.status !== 'paid') {
                        const updatedData = { 
                            totalEarnings: totalEarnings,
                            commissionOwed: commissionOwed,
                            bonusesApplied: bonusesCovered,
                            commissionRate: commissionInfo.rate,
                            updatedAt: Timestamp.now()
                        };
                        await setDoc(summaryRef, updatedData, { merge: true });
                        setSummary({...existingSummary, ...updatedData});
                    } else if (existingSummary.status === 'pending' && totalEarnings === 0 && existingSummary.totalEarnings > 0) {
                        // This case happens when a payment was just made, but a re-render happens.
                        // We reset the local state to match the "paid" status.
                        setSummary({...existingSummary, totalEarnings: 0, commissionOwed: 0, bonusesApplied: 0});
                        setWeeklyRides([]);
                    }
                    else {
                      setSummary(existingSummary);
                    }
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

    const handleMercadoPagoPayment = async () => {
        if (!summary || summary.commissionOwed <= 0) {
            toast({ variant: 'destructive', title: 'No hay comisión para pagar.' });
            return;
        }

        setIsPaying(true);
        
        const alias = 'vamo.app';
        const amount = Math.ceil(summary.commissionOwed); // Ensure it's an integer
        const description = `Pago comision VamO sem ${weekId}`;

        const mpLink = `https://www.mercadopago.com.ar/money-transfer/checkout?identifier=1&alias=${alias}&amount=${amount}&description=${encodeURIComponent(description)}`;

        window.open(mpLink, '_blank');

        toast({
            title: 'Redirigiendo a Mercado Pago',
            description: 'Se abrió una nueva pestaña para completar el pago. Recordá marcarlo como pagado si es necesario.',
        });
        
        setIsPaying(false);
    };

    const handleNotifyPayment = () => {
        if (!summary || summary.commissionOwed <= 0 || !user || !profile) {
            toast({ variant: 'destructive', title: 'Error', description: 'No hay datos de pago para notificar.' });
            return;
        }

        const adminWhatsAppNumber = "2804967673";
        const driverName = `${profile.name || ''} ${profile.lastName || ''}`.trim();
        const amount = formatCurrency(Math.ceil(summary.commissionOwed));

        const message = `
Hola, soy ${driverName} (ID: ${user.uid}).
Acabo de realizar el pago de la comisión semanal.
-----------------------------------
*Resumen de Pago:*
*Semana:* ${weekId}
*Monto Pagado:* ${amount}
-----------------------------------
Adjunto el comprobante.
        `.trim().replace(/\n/g, '%0A').replace(/ /g, '%20');

        const url = `https://wa.me/${adminWhatsAppNumber}?text=${message}`;
        window.open(url, '_blank');
    };
    
    const isPaymentWindow = () => {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();
        return false;
    }

    if (isLoading) {
        return <p className="text-center">Cargando ganancias de la semana...</p>;
    }

    if (!summary) {
        return <p className="text-center text-muted-foreground">No hay datos de ganancias para esta semana.</p>;
    }
    const isPaid = summary.status === 'paid';
    
    const ridesCount = isPaid ? 0 : weeklyRides.length;
    const totalEarnings = isPaid ? 0 : summary.totalEarnings;
    const commissionOwed = isPaid ? 0 : summary.commissionOwed;
    const bonusesApplied = isPaid ? 0 : summary.bonusesApplied;
    const commissionRate = isPaid ? 0 : summary.commissionRate;
    
    const netToReceive = totalEarnings - commissionOwed + bonusesApplied;
    const commissionInfo = getCommissionInfo(ridesCount);
    const progressToNextTier = commissionInfo.nextTier ? (ridesCount / commissionInfo.nextTier) * 100 : 100;
    
    return (
        <div className="space-y-6">
            <Card className="border-primary">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><VamoIcon name="trending-up"/> Metas Semanales</CardTitle>
                    <CardDescription>Completá más viajes para reducir tu comisión.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex justify-between items-baseline">
                        <p className="text-sm font-medium">Comisión actual</p>
                        <p className="text-2xl font-bold text-primary">{isPaid ? '0' : (commissionInfo.rate * 100)}%</p>
                    </div>
                     <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Viajes completados: {ridesCount}</span>
                            {commissionInfo.nextTier && <span>Meta: {commissionInfo.nextTier}</span>}
                        </div>
                        <Progress value={isPaid ? 0 : progressToNextTier} />
                        {!isPaid && commissionInfo.ridesToNext !== null ? (
                             <p className="text-center text-sm text-muted-foreground">
                                ¡Te faltan <strong>{commissionInfo.ridesToNext} {commissionInfo.ridesToNext === 1 ? 'viaje' : 'viajes'}</strong> para bajar tu comisión al <strong>{(getCommissionInfo(ridesCount + commissionInfo.ridesToNext).rate * 100)}%</strong>!
                             </p>
                        ) : !isPaid && commissionInfo.nextTier === null ? (
                            <p className="text-center text-sm font-semibold text-green-500 flex items-center justify-center gap-2">
                                <VamoIcon name="target"/> ¡Alcanzaste la comisión más baja!
                            </p>
                        ) : null}
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
                            <span className="font-medium">{ridesCount}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">Total bruto facturado</span>
                            <span className="font-medium">{formatCurrency(totalEarnings)}</span>
                        </div>
                        {bonusesApplied > 0 && (
                            <div className="flex justify-between text-blue-500">
                                <span className="flex items-center gap-1"><VamoIcon name="percent" className="w-3 h-3" /> Reembolso por bonos</span>
                                <span className="font-medium">{formatCurrency(bonusesApplied)}</span>
                            </div>
                        )}
                     </div>
                     <div className="border-t pt-4 space-y-2 text-base">
                        <div className="flex justify-between items-center text-red-500">
                            <span className="font-medium">Comisión VamO ({(commissionRate * 100).toFixed(0)}%)</span>
                            <span className="font-bold">{formatCurrency(commissionOwed)}</span>
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
                {summary.status === 'pending' && commissionOwed > 0 && (
                    <CardFooter className="flex-col gap-2">
                        <Button className="w-full" onClick={handleMercadoPagoPayment} disabled={isPaying}>
                            {isPaying ? 'Procesando...' : (
                                <>
                                    <VamoIcon name="credit-card" className="mr-2 h-4 w-4" /> Pagar con Mercado Pago
                                </>
                            )}
                        </Button>
                        <Button className="w-full" variant="outline" onClick={handleNotifyPayment}>
                           <WhatsAppLogo className="mr-2 h-4 w-4" /> Ya pagué, notificar por WhatsApp
                        </Button>
                    </CardFooter>
                )}
            </Card>

             {isPaid ? (
                <Alert variant="default" className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800">
                    <VamoIcon name="check-circle" className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-700 dark:text-green-400">Comisión Pagada</AlertTitle>
                    <AlertDescription className="text-green-600 dark:text-green-500">
                        ¡Gracias! La comisión de esta semana ya fue registrada.
                    </AlertDescription>
                </Alert>
             ) : !isPaymentWindow() && summary.commissionOwed > 0 && (
                <Alert>
                    <VamoIcon name="info" className="h-4 w-4" />
                    <AlertTitle>Pago de Comisiones</AlertTitle>
                    <AlertDescription>
                        Podés pagar tu comisión semanal usando Mercado Pago y luego notificarnos por WhatsApp para que acreditemos el pago.
                    </AlertDescription>
                </Alert>
             )}

        </div>
    );
}

    