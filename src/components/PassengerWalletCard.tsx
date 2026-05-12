'use client';

import React from 'react';
import { usePassengerWallet } from '@/hooks/usePassengerWallet';
import { VamoIcon } from './VamoIcon';
import { Card, CardContent } from './ui/card';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser, useFirebaseApp } from '@/firebase';
import { useRouter } from 'next/navigation';
import { usePassengerData } from '@/context/PassengerDataProvider';

export function PassengerWalletCard() {
    // 1. All hooks at the top level
    const [mounted, setMounted] = React.useState(false);
    const { totalBalance, wallet, isLoading: isWalletLoading } = usePassengerWallet();
    const { isGrantingBonus } = usePassengerData();
    const router = useRouter();

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // 2. Memoized values and derived state
    const cashBalance = wallet?.cashBalance ?? 0;
    const promoBalance = wallet?.promoBalance ?? 0;
    const isFirstTime = totalBalance > 0 && (cashBalance === 0);
    
    const cardClasses = React.useMemo(() => {
        return `relative overflow-hidden border-none bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-950 text-white shadow-2xl shadow-indigo-500/30 cursor-pointer hover:scale-[1.01] active:scale-[0.98] transition-all ${isFirstTime ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-950' : ''}`;
    }, [isFirstTime]);

    const combinedTotal = totalBalance;

    // 3. Early returns (ONLY AFTER ALL HOOKS)
    if (!mounted) return <div className="h-[88px] w-full bg-zinc-900/10 rounded-2xl" />;
    
    if (isWalletLoading) {
        return (
            <div className="h-[88px] w-full bg-zinc-900/30 animate-pulse rounded-2xl border border-white/5" />
        );
    }

    // 4. Main render
    return (
        <Card 
            onClick={() => router.push('/dashboard/wallet')}
            className={cardClasses}
        >
            {/* Shimmer effect for new users */}
            {isFirstTime && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
            )}

            <CardContent className="p-4 relative">
                <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.15em]">Billetera VamO</p>
                            {isFirstTime && (
                                <span className="bg-amber-400 text-black text-[8px] px-1.5 py-0.5 rounded-full font-black animate-bounce">
                                    ¡REGALO!
                                </span>
                            )}
                        </div>
                        <h3 className="text-3xl font-black tabular-nums tracking-tighter">
                            ${combinedTotal.toLocaleString('es-AR')}
                        </h3>
                    </div>
                    <div className="h-10 w-10 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 rotate-3 group-hover:rotate-6 transition-transform">
                        <VamoIcon name="gift" className={`w-5 h-5 ${isFirstTime ? 'text-amber-300' : 'text-white'}`} />
                    </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 rounded-xl hover:bg-white/20 transition-colors">
                        <VamoIcon name="plus-circle" className="w-3.5 h-3.5 text-indigo-200" />
                        <span className="text-[10px] font-bold">Cargar saldo & bonos</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-black text-white/50 group">
                        DETALLES
                        <VamoIcon name="chevron-right" className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
