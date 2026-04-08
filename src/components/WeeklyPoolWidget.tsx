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

export function WeeklyPoolWidget() {
  const { user } = useUser();
  const db = useFirestore();

  const configRef = useMemo(() => doc(db, 'rewards/rewards'), [db]);
  const pointsRef = useMemo(() => user ? doc(db, `driver_points/${user.uid}`) : null, [db, user]);

  const { data: config, isLoading: configLoading } = useDoc<RewardsConfig>(configRef);
  const { data: points, isLoading: pointsLoading } = useDoc<DriverPoints>(pointsRef);

  if (configLoading || !config) return null;

  const weeklyPoints = points?.weeklyPoints || 0;
  const poolAmount = config.weeklyPoolAmount || 0;
  const minPoints = config.minPointsToQualify || 20;
  
  const isQualified = weeklyPoints >= minPoints;
  const progress = Math.min(100, (weeklyPoints / minPoints) * 100);

  return (
    <Card className="glass-morphism border-none shadow-none p-5 rounded-[2.5rem] overflow-hidden relative mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <VamoIcon name="target" className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Pozo Semanal</h2>
            <p className="text-xl font-black text-white leading-none tracking-tight">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(poolAmount)}
            </p>
          </div>
        </div>

        <div className={cn(
            "px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5",
            isQualified ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
        )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", isQualified ? "bg-green-500 animate-pulse" : "bg-zinc-500")} />
            {isQualified ? 'Calificado' : 'No Calificado'}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-end">
            <span className="text-[10px] font-bold text-zinc-400">
                {isQualified 
                    ? "¡Ya participás por el premio!" 
                    : `Sumá ${minPoints - weeklyPoints} pts más para participar`}
            </span>
            <span className="text-[10px] font-black text-white tabular-nums">{weeklyPoints} / {minPoints} pts</span>
        </div>
        <Progress value={progress} className="h-2 bg-zinc-900 border border-white/5" />
      </div>

      <p className="text-[8px] text-zinc-500 mt-3 font-medium uppercase tracking-tighter opacity-70">
        * El pozo se reparte los lunes entre todos los conductores calificados.
      </p>
    </Card>
  );
}
