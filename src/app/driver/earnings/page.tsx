'use client';

import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/firebase';
import { useDriverTransactions } from '@/hooks/useDriverTransactions'; 
import { useDriverStats } from '@/hooks/useDriverStats';
import { Card, CardContent, CardHeader, CardFooter, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Timestamp } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { PaymentForm } from './PaymentForm';
import { WithdrawalForm } from './WithdrawalForm';
import { Skeleton } from '@/components/ui/skeleton';

function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

export default function DriverEarningsPage() {
    const { profile, loading: isUserLoading } = useUser();
    // CORRECTED: Use the dedicated hook for transactions
    const { transactions, loading: isTransactionsLoading, error: transactionsError } = useDriverTransactions();
    const { 
        todayRevenue, todayRides,
        weeklyRevenue, weeklyCommissions, weeklyRides, 
        monthlyRevenue, monthlyRides,
        loading: statsLoading 
    } = useDriverStats();

    const router = useRouter();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);

    useEffect(() => {
        const mpStatus = searchParams.get('mp_status');
        if (mpStatus) {
            if (mpStatus === 'success') {
                toast({
                    title: '✅ Pago Aprobado',
                    description: 'Tu pago fue aprobado. Tu saldo se actualizará en breve cuando recibamos la confirmación del servidor.',
                });
            } else if (mpStatus === 'failure') {
                 toast({
                    variant: 'destructive',
                    title: '❌ Pago Rechazado',
                    description: 'La transacción no pudo ser completada. Intentá con otro medio de pago.',
                });
            } else if (mpStatus === 'pending') {
                 toast({
                    title: '⏳ Pago Pendiente',
                    description: 'Tu pago está siendo procesado por Mercado Pago.',
                });
            }
            router.replace('/driver/earnings');
        }
    }, [searchParams, router, toast]);
    
    const sortedTransactions = useMemo(() => {
        if (!transactions) return [];
        return [...transactions].sort((a, b) => {
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return timeB - timeA; 
        });
    }, [transactions]);
    
    const balance = profile?.currentBalance ?? 0;
    const nonWithdrawable = profile?.nonWithdrawableBalance ?? 0;
    const withdrawableBalance = Math.max(0, balance - nonWithdrawable);

    if (isUserLoading || isTransactionsLoading) {
        return (
             <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                     <Skeleton className="h-10 w-1/2" />
                     <Skeleton className="h-12 w-full" />
                </CardContent>
                 <CardContent>
                     <Skeleton className="h-32 w-full mt-6" />
                 </CardContent>
             </Card>
        );
    }

    return (
        <>
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><VamoIcon name="wallet" /> Billetera VamO</CardTitle>
                        <CardDescription>Crédito para el pago automático de comisiones y gestión de tus ganancias.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Saldo Actual</p>
                            <p className={cn("text-4xl font-bold", balance >= 0 ? "text-primary" : "text-destructive")}>
                                {formatCurrency(balance)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Retirable: {formatCurrency(withdrawableBalance)}</p>
                        </div>
                        {balance < 0 && (
                            <Alert variant="destructive">
                                <VamoIcon name="alert-triangle" className="h-4 w-4" />
                                <AlertTitle>¡Saldo Insuficiente!</AlertTitle>
                                <AlertDescription>
                                    Tu saldo es negativo. Por favor, cargá crédito para poder seguir recibiendo viajes.
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => setIsWithdrawalDialogOpen(true)}>
                            <VamoIcon name="dollar-sign" className="mr-2" /> Retirar Saldo
                        </Button>
                        <DialogTrigger asChild>
                            <Button>
                                <VamoIcon name="credit-card" className="mr-2" /> Cargar Saldo
                            </Button>
                        </DialogTrigger>
                    </CardFooter>
                    
                    {/* PERFORMANCE STATS - BLOQUE 8 */}
                    <div className="px-6 pb-6 pt-2 space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-zinc-900/50 rounded-2xl border border-white/5 p-3 text-center">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Hoy</p>
                                <p className="text-lg font-black text-white">{formatCurrency(todayRevenue)}</p>
                                <p className="text-[8px] text-zinc-600 font-bold uppercase">{todayRides} viajes</p>
                            </div>
                            <div className="bg-indigo-600/10 rounded-2xl border border-indigo-500/20 p-3 text-center ring-1 ring-indigo-500/20">
                                <p className="text-[8px] font-black text-indigo-400 uppercase mb-1">Semana</p>
                                <p className="text-lg font-black text-white">{formatCurrency(weeklyRevenue)}</p>
                                <p className="text-[8px] text-indigo-400/60 font-bold uppercase">{weeklyRides} viajes</p>
                            </div>
                            <div className="bg-zinc-900/50 rounded-2xl border border-white/5 p-3 text-center">
                                <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Mes</p>
                                <p className="text-lg font-black text-white">{formatCurrency(monthlyRevenue)}</p>
                                <p className="text-[8px] text-zinc-600 font-bold uppercase">{monthlyRides} viajes</p>
                            </div>
                        </div>

                        {/* WEEKLY POOL / POINTS - BLOQUE 7 */}
                        <div className="bg-gradient-to-br from-amber-500/20 to-orange-600/10 rounded-2xl border border-amber-500/20 p-4 space-y-3 relative overflow-hidden">
                            <div className="absolute -right-4 -bottom-4 opacity-10">
                                <VamoIcon name="award" className="w-24 h-24 text-amber-500" />
                            </div>
                            <div className="flex justify-between items-center relative z-10">
                                <div className="flex flex-col">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-500 leading-none mb-1">Puntos VamO</h3>
                                    <p className="text-xl font-black text-white leading-none">{profile?.vamoPoints || 0}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-zinc-500 uppercase leading-none mb-1">Pozo Semanal</p>
                                    <p className="text-sm font-black text-amber-400">{profile?.weeklyPoints || 0} pts</p>
                                </div>
                            </div>
                            <div className="pt-2 flex items-center gap-2 relative z-10">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest leading-none">
                                    Sumás puntos por cada viaje completado (Recaudación: {formatCurrency(weeklyRevenue)})
                                </span>
                            </div>
                        </div>
                    </div>

                    <Separator className="my-4" />
                    <CardHeader>
                        <CardTitle className="text-lg">Historial de Movimientos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {transactionsError && (
                             <Alert variant="destructive">
                                <AlertTitle>Error al cargar transacciones</AlertTitle>
                                <AlertDescription>{transactionsError}</AlertDescription>
                            </Alert>
                        )}
                        {sortedTransactions.length > 0 ? (
                            <ul className="space-y-3">
                                {sortedTransactions.map(tx => (
                                    <li key={tx.id} className="flex justify-between items-start text-sm p-3 rounded-xl bg-white/[0.02] border border-white/[0.02]">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <p className={cn("font-bold capitalize", tx.amount > 0 ? 'text-green-400' : 'text-indigo-300')}>
                                                    {tx.note || tx.type.replace(/_/g, ' ')}
                                                </p>
                                                {tx.status === 'pending' && (
                                                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] h-4 px-1.5 font-black uppercase">Pendiente</Badge>
                                                )}
                                                {tx.status === 'rejected' && (
                                                    <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[8px] h-4 px-1.5 font-black uppercase">Rechazado</Badge>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-zinc-500">
                                                {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString('es-AR') : 'Cargando fecha...'}
                                            </p>
                                        </div>
                                        <p className={cn("font-black text-base", tx.amount > 0 ? 'text-green-500' : 'text-white')}>
                                            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            !transactionsError && <p className="text-center text-muted-foreground py-4">No hay movimientos recientes.</p>
                        )}
                    </CardContent>
                </Card>
                
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cargar Saldo con Mercado Pago</DialogTitle>
                        <DialogDescription>
                            Seleccioná el monto que querés cargar. Serás redirigido a Mercado Pago para completar la transacción de forma segura.
                        </DialogDescription>
                    </DialogHeader>
                    <PaymentForm onCancel={() => setIsPaymentDialogOpen(false)} />
                </DialogContent>
            </Dialog>

            <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
                 <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Solicitar Retiro de Saldo</DialogTitle>
                        <DialogDescription>
                            Ingresá tus datos bancarios y el monto a retirar. Las solicitudes se procesan manualmente.
                        </DialogDescription>
                    </DialogHeader>
                    <WithdrawalForm 
                        withdrawableBalance={withdrawableBalance} 
                        onCancel={() => setIsWithdrawalDialogOpen(false)}
                        onSuccess={() => setIsWithdrawalDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
