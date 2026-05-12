'use client';

import React from 'react';
import { VamoIcon } from './VamoIcon';
import { useUser, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export function PassengerSmallBalance() {
    const { user } = useUser();
    const firebaseApp = useFirebaseApp();
    const router = useRouter();

    const { data: walletResponse, isLoading: isWalletLoading } = useQuery({
        queryKey: ['wallet', user?.uid],
        queryFn: async () => {
            if (!firebaseApp) return null;
            const functions = getFunctions(firebaseApp, 'us-central1');
            const getWallet = httpsCallable(functions, 'getMyWalletV1');
            const result = await getWallet();
            return result.data as any;
        },
        enabled: !!user && !!firebaseApp,
        staleTime: 30000, 
    });

    const wallet = walletResponse?.wallet;
    const cashBalance = wallet?.cashBalance ?? 0;
    const promoBalance = wallet?.promoBalance ?? 0;
    const combinedTotal = cashBalance + promoBalance;

    if (isWalletLoading) {
        return (
            <div className="h-10 w-28 bg-zinc-900/30 animate-pulse rounded-full border border-white/5" />
        );
    }

    return (
        <button 
            onClick={() => router.push('/dashboard/wallet')}
            className="flex items-center gap-2.5 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl transition-all active:scale-95 group relative overflow-hidden"
            title="Abrir mi billetera"
        >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-1.5 rounded-full shadow-lg group-hover:scale-110 transition-transform">
                <VamoIcon name="wallet" className="w-3 h-3 text-white" />
            </div>
            
            <div className="flex flex-col items-start leading-none relative z-10">
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-0.5">Saldo</span>
                <span className="text-[13px] font-black text-white tracking-tighter leading-none">
                    ${combinedTotal.toLocaleString('es-AR')}
                </span>
            </div>
            
            <VamoIcon name="chevron-right" className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors ml-0.5" />
        </button>
    );
}
