'use client';

import React from 'react';
import { usePassengerWeeklyPool } from '@/hooks/usePassengerWeeklyPool';
import { useUser } from '@/firebase';
import { VamoIcon } from './VamoIcon';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Trophy } from 'lucide-react';
import { passengerWeeklyPoolConfig } from '@/config/passengerWeeklyPoolConfig';

export function PassengerWeeklyPoolCard() {
    const { profile } = useUser();
    const {
        pool,
        passengerStats,
        dynamicTripsCount,
        dynamicPoints,
        dynamicMultiplier,
        loading,
        poolStatus,
        previousPayout,
        weekId,
    } = usePassengerWeeklyPool();

    if (loading) return <Skeleton className="h-72 w-full rounded-3xl" />;

    const currentPool = pool || { currentAmount: passengerWeeklyPoolConfig.initialPoolAmount, maxAmount: passengerWeeklyPoolConfig.maxDisplayedGoal };
    const currentAmount = Math.floor(currentPool.currentAmount);
    const maxAmount = currentPool.maxAmount || passengerWeeklyPoolConfig.maxDisplayedGoal;
    const progressPercent = Math.min(100, (currentAmount / maxAmount) * 100);

    const rank = passengerStats?.rank || 0;
    const estimatedPayout = Math.floor(passengerStats?.estimatedPayout || 0);
    const completedTrips = passengerStats?.weeklyTripsCount || 0;
    const weeklyPoints = passengerStats?.weeklyPoints || 0;

    const isQualified = completedTrips >= 1;
    const eligibleCount = passengerWeeklyPoolConfig.eligibleTopCount;
    const isInTopN = rank > 0 && rank <= eligibleCount;
    const isDistributed = poolStatus === 'distributed';

    return (
        <Card className="overflow-hidden border-zinc-800 bg-zinc-900/40 backdrop-blur-xl rounded-3xl shadow-2xl relative">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-[80px]" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[80px]" />

            <CardContent className="p-6 relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="relative flex h-2 w-2">
                                <span className={cn(
                                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                    isDistributed ? "bg-emerald-500" : "bg-indigo-500"
                                )}></span>
                                <span className={cn(
                                    "relative inline-flex rounded-full h-2 w-2",
                                    isDistributed ? "bg-emerald-500" : "bg-indigo-500"
                                )}></span>
                            </span>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">POZO SEMANAL PASAJEROS</h3>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium">
                            Cada viaje finalizado suma al ranking semanal de tu ciudad.
                        </p>
                    </div>
                    {isInTopN && (
                        <div className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            rank <= 3 ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                            : rank <= 10 ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                            : rank <= 20 ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                            : "bg-white/5 border border-white/10 text-zinc-400"
                        )}>
                            Top {rank}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="text-center space-y-1">
                        {(!pool || (pool.completedValidRides || 0) === 0) ? (
                            <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest mb-2 italic">
                                Pozo semanal pendiente de creación. Se activará con el primer viaje válido.
                            </p>
                        ) : (
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-2">
                                Pozo semanal activo
                            </p>
                        )}
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Pozo Acumulado</p>
                        <div className="flex justify-center items-baseline gap-1">
                            <span className="text-5xl font-black italic tracking-tighter text-white">
                                ${currentAmount.toLocaleString('es-AR')}
                            </span>
                            <span className="text-xs text-zinc-600 font-bold">/ ${maxAmount.toLocaleString('es-AR')}</span>
                        </div>
                        <p className="text-center text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-2 flex items-center justify-center gap-2">
                            Meta del pozo: ${maxAmount.toLocaleString('es-AR')}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-zinc-700 hover:text-white transition-colors">
                                  <VamoIcon name="info" className="w-2.5 h-2.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 bg-zinc-950 border-white/10 rounded-2xl p-4 shadow-2xl">
                                <p className="text-[10px] text-zinc-400 leading-relaxed">
                                  Monto meta que la ciudad busca alcanzar para el premio semanal.
                                </p>
                              </PopoverContent>
                            </Popover>
                        </p>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                            {isDistributed ? (
                                <>
                                    <VamoIcon name="check-circle" className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Semana anterior distribuida</span>
                                </>
                            ) : (
                                <>
                                    <Clock className="w-3 h-3 text-zinc-500" />
                                    <span className="text-[9px] font-medium text-zinc-500">Semana en curso — reparto cada domingo</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2 px-2">
                        <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                            <span>Cada viaje finalizado suma ${passengerWeeklyPoolConfig.contributionPerCompletedTrip} al pozo</span>
                            <span className={cn(isQualified ? "text-emerald-400" : "text-zinc-500")}>
                                {completedTrips} viaje{completedTrips !== 1 ? 's' : ''}
                            </span>
                        </div>
                        {!isQualified && (
                            <p className="text-[8px] text-zinc-500 text-center">
                                Completá tu primer viaje para entrar al ranking
                            </p>
                        )}
                        {isQualified && !isInTopN && (
                            <p className="text-[8px] text-amber-400 text-center font-bold">
                                Estás fuera del Top {eligibleCount} — seguí sumando viajes para entrar
                            </p>
                        )}
                        {isQualified && (
                            <div className="flex items-center gap-1 justify-center animate-in fade-in zoom-in duration-500">
                                <VamoIcon name="check-circle" className="w-2.5 h-2.5 text-emerald-400" />
                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">En el ranking semanal</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2 opacity-60">
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                className="h-full bg-zinc-700"
                            />
                        </div>
                        <p className="text-center text-[7px] text-zinc-600 font-bold uppercase tracking-widest">
                            Crecimiento del pozo: ${currentAmount.toLocaleString('es-AR')} / ${maxAmount.toLocaleString('es-AR')}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <p className="text-[10px] text-zinc-500 font-black uppercase mb-1">Tus Viajes</p>
                            <p className="text-xl font-black text-white italic">{completedTrips || '0'}</p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <p className="text-[10px] text-zinc-500 font-black uppercase mb-1">Tus Puntos</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-black text-white italic">{weeklyPoints || '0'}</p>
                                {isInTopN && (
                                    <span className={cn(
                                        "text-[10px] font-black",
                                        rank <= 3 ? "text-amber-400" : rank <= 10 ? "text-indigo-400" : "text-zinc-400"
                                    )}>#{rank}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {isQualified && isInTopN && (
                        <div className="p-4 bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl border border-amber-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                    Tu posición en el ranking
                                </h4>
                                <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-[9px] font-black border border-amber-500/30 flex items-center gap-1">
                                    <Trophy className="w-3 h-3" />
                                    Top {rank}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-4xl font-black italic tracking-tighter text-amber-500 drop-shadow-sm">
                                    #{rank}
                                </span>
                                <div>
                                    <p className="text-xs font-black text-amber-400 leading-tight">
                                        Premio dinámico por multiplicador
                                    </p>
                                    <p className="text-[9px] text-amber-500/60 mt-0.5">
                                        {completedTrips} viajes válidos esta semana
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-3xl p-6 border border-white/5 relative overflow-hidden shadow-inner">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-50" />
                        <div className="relative z-10 text-center">
                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2 drop-shadow-sm">
                                Tu premio estimado
                            </h4>
                            <div className="flex justify-center items-center gap-2 mb-2">
                                <span className="text-4xl font-black text-white italic tracking-tighter drop-shadow-md">
                                    ${estimatedPayout.toLocaleString('es-AR')}
                                </span>
                            </div>
                            <p className="text-[9px] text-zinc-500 font-medium mb-4">
                                {isInTopN ? `Premio estimado en el puesto #${rank}.` : 'Completá viajes para entrar al Top 20 y ganar.'}
                            </p>
                            <div className="inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
                                <Clock className="w-3 h-3 text-zinc-500" />
                                <span className="text-[8px] text-zinc-400 font-medium tracking-wide">
                                    El reparto se realiza cada domingo a las 23:55 hs.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-950/50 rounded-2xl p-4 border border-white/5">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                Reparto dinámico según pozo real
                            </h4>
                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest italic">
                                Multiplicador de premio
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {passengerWeeklyPoolConfig.multipliersByRank.map((tier, idx) => {
                                const isActiveTier = rank >= tier.min && rank <= tier.max;
                                return (
                                    <div key={idx} className={cn(
                                        "flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all",
                                        isActiveTier 
                                        ? "bg-indigo-500/10 border-indigo-500/30 shadow-sm" 
                                        : "bg-white/5 border-transparent"
                                    )}>
                                        <span className="text-[9px] text-zinc-500 font-medium">Puestos {tier.min}-{tier.max}</span>
                                        <span className={cn(
                                            "text-[10px] font-black mt-0.5",
                                            isActiveTier ? "text-indigo-400" : "text-white"
                                        )}>x{tier.multiplier.toFixed(1)}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[8px] text-zinc-600 text-center mt-3 italic font-medium">
                            Mientras más viajes se completan en tu ciudad, más crece el pozo.
                        </p>
                    </div>

                    {previousPayout !== null && previousPayout > 0 && (
                        <div className="mt-4 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Premio Semana Anterior</p>
                            <p className="text-xl font-black text-white italic tracking-tighter">${previousPayout.toLocaleString('es-AR')}</p>
                            <p className="text-[9px] text-emerald-500/60 mt-1">Acreditado en tu billetera VamO Pay</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
