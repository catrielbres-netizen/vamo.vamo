'use client';

import React from 'react';
import { UserProfile, DriverLevel } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { VamoLogo } from '@/components/branding/VamoLogo';

interface DriverStatusHeaderProps {
  profile: UserProfile;
}

const LEVEL_CONFIG: Record<DriverLevel, { 
    label: string, 
    color: string, 
    icon: string, 
    nextThreshold: number | null,
    prevThreshold: number
}> = {
  bronce: { 
    label: 'Bronce', 
    color: 'bg-orange-700/20 text-orange-500 border-orange-500/20', 
    icon: 'award', 
    nextThreshold: 50,
    prevThreshold: 0
  },
  plata: { 
    label: 'Plata', 
    color: 'bg-zinc-400/20 text-zinc-300 border-zinc-300/20', 
    icon: 'shield', 
    nextThreshold: 100,
    prevThreshold: 50
  },
  oro: { 
    label: 'Oro', 
    color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20', 
    icon: 'star', 
    nextThreshold: null,
    prevThreshold: 100
  },
};

export function DriverStatusHeader({ profile }: DriverStatusHeaderProps) {
  const points = profile.rewardPoints || 0;
  const level = profile.driverLevel || 'bronce';
  const config = LEVEL_CONFIG[level];
  const stats = profile.stats || { ridesCompleted: 0, acceptanceRate: 100, cancellationRate: 0 };
  const ridesCompleted = stats.ridesCompleted;
  const isWelcomePeriod = ridesCompleted < 10;

  const nextLevelLabel = level === 'bronce' ? 'Plata' : level === 'plata' ? 'Oro' : null;
  
  // Progress calculation
  let progress = 0;
  if (config.nextThreshold) {
      const range = config.nextThreshold - config.prevThreshold;
      const currentProgress = points - config.prevThreshold;
      progress = Math.max(0, Math.min(100, (currentProgress / range) * 100));
  } else {
      progress = 100;
  }

  const pointsToNext = config.nextThreshold ? config.nextThreshold - points : 0;
  const isFemale = profile?.gender === 'female';

  return (
    <Card className={cn(
      "glass-morphism border-none shadow-none p-5 rounded-[2.5rem] overflow-hidden relative mb-6",
      isFemale ? "bg-pink-900/10 border border-pink-500/20" : ""
    )}>
      {/* BACKGROUND DECORATION */}
      <div className={cn(
          "absolute -right-4 -top-4 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none",
          isFemale ? "bg-pink-500" : (level === 'oro' ? 'bg-yellow-500' : level === 'plata' ? 'bg-zinc-300' : 'bg-orange-600')
      )} />

      <div className="flex items-center justify-between mb-5 relative z-10">
        <div className="flex items-center gap-4">
          <VamoLogo variant="navbar" />
          <div className={cn(
              "w-14 h-14 rounded-[1.25rem] flex items-center justify-center border shadow-inner", 
              config.color
          )}>
            <VamoIcon name={config.icon} className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground leading-none mb-1.5">Estatus Conductor</h2>
            <div className="flex items-center gap-2">
                <p className="text-2xl font-black text-white leading-none tracking-tight">{config.label}</p>
                {isWelcomePeriod && (
                    <span className="bg-primary/20 text-primary text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-primary/20">Bienvenida</span>
                )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground leading-none mb-1.5">Puntos VamO</h2>
          <p className="text-3xl font-black text-primary leading-none tabular-nums">{points}</p>
        </div>
      </div>

      <div className="space-y-3 relative z-10">
        <div className="flex justify-between items-end">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            {isWelcomePeriod 
                ? `Faltan ${10 - ridesCompleted} viajes para sumar puntos`
                : nextLevelLabel 
                    ? `Progreso a nivel ${nextLevelLabel}` 
                    : '¡Nivel máximo alcanzado!'}
          </span>
          {!isWelcomePeriod && nextLevelLabel && (
            <span className="text-[10px] font-bold text-zinc-400">
              {pointsToNext} pts restantes
            </span>
          )}
        </div>
        <div className="relative pt-1">
            <Progress value={isWelcomePeriod ? (ridesCompleted / 10) * 100 : progress} className="h-2.5 bg-zinc-900 border border-white/5" />
        </div>
      </div>
      
      {isWelcomePeriod && (
        <p className="text-[9px] text-zinc-500 mt-3 font-medium leading-relaxed italic">
          * Durante los primeros 10 viajes no sumás puntos, pero tus viajes tienen 0% comisión (Bono de Bienvenida).
        </p>
      )}
    </Card>
  );
}
