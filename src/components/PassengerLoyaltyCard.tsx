'use client';

import React from 'react';
import { useUser } from '@/firebase';
import { VamoIcon } from './VamoIcon';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export function PassengerLoyaltyCard() {
    const { profile, loading } = useUser();
    
    if (loading || !profile) return null;

    const points = profile.vamoPoints || 0;
    
    // Tiered Goals
    const TIER_1 = 5;
    const TIER_2 = 10;
    const TIER_3 = 20;

    let currentGoal = TIER_1;
    let nextRewardName = "Beneficio Inicial";
    let missingPoints = 0;
    let message = "";

    if (points < TIER_1) {
        currentGoal = TIER_1;
        nextRewardName = "Viaje Express Gratis";
        missingPoints = TIER_1 - points;
        message = `Te faltan ${missingPoints} puntos para tu primer beneficio`;
    } else if (points < TIER_2) {
        currentGoal = TIER_2;
        nextRewardName = "Descuento del 10%";
        missingPoints = TIER_2 - points;
        message = `Te faltan ${missingPoints} puntos para tu próximo beneficio`;
    } else if (points < TIER_3) {
        currentGoal = TIER_3;
        nextRewardName = "Beneficio Mayor";
        missingPoints = TIER_3 - points;
        message = `Te faltan ${missingPoints} puntos para el beneficio mayor`;
    } else {
        currentGoal = TIER_3;
        nextRewardName = "Beneficio Premium";
        message = "¡Tenés premios disponibles!";
    }

    const previousTier = points < TIER_1 ? 0 : points < TIER_2 ? TIER_1 : points < TIER_3 ? TIER_2 : TIER_3;
    const progressRange = currentGoal - previousTier;
    const pointsInCurrentRange = points - previousTier;
    const progress = currentGoal === previousTier ? 100 : Math.min((pointsInCurrentRange / progressRange) * 100, 100);
    
    const isVip = (profile.averageRating || 5) >= 4.9 && (profile.passengerStats?.completedRides || 0) >= 5;

    return (
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-[2rem] p-5 space-y-4">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">VamO Points</span>
                        {isVip && (
                            <span className="flex items-center gap-1 bg-amber-500/10 text-amber-500 text-[8px] font-black px-2 py-0.5 rounded-full border border-amber-500/20">
                                <VamoIcon name="star" className="h-2 w-2 fill-amber-500" />
                                PASAJERO VIP
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-bold text-white">
                        {message}
                    </p>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-black text-white">{points}</span>
                    <span className="text-[10px] block text-zinc-500 uppercase font-bold">acumulados</span>
                </div>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    <span>Progreso al siguiente nivel</span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-white/5 [&>div]:bg-indigo-500" />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                        <VamoIcon name="gift" className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Próxima Recompensa</span>
                        <span className="text-[11px] font-bold text-zinc-300">{nextRewardName}</span>
                    </div>
                </div>
                {points >= TIER_1 && (
                    <button 
                        className="bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                        onClick={() => {
                            alert("¡Genial! Tus beneficios se aplicarán automáticamente en tus próximos viajes.");
                        }}
                    >
                        Ver detalles
                    </button>
                )}
            </div>
        </div>
    );
}
