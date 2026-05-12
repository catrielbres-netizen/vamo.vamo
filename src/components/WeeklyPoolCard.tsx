'use client';

import React from 'react';
import { useWeeklyPool } from '@/hooks/useWeeklyPool';
import { VamoIcon } from './VamoIcon';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function WeeklyPoolCard() {
    const { 
        pool,
        driverStats,
        loading,
        error
    } = useWeeklyPool();

    if (loading) return <Skeleton className="h-72 w-full rounded-3xl" />;
    
    // The hook now always provides a fallback pool, but we keep a safety check
    const currentPool = pool || { currentAmount: 50000, maxAmount: 300000 };

    const currentAmount = Math.floor(currentPool.currentAmount);
    const maxAmount = currentPool.maxAmount;
    const progressPercent = Math.min(100, (currentAmount / maxAmount) * 100);
    
    const rank = driverStats?.rank || 0;
    const multiplier = driverStats?.multiplier || 0;
    const estimatedPayout = Math.floor(driverStats?.estimatedPayout || 0);
    const completedTrips = driverStats?.completedTrips || 0;

    return (
        <Card className="overflow-hidden border-zinc-800 bg-zinc-900/40 backdrop-blur-xl rounded-3xl shadow-2xl relative">
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-[80px]" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[80px]" />

            <CardContent className="p-6 relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Batalla Semanal VamO</h3>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium">Cada viaje suma. ¡Tu ciudad compite por el pozo!</p>
                    </div>
                    {rank > 0 && (
                        <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                            Top {rank}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Pool Display */}
                    <div className="text-center space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Pozo Acumulado</p>
                        <div className="flex justify-center items-baseline gap-1">
                            <span className="text-5xl font-black italic tracking-tighter text-white">
                                ${currentAmount.toLocaleString()}
                            </span>
                            <span className="text-xs text-zinc-600 font-bold">/ ${maxAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                className="h-full bg-gradient-to-r from-primary to-emerald-400"
                            />
                        </div>
                        <p className="text-center text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                            Tope del pozo: $300.000
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <p className="text-[10px] text-zinc-500 font-black uppercase mb-1">Tus Viajes</p>
                            <p className="text-xl font-black text-white italic">{completedTrips || '0'}</p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <p className="text-[10px] text-zinc-500 font-black uppercase mb-1">Multiplicador</p>
                            <p className="text-xl font-black text-white italic">
                                {multiplier > 0 ? `x${multiplier}` : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Estimated Prize */}
                    <div className="relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-emerald-400/20 blur-xl opacity-50" />
                        <div className="relative p-5 bg-white/10 rounded-[2rem] border border-white/20 backdrop-blur-sm flex flex-col items-center">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Tu Premio Estimado</p>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className="text-zinc-600 hover:text-white transition-colors">
                                            <VamoIcon name="info" className="w-3 h-3" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 bg-zinc-950 border-white/10 rounded-2xl p-4 shadow-2xl">
                                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                                            Monto aproximado que recibirás el lunes. Varía según tu puntaje y el de los demás competidores.
                                        </p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-white tracking-tight italic">
                                    ${estimatedPayout > 0 ? estimatedPayout.toLocaleString() : '0'}
                                </span>
                            </div>
                            <p className="text-[9px] text-zinc-500 mt-2 text-center max-w-[200px]">
                                {rank > 0 
                                    ? `¡Excelente! Estás en el puesto #${rank} del ranking.`
                                    : "Completá 10 viajes para clasificar y entrar al reparto."
                                }
                            </p>
                        </div>
                    </div>

                    {/* Multipliers Legend */}
                    <div className="pt-2">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter text-zinc-600 px-1 mb-2">
                            <span>REPARTO TOP 10</span>
                            <span className="text-primary/60 italic">Multiplicadores</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10 flex flex-col items-center">
                                <span className="text-[8px] text-zinc-500">1º-2º</span>
                                <span className="text-xs font-black text-primary">x1.5</span>
                            </div>
                            <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/5 flex flex-col items-center">
                                <span className="text-[8px] text-zinc-500">3º-6º</span>
                                <span className="text-xs font-black text-zinc-400">x1.2</span>
                            </div>
                            <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/5 flex flex-col items-center">
                                <span className="text-[8px] text-zinc-500">7º-10º</span>
                                <span className="text-xs font-black text-zinc-500">x1.0</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-[10px] font-medium text-zinc-600 italic">
                        “Mientras más viajes se completan en tu ciudad, más crece el pozo.”
                    </p>
                </div>
            </CardContent>
        </Card>
    );

}
