
// src/app/admin/drivers/[driverId]/page.tsx
'use client';

export const dynamic = "force-dynamic";

import { useState, useEffect } from 'react';
import { useFirestore, useDoc, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, Timestamp, doc, updateDoc, addDoc, writeBatch, runTransaction, increment, serverTimestamp } from 'firebase/firestore';
import { Ride, DriverSummary, UserProfile, AuditLog, PlatformTransaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { getWeek, getYear, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WithId } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useParams } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VamoIcon } from '@/components/VamoIcon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

const verificationStatusBadge: Record<UserProfile['vehicleVerificationStatus'] & string, { text: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    unverified: { text: 'No Verificado', variant: 'destructive' },
    pending_review: { text: 'Pendiente de Revisión', variant: 'secondary' },
    approved: { text: 'Aprobado', variant: 'default' },
    rejected: { text: 'Rechazado', variant: 'destructive' },
}

export default function DriverDetailPage() {
    const firestore = useFirestore();
    const { user, profile: adminProfile } = useUser();
    const params = useParams();
    const driverId = params.driverId as string;
    const { toast } = useToast();

    const [weeklyRides, setWeeklyRides] = useState<WithId<Ride>[]>([]);
    const [summary, setSummary] = useState<WithId<DriverSummary> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isInspecting, setIsInspecting] = useState(false);
    const [inspectionResult, setInspectionResult] = useState<string | null>(null);
    const [creditAdjustment, setCreditAdjustment] = useState('');
    const [isAdjustingCredit, setIsAdjustingCredit] = useState(false);
    const [adjustmentReason, setAdjustmentReason] = useState('');


    const driverProfileRef = useMemoFirebase(() => firestore ? doc(firestore, 'users', driverId) : null, [firestore, driverId]);
    const { data: driver, isLoading: isDriverLoading } = useDoc<UserProfile>(driverProfileRef);
    
    const today = new Date();
    const weekStartsOn = 1; // Monday
    const firstDayOfWeek = startOfWeek(today, { weekStartsOn });
    const weekId = `${getYear(firstDayOfWeek)}-W${getWeek(firstDayOfWeek, { weekStartsOn })}`;

    const fetchWeeklyData = async () => {
        if (!firestore || !driverId) return;
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

            const existingSummary = summarySnapshot.empty ? null : { ...summarySnapshot.docs[0].data() as DriverSummary, id: summarySnapshot.docs[0].id };
            setSummary(existingSummary);

            const rides = ridesSnapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
            setWeeklyRides(rides);

        } catch (error) {
            console.error("Error fetching weekly data for driver:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdjustCredit = async () => {
        const amount = parseFloat(creditAdjustment);
        if (isNaN(amount) || !driverProfileRef || !firestore || !user?.uid || !adminProfile?.name || !adjustmentReason) {
            toast({ variant: 'destructive', title: 'Error', description: 'Monto o motivo inválido, o datos de sesión faltantes.' });
            return;
        }

        setIsAdjustingCredit(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const driverDoc = await transaction.get(driverProfileRef);
                if (!driverDoc.exists()) {
                    throw new Error("El conductor no existe.");
                }

                // Create ledger entry
                const txLogRef = doc(collection(firestore, 'platform_transactions'));
                const logEntry: Omit<PlatformTransaction, 'createdAt'> & { createdAt: any } = {
                    driverId: driverId,
                    amount: amount,
                    type: amount > 0 ? 'credit_manual' : 'debit_adjustment',
                    source: 'admin',
                    note: adjustmentReason,
                    createdAt: serverTimestamp(),
                };
                transaction.set(txLogRef, logEntry);

                // Update the canonical balance
                transaction.update(driverProfileRef, { 
                    updatedAt: serverTimestamp(),
                });
            });

            toast({
                title: '¡Crédito ajustado!',
                description: `El saldo del conductor fue ajustado en ${formatCurrency(amount)}.`
            });
            setCreditAdjustment('');
            setAdjustmentReason('');

        } catch (error) {
            console.error("Error adjusting credit:", error);
            toast({ variant: 'destructive', title: 'Error en la transacción', description: 'No se pudo ajustar el crédito.' });
        } finally {
            setIsAdjustingCredit(false);
        }
    };

    const handleVerification = async (newStatus: 'approved' | 'rejected') => {
        if (!firestore || !driverProfileRef || !adminProfile?.name || !user?.uid || !driver) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la acción. Faltan datos del administrador o conductor.' });
            return;
        }

        const WELCOME_BONUS = 5000;

        try {
            await runTransaction(firestore, async (transaction) => {
                const driverDoc = await transaction.get(driverProfileRef);
                if (!driverDoc.exists()) throw new Error("Driver not found.");
                
                const driverData = driverDoc.data() as UserProfile;

                // 1. Audit Log for the verification action
                const auditLogRef = doc(collection(firestore, 'auditLogs'));
                transaction.set(auditLogRef, {
                    adminId: user.uid,
                    adminName: adminProfile.name,
                    action: newStatus === 'approved' ? 'driver_approved' : 'driver_rejected',
                    entityId: driverId,
                    timestamp: serverTimestamp(),
                    details: newStatus === 'approved' ? 'Aprobado por admin.' : 'Rechazado por admin.'
                });

                let bonusGranted = false;
                // 2. Grant welcome bonus ONLY on first approval
                if (newStatus === 'approved' && !driverData.promoCreditGranted) {
                    // Create ledger entry for the bonus
                    const promoTxRef = doc(collection(firestore, 'platform_transactions'));
                    transaction.set(promoTxRef, {
                        driverId: driverId,
                        amount: WELCOME_BONUS,
                        type: 'credit_promo',
                        source: 'system',
                        referenceId: 'initial_bonus',
                        note: 'Bono de bienvenida por aprobación de cuenta',
                        createdAt: serverTimestamp(),
                    });
                    
                    // Update driver's canonical balance and grant flag
                    transaction.update(driverProfileRef, {
                        promoCreditGranted: true,
                    });
                    bonusGranted = true;
                }
                
                // 3. Update driver's verification status
                transaction.update(driverProfileRef, {
                    vehicleVerificationStatus: newStatus,
                    approved: newStatus === 'approved',
                    updatedAt: serverTimestamp(),
                });

                return bonusGranted;
            });

            toast({
                title: '¡Acción completada!',
                description: `El conductor ha sido ${newStatus === 'approved' ? 'aprobado' : 'rechazado'}.` + (newStatus === 'approved' && !driver.promoCreditGranted ? ' Se añadió el bono de bienvenida.' : ''),
            });

        } catch (error) {
            console.error("Error updating driver status:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado del conductor.' });
        }
    }


    const handleInspectRides = async () => {
        setIsInspecting(true);
        setInspectionResult(null);
        toast({
            variant: 'destructive',
            title: 'Función Deshabilitada',
            description: 'La inspección por IA se ha deshabilitado temporalmente.'
        });
        setIsInspecting(false);
    };

    const handleMarkAsPaid = async () => {
        if (!firestore || !summary?.id) {
             toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el resumen semanal para marcar como pagado.' });
            return;
        }
        const summaryRef = doc(firestore, 'driver_summaries', summary.id);
        try {
            await updateDoc(summaryRef, {
                status: 'paid',
                updatedAt: serverTimestamp(),
            });
            toast({ title: '¡Éxito!', description: 'La comisión semanal fue marcada como pagada.'});
            fetchWeeklyData(); // Refresh data
        } catch (error) {
            console.error("Error marking as paid:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado del pago.' });
        }
    }

    const handleSuspendAccount = async (suspend: boolean) => {
        if (!firestore || !driverProfileRef || !adminProfile?.name || !user?.uid) return;
        
        try {
            const batch = writeBatch(firestore);

            batch.update(driverProfileRef, {
                isSuspended: suspend,
                driverStatus: 'inactive', // Force status to inactive
                updatedAt: serverTimestamp(),
            });

            const auditLogRef = doc(collection(firestore, 'auditLogs'));
            const logEntry: Omit<AuditLog, 'timestamp' | 'details'| 'id'> & { timestamp: any; details: string; } = {
                adminId: user.uid,
                adminName: adminProfile.name,
                action: suspend ? 'driver_suspended' : 'driver_unsuspended',
                entityId: driverId,
                timestamp: serverTimestamp(),
                details: `El administrador ${adminProfile.name} ${suspend ? 'suspendió' : 'reactivó'} la cuenta del conductor.`
            };
            
            batch.set(auditLogRef, logEntry);

            await batch.commit();

            toast({
                title: '¡Acción completada!',
                description: `La cuenta del conductor ha sido ${suspend ? 'suspendida' : 'reactivada'}.`,
            });
        } catch (error) {
            console.error("Error suspending/unsuspending account:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado de la cuenta.' });
        }
    }


    useEffect(() => {
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
    const verificationInfo = verificationStatusBadge[driver.vehicleVerificationStatus || 'unverified'];
    const isSummaryPending = summary?.status === 'pending' && commissionOwed > 0;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        {driver.name}
                        <Badge variant={verificationInfo.variant}>{verificationInfo.text}</Badge>
                         {driver.isSuspended && <Badge variant="destructive">SUSPENDIDO</Badge>}
                    </h1>
                    <p className="text-muted-foreground">{driver.email} | {driver.phone}</p>
                    <p className="text-sm text-muted-foreground">Año del vehículo: {driver.carModelYear || 'N/A'}</p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/admin/rides">Volver a la lista</Link>
                </Button>
            </div>
            
            {driver.vehicleVerificationStatus === 'pending_review' && (
                <Card className="border-yellow-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><VamoIcon name="circle-alert" className="text-yellow-500"/> Conductor Pendiente de Aprobación</CardTitle>
                        <CardDescription>Revisá la documentación recibida por WhatsApp y tomá una acción.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="default" className="w-full bg-green-600 hover:bg-green-700">
                                    <VamoIcon name="user-check" className="mr-2"/> Aprobar Conductor
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro que querés aprobar a este conductor?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción activará la cuenta del conductor, le permitirá empezar a recibir viajes y le otorgará el bono de bienvenida si corresponde.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction asChild>
                                    <Button onClick={() => handleVerification('approved')} className="bg-green-600 hover:bg-green-700">Aprobar</Button>
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full">Rechazar Conductor</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro que querés rechazar a este conductor?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción marcará al conductor como rechazado y no podrá acceder a la app. Deberá contactar a soporte si cree que es un error.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction asChild>
                                    <Button variant="destructive" onClick={() => handleVerification('rejected')}>Rechazar</Button>
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <VamoIcon name="wallet" /> Billetera
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                             <p className="text-3xl font-bold">{formatCurrency(0)}</p>
                             <p className="text-sm text-muted-foreground">Saldo Actual (Calculado)</p>
                             {driver.promoCreditGranted && <p className="text-xs text-muted-foreground">(Incluye bono de bienvenida)</p>}
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col items-start gap-4 border-t pt-4">
                         <div className="w-full space-y-2">
                             <Label>Ajustar Saldo (Contable)</Label>
                             <div className="flex w-full items-center gap-2">
                                 <Input
                                    id="credit-adjustment"
                                    type="number"
                                    placeholder="Ej: 5000 o -500"
                                    value={creditAdjustment}
                                    onChange={(e) => setCreditAdjustment(e.target.value)}
                                    disabled={isAdjustingCredit}
                                />
                             </div>
                             <Input
                                id="adjustment-reason"
                                type="text"
                                placeholder="Motivo del ajuste (ej: Carga MP)"
                                value={adjustmentReason}
                                onChange={(e) => setAdjustmentReason(e.target.value)}
                                disabled={isAdjustingCredit}
                             />
                            <Button onClick={handleAdjustCredit} disabled={isAdjustingCredit || !creditAdjustment || !adjustmentReason} className="w-full">
                                {isAdjustingCredit ? <VamoIcon name="loader" className="animate-spin" /> : <VamoIcon name="check" />}
                                Aplicar Ajuste
                            </Button>
                             <p className="text-xs text-muted-foreground">Crea una transacción en el ledger del conductor. Usar con cuidado.</p>
                         </div>
                    </CardFooter>
                </Card>

                <Card className="lg:col-span-2">
                     <CardHeader>
                        <CardTitle>Resumen Semanal (Sistema Anterior)</CardTitle>
                         <CardDescription>Desde el {startOfWeek(today, { locale: es, weekStartsOn }).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total bruto facturado</span>
                            <span className="font-medium">{formatCurrency(totalEarnings)}</span>
                        </div>
                        <div className="flex justify-between text-blue-500">
                                <span className="flex items-center gap-1"><VamoIcon name="percent" className="w-3 h-3" /> Reembolso por bonos</span>
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
                      {isSummaryPending && (
                        <CardFooter className="border-t pt-4">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="default" className="w-full bg-green-600 hover:bg-green-700">
                                        <VamoIcon name="check" className="mr-2"/> Marcar Semana como Pagada
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar Pago de Comisión?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción marcará la comisión de {formatCurrency(commissionOwed)} como pagada.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction asChild>
                                        <Button onClick={handleMarkAsPaid} className="bg-green-600 hover:bg-green-700">Sí, confirmar pago</Button>
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    )}
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card className="border-primary">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><VamoIcon name="target"/> Metas Semanales</CardTitle>
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
                                    <VamoIcon name="check-circle" className="w-4 h-4" /> ¡Alcanzó la comisión más baja!
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Acciones de Cuenta</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {driver.isSuspended ? (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                     <Button variant="outline" className="w-full">
                                        <VamoIcon name="user-check" className="mr-2"/> Reactivar Cuenta
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>¿Reactivar la cuenta de este conductor?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción permitirá que el conductor vuelva a iniciar sesión y recibir viajes. Hacelo solo si la situación fue regularizada.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleSuspendAccount(false)}>Sí, reactivar cuenta</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        ) : (
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="w-full">
                                        <VamoIcon name="x-circle" className="mr-2"/> Suspender Cuenta
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>¿Suspender la cuenta de este conductor?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción bloqueará el acceso del conductor a la aplicación. No podrá iniciar sesión ni recibir viajes. Es una medida seria.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction asChild>
                                        <Button onClick={() => handleSuspendAccount(true)} variant="destructive">Sí, suspender</Button>
                                    </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Viajes de la Semana ({ridesCount})</span>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                 <Button variant="outline" onClick={handleInspectRides} disabled={isInspecting}>
                                    <VamoIcon name="bot" className="mr-2 h-4 w-4"/>
                                    {isInspecting ? 'Analizando...' : 'Inspeccionar Viajes'}
                                </Button>
                            </AlertDialogTrigger>
                            {inspectionResult && (
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Análisis de Viajes por IA</AlertDialogTitle>
                                        <div className="text-sm text-muted-foreground whitespace-pre-wrap pt-2">
                                            {inspectionResult}
                                        </div>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogAction onClick={() => setInspectionResult(null)}>Entendido</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            )}
                        </AlertDialog>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {weeklyRides.length > 0 ? (
                        <ul className="space-y-3">
                            {weeklyRides.map(ride => (
                                <li key={ride.id} className="border p-3 rounded-lg flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        {ride.auditComment && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <VamoIcon name="circle-alert" className="w-5 h-5 text-yellow-500" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs">{ride.auditComment}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                        <div>
                                            <p className="font-medium">A {ride.destination.address}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {(ride.finishedAt as Timestamp).toDate().toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}hs
                                            </p>
                                        </div>
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
