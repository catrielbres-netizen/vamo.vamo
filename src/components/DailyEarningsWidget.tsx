'use client';

import React from 'react';
import { useDriverData } from '@/context/DriverRealtimeProvider';
import { useWeeklyPool } from '@/hooks/useWeeklyPool';
import { VamoIcon } from '@/components/VamoIcon';
import { getArgentinaDateStr } from '@/lib/date';
import { safeFixed } from '@/lib/formatters';

export function DailyEarningsWidget() {
    const { profile } = useDriverData();
    const { driverStats } = useWeeklyPool();
    
    if (!profile || profile.role !== 'driver') return null;

    const todayStr = getArgentinaDateStr();
    const stats = profile.dailyStats?.lastResetDate === todayStr 
        ? profile.dailyStats 
        : { ridesCount: 0, earningsDaily: 0, kilometersDaily: 0, onlineSeconds: 0 };

    const formatCurrency = (v: number) => new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(v);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    return (
        <div className="relative w-full bg-zinc-950/90 border border-white/10 rounded-[2rem] p-5 flex flex-col gap-4 animate-in fade-in duration-500 shadow-xl">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                    <VamoIcon name="trending-up" className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="flex flex-col flex-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-0.5">Ganancias Hoy</span>
                    <span className="text-2xl font-black text-white italic tracking-tighter leading-none">{formatCurrency(stats.earningsDaily || 0)}</span>
                </div>
            </div>
                
                <div className="grid grid-cols-3 gap-2 mt-1 border-t border-white/5 pt-2">
                    <div className="flex flex-col">
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Viajes</span>
                        <span className="text-xs font-black text-white leading-none">{stats.ridesCount || 0}</span>
                    </div>
                    <div className="flex flex-col border-l border-white/5 pl-2">
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Distancia</span>
                        <span className="text-xs font-black text-indigo-400 leading-none">{safeFixed(stats.kilometersDaily, 1)} km</span>
                    </div>
                    <div className="flex flex-col border-l border-white/5 pl-2">
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Activo</span>
                        <span className="text-xs font-black text-emerald-400 leading-none">{formatTime(stats.onlineSeconds || 0)}</span>
                    </div>
                </div>

                {/* [VamO PRO] Weekly Stats Row */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-500/10">
                    <div className="flex items-center gap-1">
                        <VamoIcon name="award" className="w-2.5 h-2.5 text-indigo-400" />
                        <span className="text-[8px] font-black text-zinc-500 uppercase">Ranking Semanal</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white italic">{driverStats?.weeklyPoints || 0} pts</span>
                        {driverStats?.rank && driverStats.rank > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[8px] font-black text-indigo-400">
                                #{driverStats.rank}
                            </span>
                        ) : (
                            <span className="text-[8px] font-black text-zinc-600 italic">Fuera de Top 30</span>
                        )}
                    </div>
                </div>
        </div>
    );
}
