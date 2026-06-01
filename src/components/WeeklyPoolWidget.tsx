'use client';

import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { useDoc } from '@/firebase/firestore/use-doc';
import { RewardsConfig, DriverPoints } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWeeklyPool } from '@/hooks/useWeeklyPool';
import { weeklyPoolConfig } from '@/config/weeklyPoolConfig';

export function WeeklyPoolWidget() {
  const { pool, driverStats, loading } = useWeeklyPool();

  if (loading || !pool) return null;

  const weeklyTrips = driverStats?.completedTrips || 0;
  const poolAmount = pool.currentAmount || 0;
  
  // Crecimiento total de la semana (base: initialPoolAmount)
  const baseWeeklyAmount = weeklyPoolConfig.initialPoolAmount;
  const weeklyGrowth = Math.max(0, poolAmount - baseWeeklyAmount);

  const minTrips = 1; 
  const isQualified = weeklyTrips >= minTrips;
  const progress = Math.min(100, (weeklyTrips / minTrips) * 100);

  const estimatedShare = driverStats?.estimatedPayout || 0;

  // Redondear a enteros para evitar decimales largos
  const formattedCurrency = (val: number) => 
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.floor(val));

  return (
    <Card className="glass-morphism border border-white/10 shadow-2xl p-6 rounded-[2.5rem] overflow-hidden relative mb-6 bg-gradient-to-br from-zinc-900/40 to-black/60">
      {/* Background Decor */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-orange-500/10 blur-[60px] rounded-full" />
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-indigo-500/10 blur-[60px] rounded-full" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <VamoIcon name="target" className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-orange-500/80 mb-1">POZO SEMANAL CONDUCTORES</h3>
              <p className="text-xs text-zinc-400 mb-1">Cada viaje finalizado válido suma al ranking semanal de tu ciudad.</p>
              <div className="flex items-end gap-3">
                  <p className="text-3xl font-black text-white leading-none tracking-tight">
                      {formattedCurrency(poolAmount)}
                  </p>
                  {weeklyGrowth > 0 && (
                      <div className="mb-0.5">
                          <span className="text-[11px] font-black text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                              +{formattedCurrency(weeklyGrowth)} esta semana
                          </span>
                      </div>
                  )}
              </div>
            </div>
          </div>

          <div className={cn(
              "px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 backdrop-blur-md",
              isQualified ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
          )}>
              <div className={cn("w-2 h-2 rounded-full shadow-sm", isQualified ? "bg-green-500 animate-pulse" : "bg-zinc-500")} />
              {isQualified ? 'Calificado' : 'Pendiente'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Tu Parte Estimada</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-zinc-700 hover:text-white transition-colors">
                        <VamoIcon name="info" className="w-2.5 h-2.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 bg-zinc-950 border-white/10 rounded-2xl p-4 shadow-2xl">
                      <p className="text-[10px] text-zinc-400 leading-relaxed">
                        Monto aproximado que recibirás el lunes basado en tu desempeño actual (sujeto a tope individual del {weeklyPoolConfig.individualCapPercentage * 100}%).
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <span className="text-lg font-black text-white">{formattedCurrency(estimatedShare)}</span>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Participantes</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-zinc-700 hover:text-white transition-colors">
                        <VamoIcon name="info" className="w-2.5 h-2.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 bg-zinc-950 border-white/10 rounded-2xl p-4 shadow-2xl">
                      <p className="text-[10px] text-zinc-400 leading-relaxed">
                        Los {weeklyPoolConfig.eligibleTopCount} conductores con más puntos al cierre de la semana se dividen el pozo.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <span className="text-lg font-black text-white">{driverStats?.rank ? `Top ${driverStats.rank}` : '—'}</span>
            </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-white uppercase tracking-wider">Viajes esta semana: {weeklyTrips}</span>
                <span className="text-[10px] font-medium text-zinc-400">
                    {isQualified 
                        ? "¡Ya participás por el pozo acumulado!" 
                        : `Necesitas al menos ${minTrips} viaje válido para entrar al ranking (${minTrips - weeklyTrips} faltantes)`}
                </span>
              </div>
              <span className="text-xs font-black text-white tabular-nums bg-white/10 px-2 py-0.5 rounded-md">
                {weeklyTrips} <span className="text-zinc-500">/ {minTrips} viajes</span>
              </span>
          </div>
          <div className="relative pt-1">
            <Progress value={progress} className="h-3 bg-zinc-900 border border-white/5 rounded-full" />
            <p className="text-center text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-2 flex items-center justify-center gap-2">
                Meta del pozo: {formattedCurrency(weeklyPoolConfig.maxDisplayedGoal)}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-zinc-700 hover:text-white transition-colors">
                      <VamoIcon name="info" className="w-2.5 h-2.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-zinc-950 border-white/10 rounded-2xl p-4 shadow-2xl">
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                       Monto meta que la ciudad busca alcanzar para el premio semanal ({formattedCurrency(weeklyPoolConfig.maxDisplayedGoal)}).
                    </p>
                  </PopoverContent>
                </Popover>
            </p>
            {isQualified && (
                <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%-8px)] w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-900 shadow-lg shadow-green-500/40" />
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3">
            <VamoIcon name="info" className="w-4 h-4 text-indigo-400 shrink-0" />
            <p className="text-[9px] text-zinc-400 font-medium leading-relaxed">
                El pozo se reparte de forma proporcional a los multiplicadores de cada conductor calificado. 
                <span className="text-white font-bold ml-1">Se liquida cada lunes a las 03:00.</span>
            </p>
        </div>
      </div>
    </Card>
  );
}
