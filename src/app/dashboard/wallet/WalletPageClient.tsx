'use client';

import React, { useState } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUser, useFirebaseApp } from '@/firebase';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePassengerData } from '@/context/PassengerDataProvider';
import { usePromotions } from '@/hooks/usePromotions';
import { cn, parseFirestoreDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Gift, Zap, ShieldCheck, History, PlusCircle, Sparkles, AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { featureFlags } from '@/config/features';
import { MercadoPagoLinkCard } from '@/components/MercadoPagoLinkCard';

export default function WalletPageClient() {
    const { user, profile } = useUser();
    const firebaseApp = useFirebaseApp();
    const { toast } = useToast();
    const { isGrantingBonus } = usePassengerData();
    const [isTopUpLoading, setIsTopUpLoading] = useState(false);
    const [isWithdrawingGR, setIsWithdrawingGR] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Hydration guard: ensures component only renders on client
    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch Promotions for Wallet
    const { promotions: walletPromos } = usePromotions('general');

    // Fetch Wallet Data (Unified Source: getMyWalletV1)
    const { data, isLoading, isError, refetch: refetchWallet } = useQuery({
        queryKey: ['wallet', user?.uid],
        queryFn: async () => {
            if (!firebaseApp) return null;
            const functions = getFunctions(firebaseApp, 'us-central1');
            const getWallet = httpsCallable(functions, 'getMyWalletV1');
            const result = await getWallet();
            const resData = result.data as any;
            return resData;
        },
        enabled: !!user && !!firebaseApp,
        refetchOnWindowFocus: true
    });

    const handleTopUpFlow = async (amount: number) => {
        if (!firebaseApp) return;
        setIsTopUpLoading(true);
        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            
            // 1. Create Topup Order
            const createOrder = httpsCallable(functions, 'createWalletTopupOrderV1');
            const orderResult = await createOrder({ amount }) as any;
            const { orderId } = orderResult.data;

            toast({ 
                title: 'Orden Generada', 
                description: `Orden ${orderId} creada. Simulando pago seguro...` 
            });

            // 2. Simulated Delay (Wait for payment confirmation simulation)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 3. Confirm Topup (Normally triggered by a Webhook, here manually for MVP)
            const confirmTopup = httpsCallable(functions, 'confirmWalletTopupV1');
            await confirmTopup({ orderId });

            toast({ 
                title: '¡Recarga Exitosa!', 
                description: `Se acreditaron $${amount.toLocaleString('es-AR')} + bono promocional.` 
            });
            
            refetchWallet();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsTopUpLoading(false);
        }
    };

    const handleWithdrawGrossReceipts = async () => {
        if (!firebaseApp) return;
        setIsWithdrawingGR(true);
        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const withdraw = httpsCallable(functions, 'withdrawGrossReceiptsV1');
            const res = await withdraw();
            const data = res.data as any;
            
            toast({ 
                title: 'Retiro Exitoso', 
                description: `Se han acreditado $${(data.amount || 0).toLocaleString('es-AR')} a tu saldo disponible.` 
            });
            refetchWallet();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsWithdrawingGR(false);
        }
    };

    if (!mounted || isLoading) {
        return (
            <div className="space-y-8 pb-32 animate-in fade-in duration-700">
                {/* Balance Card Skeleton */}
                <div className="h-72 w-full rounded-[2.5rem] bg-zinc-900/50 animate-pulse border border-white/5" />
                
                {/* Zap Banner Skeleton */}
                <div className="h-44 w-full rounded-[2.5rem] bg-zinc-900/50 animate-pulse border border-white/5" />

                {/* Cashback Info Skeleton */}
                <div className="h-24 w-full rounded-3xl bg-zinc-900/50 animate-pulse border border-white/5" />

                {/* Predefined Amounts Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="h-24 rounded-3xl bg-zinc-900/50 animate-pulse border border-white/5" />
                    <div className="h-24 rounded-3xl bg-zinc-900/50 animate-pulse border border-white/5" />
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 min-h-[50vh]">
                <div className="p-4 bg-red-500/10 rounded-full">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <div className="space-y-2">
                    <h3 className="font-bold text-lg text-white">No se pudo cargar el saldo</h3>
                    <p className="text-sm text-zinc-500">Hubo un problema al conectar con tu billetera. Por favor, reintentá en unos minutos.</p>
                </div>
                <Button onClick={() => refetchWallet()} variant="outline" className="border-white/10 text-white">
                    Reintentar
                </Button>
            </div>
        );
    }

    const wallet = data?.wallet;
    const activeCreditsAmount = Number(data?.activeCreditsAmount || 0);

    if (!wallet) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4 min-h-[60vh]">
                <VamoIcon name="loader" className="animate-spin h-10 w-10 text-indigo-500" />
                <div className="text-center space-y-1">
                    <p className="text-xs font-black uppercase text-zinc-500 tracking-[0.2em]">Iniciando billetera segura</p>
                    <p className="text-[10px] text-zinc-400 font-medium">Estamos configurando tu acceso por primera vez...</p>
                </div>
            </div>
        );
    }

    const transactions = data?.transactions || [];
    const cashBalance = wallet?.cashBalance ?? 0;
    const promoBalance = wallet?.promoBalance ?? 0;
    const grossReceiptsBalance = wallet?.grossReceiptsBalance ?? 0;
    const totalBalance = cashBalance + promoBalance + activeCreditsAmount;
    
    // Welcome Bonus Detection
    const hasWelcomeBonus = transactions.some((tx: any) => tx?.type === 'welcome_bonus') && (promoBalance > 0);

    // GR Withdrawal Logic
    let daysSinceGRWithdrawal = 999;
    if (wallet?.lastGrossReceiptsWithdrawalAt) {
        let lastWithdrawalDate: Date;
        if (typeof wallet.lastGrossReceiptsWithdrawalAt.toDate === 'function') {
            lastWithdrawalDate = wallet.lastGrossReceiptsWithdrawalAt.toDate();
        } else if (wallet.lastGrossReceiptsWithdrawalAt.seconds) {
            lastWithdrawalDate = new Date(wallet.lastGrossReceiptsWithdrawalAt.seconds * 1000);
        } else {
            lastWithdrawalDate = new Date(wallet.lastGrossReceiptsWithdrawalAt);
        }
        const diffTime = Math.abs(new Date().getTime() - lastWithdrawalDate.getTime());
        daysSinceGRWithdrawal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    const canWithdrawGR = daysSinceGRWithdrawal >= 28;
    const daysLeftForGR = 28 - daysSinceGRWithdrawal;

    return (
        <div className="space-y-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* ─── RESUMEN DE SALDO (DISEÑO PRODUCTO) ─── */}
            <div className="relative group px-1">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-violet-600 to-indigo-500 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <Card className="relative overflow-hidden bg-zinc-950 border-white/5 rounded-[2.5rem] shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                    <CardContent className="p-8 relative">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-white/5 px-3 py-1 rounded-full border border-white/10 flex items-center gap-1.5">
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-white/50">VamO Pay Protegido</span>
                            </div>
                            {hasWelcomeBonus && (
                                <div className="bg-amber-400/10 text-amber-400 px-3 py-1 rounded-full border border-amber-400/20 flex items-center gap-1.5 animate-pulse">
                                    <Gift className="w-3 h-3" />
                                    <span className="text-[9px] font-black uppercase tracking-wider">Bono Activo</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col items-center text-center space-y-1 py-4">
                            <h1 className="text-7xl font-black italic tracking-tighter text-white">
                                ${totalBalance.toLocaleString('es-AR')}
                            </h1>
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mt-2">Saldo Total Utilizable</span>
                                <p className="text-[9px] text-zinc-600 font-bold mt-1 tracking-wider uppercase">Saldo disponible para viajes</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mt-8">
                            <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5 flex flex-col items-center">
                                <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mb-1">Cargado</p>
                                <p className="font-bold text-xl text-white">${(wallet?.cashBalance || 0).toLocaleString('es-AR')}</p>
                            </div>
                            <div className="bg-indigo-500/5 p-4 rounded-3xl border border-indigo-500/10 flex flex-col items-center">
                                <p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-1">Promociones</p>
                                <p className="font-bold text-xl text-indigo-200">${(wallet?.promoBalance + activeCreditsAmount).toLocaleString('es-AR')}</p>
                            </div>
                        </div>

                        {/* Apartado Ingresos Brutos */}
                        {grossReceiptsBalance > 0 && (
                            <div className="mt-4 p-4 rounded-3xl border border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="text-left">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Apartado Ingresos Brutos</p>
                                    <p className="text-xl font-bold text-amber-100">${grossReceiptsBalance.toLocaleString('es-AR')}</p>
                                    {!canWithdrawGR ? (
                                        <p className="text-[10px] text-red-400 mt-1 font-bold">Disponible en {daysLeftForGR} día{daysLeftForGR !== 1 ? 's' : ''}</p>
                                    ) : (
                                        <p className="text-[10px] text-zinc-400 mt-1">Este monto puede ser transferido a tu saldo principal una vez al mes.</p>
                                    )}
                                </div>
                                <Button
                                    onClick={handleWithdrawGrossReceipts}
                                    disabled={isWithdrawingGR || !canWithdrawGR}
                                    className={`${!canWithdrawGR ? 'bg-zinc-800 text-zinc-500' : 'bg-amber-500 hover:bg-amber-600 text-black'} font-black uppercase text-xs px-6 rounded-2xl h-10`}
                                >
                                    {isWithdrawingGR ? 'Retirando...' : 'Retirar Saldo'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ─── MERCADO PAGO STATUS ─── */}
            {featureFlags.mercadoPagoRequiredEnabled && (
                <MercadoPagoLinkCard
                    mpAccountStatus={profile?.mpAccountStatus}
                    mpLinkedAt={(profile as any)?.mpLinkedAt}
                    compact
                />
            )}

            {featureFlags.passengerWalletTopupEnabled && (
                <>
                    {/* ─── BLOQUE VENDEDOR (TIEMPO REAL) ─── */}
                    <div className="px-1">
                        <div className="bg-gradient-to-br from-indigo-600 to-violet-800 rounded-[2.5rem] p-6 shadow-xl shadow-indigo-900/40 border-t border-white/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                <Zap className="w-24 h-24 text-white" />
                            </div>
                            <div className="relative z-10 space-y-4">
                                <div>
                                    <h3 className="text-2xl font-black text-white italic leading-tight tracking-tighter">
                                        Cargá $10.000 <br/>
                                        <span className="text-amber-300">→ viajás con $12.500</span>
                                    </h3>
                                    <p className="text-white/70 text-[11px] font-medium mt-1">Obtenés 25% extra de inmediato en tu billetera.</p>
                                </div>
                                <Button 
                                    onClick={() => handleTopUpFlow(10000)}
                                    disabled={isTopUpLoading}
                                    className="w-full bg-white text-indigo-900 hover:bg-zinc-100 font-black rounded-2xl h-12 shadow-lg shadow-black/20"
                                >
                                    Cargar $10.000 Ahora
                                    <ArrowUpRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ─── CASHBACK INFO ─── */}
                    <div className="px-1">
                        <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-5 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                                <Sparkles className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-xs font-black text-white uppercase tracking-tight">Recibís 5% Cashback</h4>
                                <p className="text-[10px] text-zinc-500 font-medium leading-tight mt-0.5">
                                    De cada viaje realizado, el 5% vuelve a tu billetera como saldo promocional utilizable.
                                </p>
                            </div>
                            {(promoBalance + activeCreditsAmount > 0) && (
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-zinc-600 uppercase">Saldo Acumulado</p>
                                    <p className="text-sm font-black text-emerald-400">${(promoBalance + activeCreditsAmount).toLocaleString('es-AR')}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── ACCIONES DE CARGA ─── */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 px-3">
                            <PlusCircle className="w-3.5 h-3.5 text-zinc-500" />
                            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-zinc-500">Recargas Directas</h3>
                        </div>
                        
                        {/* Montos Predefinidos */}
                        <div className="grid grid-cols-2 gap-3 px-1">
                            {[5000, 20000].map((amt) => (
                                <Button 
                                    key={amt}
                                    onClick={() => handleTopUpFlow(amt)}
                                    disabled={isTopUpLoading}
                                    variant="outline"
                                    className="h-24 flex flex-col gap-1 items-center justify-center rounded-3xl border-white/5 bg-zinc-900/50 hover:bg-zinc-800 text-white transition-all hover:scale-[1.02] active:scale-95"
                                >
                                    <span className="text-lg font-black tracking-tighter">${amt.toLocaleString('es-AR')}</span>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">
                                        +{amt >= 20000 ? '30%' : '20%'} Extra ✨
                                    </span>
                                </Button>
                            ))}
                        </div>

                        {/* OTRO MONTO (SOLICITADO POR EL USUARIO) */}
                        <div className="px-1">
                            <Card className="bg-zinc-900/40 border-white/5 rounded-3xl overflow-hidden group focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                                <CardContent className="p-4 flex flex-col gap-4">
                                    <div className="flex items-center justify-between px-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Personalizar Recarga</p>
                                        <Sparkles className="w-3 h-3 text-indigo-400 opacity-50" />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                                            <input 
                                                type="number" 
                                                id="custom-amount-input"
                                                placeholder="Ej: 15.000"
                                                className="w-full h-12 pl-8 pr-4 bg-white/5 border border-white/5 rounded-2xl text-white font-black text-lg focus:outline-none focus:border-indigo-500/30 transition-all"
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = parseInt((e.target as HTMLInputElement).value);
                                                        if (val >= 500) handleTopUpFlow(val);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <Button 
                                            onClick={() => {
                                                const input = document.getElementById('custom-amount-input') as HTMLInputElement;
                                                const val = parseInt(input.value);
                                                if (!val || val < 500) {
                                                    toast({ variant: 'destructive', title: 'Monto inválido', description: 'El monto mínimo de carga es $500.' });
                                                    return;
                                                }
                                                handleTopUpFlow(val);
                                            }}
                                            disabled={isTopUpLoading}
                                            className="h-12 w-12 bg-indigo-600 hover:bg-indigo-500 rounded-2xl p-0 shrink-0"
                                        >
                                            <ArrowUpRight className="w-5 h-5 text-white" />
                                        </Button>
                                    </div>
                                    <p className="text-[9px] text-zinc-600 font-medium px-1 italic">
                                        * Se aplicará el bono correspondiente según el monto ingresado.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </>
            )}

            {/* ─── HISTORIAL MEJORADO ─── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-3">
                    <History className="w-3.5 h-3.5 text-zinc-500" />
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-zinc-500">Historial de Confianza</h3>
                </div>
                
                <Card className="border-none bg-zinc-900/30 rounded-[2rem] overflow-hidden">
                    <CardContent className="p-2 pt-4">
                        {transactions.length === 0 ? (
                            <div className="py-12 text-center space-y-3">
                                <VamoIcon name="inbox" className="w-8 h-8 text-zinc-800 mx-auto" />
                                <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">Sin movimientos aún</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {transactions.map((tx: any) => {
                                    const amount = tx?.amount ?? 0;
                                    const type = tx?.type ?? 'unknown';
                                    const isPositive = amount > 0;
                                    
                                    return (
                                        <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-white/[0.02] rounded-2xl transition-all group">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-xl flex items-center justify-center transition-colors shadow-inner",
                                                    isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"
                                                )}>
                                                    <VamoIcon 
                                                        name={isPositive ? (type.includes('bonus') ? 'gift' : 'plus-circle') : 'minus-circle'} 
                                                        className="w-5 h-5" 
                                                    />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <span className={cn(
                                                        "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                                                        isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-500"
                                                    )}>
                                                        {tx.description || (
                                                          type === 'topup_cash' ? 'Recarga Realizada' : 
                                                          type === 'topup_bonus' ? 'Bono de Recarga' :
                                                          type === 'welcome_bonus' ? 'Regalo Bienvenida' : 
                                                          type === 'cashback_reward' ? 'Reembolso Viaje' : 
                                                          type === 'referral_reward' ? 'Premio Referido' :
                                                          (type.includes('ride_wallet') || type.includes('ride_promo')) ? 'Viaje pagado con VamO Pay' : 
                                                          type === 'ride_wallet_lock' ? 'Reserva de Viaje' : 
                                                          type === 'ride_wallet_release' ? 'Reserva Devuelta' : type
                                                        )}
                                                    </span>
                                                    <p className="text-[9px] text-zinc-600 font-medium pl-1">
                                                        {(() => {
                                                            const d = parseFirestoreDate(tx?.createdAt);
                                                            return d ? format(d, 'd MMM, p', { locale: es }) : '-';
                                                        })()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`text-sm font-black italic tabular-nums pr-2 ${isPositive ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                                {isPositive ? '+' : '-'}${Math.abs(amount).toLocaleString('es-AR')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
