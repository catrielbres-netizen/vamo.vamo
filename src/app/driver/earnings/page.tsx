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
    const { weeklyRevenue, weeklyCommissions, weeklyRides, loading: statsLoading } = useDriverStats();

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
                    
                    {/* WEEKLY LEDGER / RESUMEN DE CAJA */}
                    <div className="px-6 pb-6 pt-2">
                        <div className="bg-zinc-900/50 rounded-2xl border border-white/5 p-4 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Resumen (7d)</h3>
                                {statsLoading && <VamoIcon name="loader" className="h-3 w-3 animate-spin text-zinc-600" />}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Recaudado (Efectivo)</p>
                                    <p className="text-xl font-black text-white">{formatCurrency(weeklyRevenue)}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Comisiones</p>
                                    <p className="text-xl font-black text-destructive-foreground">-{formatCurrency(weeklyCommissions)}</p>
                                </div>
                            </div>
                            
                            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Actividad Reciente</span>
                                </div>
                                <span className="text-[10px] font-black text-zinc-600 uppercase">{weeklyRides} viajes</span>
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
