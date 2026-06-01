'use client';

import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/firebase';
import { useDriverData } from '@/context/DriverRealtimeProvider';
import { useDriverTransactions } from '@/hooks/useDriverTransactions'; 
import { useDriverStats } from '@/hooks/useDriverStats';
import { Card, CardContent, CardHeader, CardFooter, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PaymentForm } from './PaymentForm';
import { WithdrawalForm } from './WithdrawalForm';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyPoolCard } from '@/components/WeeklyPoolCard';
import { safeFixed } from '@/lib/formatters';

function formatCurrency(value: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

export default function DriverEarningsPage() {
    const { profile, wallet, ready } = useDriverData();
    const { transactions, loading: isTransactionsLoading, error: transactionsError } = useDriverTransactions();
    const { 
        todayRevenue, todayCash, todayDigital, todayRides,
        todayKm, todayOnlineMinutes,
        weeklyRevenue, weeklyRides, 
        monthlyRevenue, monthlyRides,
        loading: statsLoading 
    } = useDriverStats();

    const router = useRouter();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [selectedTx, setSelectedTx] = useState<any | null>(null);

    useEffect(() => {
        const mpStatus = searchParams.get('mp_status');
        if (mpStatus) {
            if (mpStatus === 'success') {
                toast({ title: '✅ Pago Aprobado', description: 'Tu pago fue aprobado. Tu saldo se actualizará en breve.' });
            } else if (mpStatus === 'failure') {
                 toast({ variant: 'destructive', title: '❌ Pago Rechazado', description: 'La transacción no pudo ser completada.' });
            } else if (mpStatus === 'pending') {
                 toast({ title: '⏳ Pago Pendiente', description: 'Tu pago está siendo procesado por Mercado Pago.' });
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

    if (isTransactionsLoading || statsLoading) {
        return (
            <div className="space-y-4 pt-4">
                 <Skeleton className="h-48 w-full rounded-2xl" />
                 <Skeleton className="h-64 w-full rounded-2xl" />
                 <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 pt-2 px-1">
            <Card className="border-none shadow-2xl bg-[#1a1a1a] rounded-[2.5rem] overflow-hidden">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-2xl font-black uppercase tracking-tighter">
                        <VamoIcon name="wallet" className="text-primary" /> Billetera
                    </CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest opacity-50">Gestioná tus ganancias y créditos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-6 bg-zinc-900/50 rounded-3xl border border-white/5 shadow-inner">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 font-mono">Saldo Disponible</p>
                        <p className={cn("text-5xl font-black tracking-tighter drop-shadow-sm", balance >= 0 ? "text-white" : "text-destructive")}>
                            {formatCurrency(balance)}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                            <Badge variant="outline" className="text-[8px] font-black uppercase border-white/10 text-zinc-400 py-0.5">
                                RETIRABLE: {formatCurrency(withdrawableBalance)}
                            </Badge>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <Button 
                            variant="outline" 
                            className="h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] border-white/10 hover:bg-white/5"
                            onClick={() => setIsWithdrawalDialogOpen(true)}
                        >
                            <VamoIcon name="dollar-sign" className="mr-1 w-3 h-3" /> Retirar
                        </Button>
                        <Button 
                            className="h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
                            onClick={() => setIsPaymentDialogOpen(true)}
                        >
                            <VamoIcon name="credit-card" className="mr-1 w-3 h-3" /> Cargar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <WeeklyPoolCard />

            {/* PERFORMANCE STATS SECTION */}
            <div className="space-y-4">
                <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-6">Rendimiento</h3>
                
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col bg-zinc-950/60 backdrop-blur-md rounded-[2rem] border border-white/5 p-6 shadow-xl transition-all hover:border-white/10 group gap-4">
                        <div className="flex justify-between items-center w-full">
                            <div className="flex flex-col">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 group-hover:text-zinc-400 transition-colors">Hoy</p>
                                <p className="text-[10px] text-zinc-600 font-bold uppercase">{todayRides} {todayRides === 1 ? 'viaje' : 'viajes'}</p>
                            </div>
                            <p className="text-3xl font-black text-white tracking-tighter transition-all group-hover:scale-105 origin-right">{formatCurrency(todayRevenue)}</p>
                        </div>
                        
                        {(todayDigital > 0 || todayCash > 0 || todayKm > 0 || todayOnlineMinutes > 0) && (
                            <div className="flex flex-col gap-4 pt-4 border-t border-white/5 w-full">
                                <div className="flex gap-4">
                                    <div className="flex-1 flex flex-col">
                                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Efectivo cobrado</span>
                                        <span className="text-sm font-black text-white italic tracking-tight">{formatCurrency(todayCash)}</span>
                                    </div>
                                    <div className="flex-1 flex flex-col border-l border-white/5 pl-4">
                                        <div className="flex items-center gap-1 mb-1">
                                            <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                                            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest leading-none">VamO Pay</span>
                                        </div>
                                        <span className="text-sm font-black text-emerald-400 italic tracking-tight">{formatCurrency(todayDigital)}</span>
                                    </div>
                                </div>
                                <div className="flex gap-4 pt-4 border-t border-white/5">
                                    <div className="flex-1 flex flex-col">
                                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Km Rodados</span>
                                        <span className="text-sm font-black text-blue-400 italic tracking-tight">{safeFixed(todayKm, 1)} KM</span>
                                    </div>
                                    <div className="flex-1 flex flex-col border-l border-white/5 pl-4">
                                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Tiempo Online</span>
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-sm font-black text-amber-500 italic tracking-tight">{Math.floor(todayOnlineMinutes / 60)}h</span>
                                            <span className="text-[10px] font-black text-amber-500/60 italic tracking-tight">{todayOnlineMinutes % 60}m</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center bg-indigo-600/10 rounded-[2rem] border border-indigo-500/20 p-4 sm:p-6 shadow-xl ring-1 ring-indigo-500/10 transition-all hover:bg-indigo-600/15 group">
                        <div className="flex flex-col">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 font-mono">Esta Semana</p>
                            <p className="text-[10px] text-indigo-400/60 font-bold uppercase">{weeklyRides} viajes</p>
                        </div>
                        <p className="text-3xl font-black text-indigo-100 tracking-tighter transition-all group-hover:scale-105 origin-right">{formatCurrency(weeklyRevenue)}</p>
                    </div>

                    <div className="flex justify-between items-center bg-zinc-950/60 backdrop-blur-md rounded-[2rem] border border-white/5 p-4 sm:p-6 shadow-xl transition-all hover:border-white/10 group">
                        <div className="flex flex-col">
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Este Mes</p>
                            <p className="text-[10px] text-zinc-600 font-bold uppercase">{monthlyRides} viajes</p>
                        </div>
                        <p className="text-3xl font-black text-white tracking-tighter transition-all group-hover:scale-105 origin-right">{formatCurrency(monthlyRevenue)}</p>
                    </div>
                </div>

            </div>

            <Separator className="bg-white/5" />

            {/* TRANSACTIONS HISTORY */}
            <div className="space-y-4 pb-12">
                <button 
                  onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                  className="w-full flex justify-between items-center px-6 group"
                >
                  <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] group-hover:text-zinc-400 transition-colors">Movimientos Recientes</h3>
                  <VamoIcon 
                    name="chevron-down" 
                    className={cn("w-4 h-4 text-zinc-600 transition-transform duration-300", isHistoryOpen && "rotate-180")} 
                  />
                </button>
                
                {isHistoryOpen && (
                  <Card className="border-none bg-zinc-950/40 rounded-[2.5rem] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardContent className="pt-6">
                        {sortedTransactions.length > 0 ? (
                            <ul className="space-y-2">
                                {sortedTransactions.map(tx => {
                                    const isPositive = tx.amount > 0;
                                    const isRideIncome = isPositive && (
                                        (tx.type as any) === 'driver_ride_credit' || 
                                        (tx.type as any) === 'wallet_credit'
                                    );
                                    
                                    // Use the note if it's descriptive, otherwise fallback to a formatted title
                                    let title = tx.note || tx.type.replace(/_/g, ' ');
                                    
                                    // Special cases for better UX
                                    if (isRideIncome && !tx.note) title = 'Acreditación VamO Pay';
                                    if (!isPositive && (tx.type as any) === 'commission_debit') title = 'Comisión por Viaje';
                                    if (!isPositive && (tx.type as any) === 'assistance_contribution') title = 'Cuota F.A.P.';
                                    if (isPositive && (tx.type as any) === 'subsidy_credit') title = 'Cobertura de Descuento';
                                    if (isPositive && (tx.type as any) === 'credit_promo') title = 'Bono Pozo Semanal';

                                    return (
                                        <li key={tx.id} onClick={() => setSelectedTx({ ...tx, friendlyTitle: title, isPositive })} className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.03] border border-white/[0.03] hover:bg-white/[0.05] transition-all group cursor-pointer">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "text-xs font-black uppercase tracking-tight flex items-center gap-1.5",
                                                        isPositive ? 'text-emerald-400' : 'text-zinc-500'
                                                    )}>
                                                        {isRideIncome && <Sparkles className="w-3 h-3" />}
                                                        <span>{title}</span>
                                                    </div>
                                                    {tx.status === 'pending' && (
                                                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[7px] h-3.5 px-1 font-black uppercase">Pendiente</Badge>
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-zinc-600 font-bold uppercase">
                                                    {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '...'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <p className={cn("font-black text-sm tracking-tighter italic tabular-nums", isPositive ? 'text-emerald-500' : 'text-white')}>
                                                    {isPositive ? '+' : ''}{formatCurrency(tx.amount)}
                                                </p>
                                                <VamoIcon name="chevron-right" className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            !transactionsError && <p className="text-center text-zinc-600 text-xs font-bold uppercase py-10 tracking-widest animate-pulse">Sin movimientos</p>
                        )}
                    </CardContent>
                  </Card>
                )}
            </div>

            {/* MODALS */}
            <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
                <DialogContent className="max-w-md bg-zinc-950 border-zinc-900 rounded-[2.5rem] p-8">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-white">Detalle de Movimiento</DialogTitle>
                    </DialogHeader>
                    {selectedTx && (
                        <div className="mt-6 space-y-6">
                            <div className="text-center p-6 bg-zinc-900/50 rounded-3xl border border-white/5">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 font-mono">Monto</p>
                                <p className={cn("text-5xl font-black tracking-tighter drop-shadow-sm", selectedTx.isPositive ? "text-emerald-500" : "text-white")}>
                                    {selectedTx.isPositive ? '+' : ''}{formatCurrency(selectedTx.amount)}
                                </p>
                                {selectedTx.status === 'pending' && (
                                    <Badge className="mt-3 bg-amber-500/10 text-amber-500 border-amber-500/20 font-black uppercase">Pendiente</Badge>
                                )}
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Concepto</span>
                                    <span className="text-sm font-black text-white text-right">{selectedTx.friendlyTitle}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Fecha</span>
                                    <span className="text-sm font-bold text-zinc-300">
                                        {selectedTx.createdAt?.toDate ? selectedTx.createdAt.toDate().toLocaleString('es-AR') : '...'}
                                    </span>
                                </div>
                                {selectedTx.referenceId && (
                                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Referencia</span>
                                        <span className="text-sm font-mono font-bold text-zinc-400 bg-white/5 px-2 py-1 rounded-md">
                                            #{selectedTx.referenceId.slice(0, 8).toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pb-3">
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">ID Transacción</span>
                                    <span className="text-[10px] font-mono text-zinc-600 truncate max-w-[150px]">
                                        {selectedTx.id}
                                    </span>
                                </div>
                            </div>
                            <Button className="w-full h-12 rounded-2xl font-black uppercase tracking-widest bg-zinc-800 hover:bg-zinc-700 text-white" onClick={() => setSelectedTx(null)}>
                                Cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent className="max-w-md bg-zinc-950 border-zinc-900 rounded-[2.5rem] p-8">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-white">Cargar Crédito</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-medium">
                            Pagá tus comisiones de forma automática. Serás redirigido a Mercado Pago.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-6">
                        <PaymentForm onCancel={() => setIsPaymentDialogOpen(false)} />
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
                 <DialogContent className="max-w-md bg-zinc-950 border-zinc-900 rounded-[2.5rem] p-8">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-white">Solicitar Retiro</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-medium">
                            Transferiremos tus ganancias a tu cuenta bancaria o CVU.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-6">
                        <WithdrawalForm 
                            withdrawableBalance={withdrawableBalance} 
                            onCancel={() => setIsWithdrawalDialogOpen(false)}
                            onSuccess={() => setIsWithdrawalDialogOpen(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
