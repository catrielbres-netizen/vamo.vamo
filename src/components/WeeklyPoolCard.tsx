'use client';

import React from 'react';
import { useWeeklyPool } from '@/hooks/useWeeklyPool';
import { useUser } from '@/firebase';
import { VamoIcon } from './VamoIcon';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingDown, Zap, Target, Trophy, Clock } from 'lucide-react';
import { weeklyPoolConfig } from '@/config/weeklyPoolConfig';
import { featureFlags } from '@/config/features';

export function WeeklyPoolCard() {
    const { profile } = useUser();
    const {
        pool,
        driverStats,
        dynamicTripsCount,
        dynamicPoints,
        dynamicMultiplier,
        loading,
        poolStatus,
        previousPayout,
        weekId,
    } = useWeeklyPool();

    const isProfessional = profile?.driverSubtype === 'professional';
    const isExpress = profile?.driverSubtype === 'express';
    const isPlanB = featureFlags.vamoParticularModeEnabled;

    if (loading) return <Skeleton className="h-72 w-full rounded-3xl" />;

    const currentPool = pool || { currentAmount: weeklyPoolConfig.initialPoolAmount, maxAmount: weeklyPoolConfig.maxDisplayedGoal };
    const currentAmount = Math.floor(currentPool.currentAmount);
    const maxAmount = currentPool.maxAmount || weeklyPoolConfig.maxDisplayedGoal;
    const progressPercent = Math.min(100, (currentAmount / maxAmount) * 100);

    const rank = driverStats?.rank || 0;
    const estimatedPayout = Math.floor(driverStats?.estimatedPayout || 0);
    const completedTrips = driverStats?.completedTrips || 0;
    const weeklyPoints = driverStats?.weeklyPoints || 0;

    const isQualified = completedTrips >= 1;  // 1 viaje = califica
    const eligibleCount = weeklyPoolConfig.eligibleTopCount;
    const isInTopN = rank > 0 && rank <= eligibleCount;
    const isDistributed = poolStatus === 'distributed';

    return (
        <Card className="overflow-hidden border-zinc-800 bg-zinc-900/40 backdrop-blur-xl rounded-3xl shadow-2xl relative">
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-[80px]" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[80px]" />

            <CardContent className="p-6 relative z-10">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="relative flex h-2 w-2">
                                <span className={cn(
                                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                    isDistributed ? "bg-emerald-500" : "bg-primary"
                                )}></span>
                                <span className={cn(
                                    "relative inline-flex rounded-full h-2 w-2",
                                    isDistributed ? "bg-emerald-500" : "bg-primary"
                                )}></span>
                            </span>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">POZO SEMANAL CONDUCTORES</h3>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium">
                            Cada viaje finalizado válido suma al ranking semanal de tu ciudad.
                        </p>
                    </div>
                    {isInTopN && (
                        <div className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            rank <= 2 ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                            : rank <= 6 ? "bg-primary/10 border border-primary/20 text-primary"
                            : rank <= 10 ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                            : "bg-white/5 border border-white/10 text-zinc-400"
                        )}>
                            Top {rank}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Pool Display */}
                    <div className="text-center space-y-1">
                        {(!pool || (pool.totalCompletedTrips || 0) === 0) ? (
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
                        {/* Semana en curso / distribuida */}
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                            {isDistributed ? (
                                <>
                                    <VamoIcon name="check-circle" className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Semana anterior distribuida</span>
                                </>
                            ) : (
                                <>
                                    <Clock className="w-3 h-3 text-zinc-500" />
                                    <span className="text-[9px] font-medium text-zinc-500">Semana en curso — reparto cada lunes</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Progress Bar 10 Trips Target */}
                    <div className="space-y-2 px-2">
                        <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                            <span>Cada viaje finalizado válido suma ${weeklyPoolConfig.contributionPerCompletedTrip} al pozo</span>
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

                    {/* Progress Bar City Pool */}
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

                    {/* Stats Grid */}
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
                                        rank <= 2 ? "text-amber-400" : rank <= 6 ? "text-primary" : "text-zinc-400"
                                    )}>#{rank}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bloque de Posición en el Ranking — visible si calificado */}
                    {isQualified && (
                        <div className={cn(
                            "rounded-2xl border p-4 flex flex-col gap-3",
                            isInTopN
                                ? rank <= 2
                                    ? "bg-amber-500/10 border-amber-500/30"
                                    : rank <= 6
                                        ? "bg-primary/10 border-primary/30"
                                        : rank <= 10
                                            ? "bg-emerald-500/10 border-emerald-500/30"
                                            : "bg-white/5 border-white/10"
                                : "bg-zinc-800/50 border-zinc-700/30"
                        )}>
                            <div className="flex items-center justify-between">
                                <p className={cn(
                                    "text-[10px] font-black uppercase tracking-widest",
                                    isInTopN && rank <= 2 ? "text-amber-400"
                                    : isInTopN && rank <= 6 ? "text-primary"
                                    : isInTopN && rank <= 10 ? "text-emerald-400"
                                    : isInTopN ? "text-zinc-400"
                                    : "text-zinc-500"
                                )}>
                                    Tu posición en el ranking
                                </p>
                                {isInTopN && (
                                    <span className={cn(
                                        "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider",
                                        rank <= 2 ? "bg-amber-500/20 text-amber-400"
                                        : rank <= 6 ? "bg-primary/20 text-primary"
                                        : rank <= 10 ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-white/10 text-zinc-400"
                                    )}>
                                        {rank <= 2 ? "🥇 Top 2" : rank <= 6 ? "🥈 Top 6" : rank <= 10 ? "🥉 Top 10" : "Top " + eligibleCount}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-end gap-3">
                                <span className={cn(
                                    "text-5xl font-black italic tracking-tighter leading-none",
                                    isInTopN && rank <= 2 ? "text-amber-400"
                                    : isInTopN && rank <= 6 ? "text-primary"
                                    : isInTopN && rank <= 10 ? "text-emerald-400"
                                    : isInTopN ? "text-zinc-300"
                                    : "text-zinc-600"
                                )}>
                                    {isInTopN ? `#${rank}` : '--'}
                                </span>
                                <div className="flex flex-col pb-1">
                                    {isInTopN ? (
                                        <>
                                            <span className={cn(
                                                "text-xs font-black",
                                                rank <= 2 ? "text-amber-400" : rank <= 6 ? "text-primary" : "text-zinc-400"
                                            )}>
                                                Premio dinámico por multiplicador
                                            </span>
                                            <span className="text-[9px] text-zinc-500">{completedTrips} viajes válidos esta semana</span>
                                        </>
                                    ) : (
                                        <span className="text-[10px] text-zinc-500 leading-snug max-w-[140px]">
                                            Seguí sumando viajes para entrar al Top {eligibleCount} y cobrar
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Premio de semana anterior (si fue distribuida y te tocó algo) */}
                    {previousPayout && previousPayout.payoutAmount > 0 && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Premio Semana Anterior</p>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-white tracking-tight italic">
                                    ${previousPayout.payoutAmount.toLocaleString('es-AR')}
                                </span>
                                <span className="text-[10px] text-emerald-400 font-bold">
                                    Puesto #{previousPayout.rank} · x{previousPayout.multiplier.toFixed(1)}
                                </span>
                            </div>
                            <p className="text-[9px] text-zinc-500">Acreditado en tu billetera VamO</p>
                        </div>
                    )}

                    {/* Estimated Prize — UI honesta */}
                    <div className="relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-emerald-400/20 blur-xl opacity-50" />
                        <div className="relative p-5 bg-white/10 rounded-[2rem] border border-white/20 backdrop-blur-sm flex flex-col items-center">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Tu Premio Estimado</p>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white tracking-tight italic">
                                    ${estimatedPayout > 0 ? estimatedPayout.toLocaleString('es-AR') : '—'}
                                </span>
                            </div>
                            <p className="text-[9px] text-zinc-500 mt-2 text-center max-w-[220px]">
                                {!isQualified
                                    ? 'Completá tu primer viaje finalizado válido para entrar al ranking.'
                                    : !isInTopN
                                        ? `¡Calificaste! Seguí sumando viajes para entrar al Top ${eligibleCount} y cobrar.`
                                        : estimatedPayout > 0
                                            ? `Premio estimado en el puesto #${rank}.`
                                            : 'Completá más viajes esta semana.'
                                }
                            </p>
                            {isQualified && !isDistributed && (
                                <div className="mt-3 flex items-center gap-1.5 bg-zinc-900/50 rounded-xl px-3 py-1.5 border border-white/5">
                                    <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                                    <p className="text-[8px] text-zinc-500 font-medium">
                                        El reparto se realiza cada lunes a las 00:10 hs.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Multipliers Legend */}
                    <div className="pt-2">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter text-zinc-600 px-1 mb-2">
                            <span>REPARTO DINÁMICO SEGÚN POZO REAL</span>
                            <span className="text-primary/60 italic">Multiplicador de premio</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                            {weeklyPoolConfig.multipliersByRank.map((tier, i) => (
                                <div key={i} className={cn(
                                    "px-2 py-1.5 rounded-lg flex flex-col items-center border",
                                    isInTopN && rank >= tier.min && rank <= tier.max
                                        ? "bg-primary/15 border-primary/30"
                                        : "bg-white/5 border-white/5"
                                )}>
                                    <span className="text-[8px] text-zinc-500">Puestos {tier.min}-{tier.max}</span>
                                    <span className={cn(
                                        "text-[9px] font-black",
                                        isInTopN && rank >= tier.min && rank <= tier.max ? "text-primary" : "text-zinc-400"
                                    )}>x{tier.multiplier.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PLAN B TEXT */}
                    {isPlanB && (
                        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3 animate-in fade-in duration-300">
                             <p className="text-[10px] text-zinc-400 italic leading-snug">
                                Top {eligibleCount} visible para seguimiento. Premian los conductores configurados según el pozo real.
                            </p>
                            <p className="text-[10px] font-bold text-zinc-300 italic text-center">
                                Los premios se calculan sobre el pozo real acumulado. El monto final depende de los viajes completados de la semana y del ranking al cierre.
                            </p>
                        </div>
                    )}

                    {/* BENEFICIOS TARIFA DINAMICA — solo professional */}
                    {!isPlanB && isProfessional && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col gap-3 animate-in fade-in duration-300">
                            <div className="flex items-center gap-1.5">
                                <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                                    Beneficios Tarifa Dinamica
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col">
                                    <span className="text-[9px] text-zinc-500 font-black uppercase mb-1">Viajes dinamicos</span>
                                    <span className="text-lg font-black text-white italic">{dynamicTripsCount}</span>
                                    <span className="text-[8px] text-zinc-600 mt-0.5">esta semana</span>
                                </div>
                                <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col">
                                    <span className="text-[9px] text-zinc-500 font-black uppercase mb-1">Multiplicador</span>
                                    <span className={cn(
                                        "text-lg font-black italic",
                                        dynamicMultiplier >= 1.35 ? "text-amber-400"
                                        : dynamicMultiplier >= 1.20 ? "text-emerald-400"
                                        : "text-zinc-400"
                                    )}>
                                        {dynamicMultiplier >= 1.01 ? `x${dynamicMultiplier.toFixed(2)}` : 'x1.00'}
                                    </span>
                                    <span className="text-[8px] text-zinc-600 mt-0.5">Tarifa Dinamica</span>
                                </div>
                            </div>

                            {dynamicTripsCount >= 20 ? (
                                <div className="flex items-center gap-2 px-1">
                                    <Target className="w-3 h-3 text-amber-400 shrink-0" />
                                    <p className="text-[9px] text-amber-400 font-bold">
                                        Meta maxima alcanzada! Multiplicador x1.35 activo.
                                    </p>
                                </div>
                            ) : dynamicTripsCount >= 10 ? (
                                <div className="flex items-center gap-2 px-1">
                                    <Target className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <p className="text-[9px] text-emerald-400 font-bold">
                                        Te faltan {Math.max(0, 20 - dynamicTripsCount)} viajes dinamicos para llegar a x1.35
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-1">
                                    <Target className="w-3 h-3 text-zinc-500 shrink-0" />
                                    <p className="text-[9px] text-zinc-500 font-bold">
                                        Te faltan {Math.max(0, 10 - dynamicTripsCount)} viajes dinamicos para llegar a x1.20
                                    </p>
                                </div>
                            )}

                            <p className="text-[8px] text-zinc-600 italic leading-snug border-t border-emerald-500/10 pt-2">
                                Los beneficios por Tarifa Dinamica aplican a taxis/remises que aceptan viajes con descuento.
                            </p>
                        </div>
                    )}

                    {/* MENSAJE INFORMATIVO PARA EXPRESS */}
                    {!isPlanB && isExpress && (
                        <div className="rounded-2xl border border-zinc-700/40 bg-zinc-800/30 p-4 flex items-start gap-2">
                            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-[9px] text-zinc-500 italic leading-snug">
                                Los viajes Express trabajan con Tarifa Dinamica obligatoria. El multiplicador voluntario aplica solo a taxis y remises.
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-6 text-center">
                    <p className="text-[10px] font-medium text-zinc-600 italic">
                        Mientras mas viajes se completan en tu ciudad, mas crece el pozo.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
