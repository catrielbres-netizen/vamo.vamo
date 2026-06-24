'use client';

import React, { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { UserProfile, RewardsConfig } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useDoc } from '@/firebase/firestore/use-doc';

interface DriverProgressPanelProps {
  profile: UserProfile;
  className?: string;
}

export function DriverProgressPanel({ profile, className }: DriverProgressPanelProps) {
  const db = useFirestore();
  const cityKey = profile?.operatingAreaId || profile?.cityKey || 'rawson';
  const configRef = useMemo(() => doc(db, `cities/${cityKey}`), [db, cityKey]);
  const { data: config } = useDoc<any>(configRef);

  const points = profile.weeklyPoints ?? 0;
  
  const poolBaseAmount = 2000;
  const poolAmount = config?.rewardsConfig?.weeklyPoolAmount ?? poolBaseAmount;

  // Level thresholds (VamO PRO Weekly Rules)
  const BRONCE_MIN = 20;
  const PLATA_MIN = 50;
  const ORO_MIN = 100;

  let currentLevel = 'Bronce'; // Base level
  let nextLevel = 'Plata';
  let progress = 0;
  let targetPoints = BRONCE_MIN;
  let currentPointsInLevel = points;
  let neededPointsInLevel = BRONCE_MIN;
  let rewardMessage = 'acceso al pozo base';
  let motivationalMessage = '';

  if (points >= ORO_MIN) {
    currentLevel = 'Oro';
    nextLevel = '';
    progress = 100;
    motivationalMessage = '¡Felicidades! Sos un conductor de élite.';
    rewardMessage = 'Prioridad Alta + Multiplicador'; 
  } else if (points >= PLATA_MIN) {
    currentLevel = 'Plata';
    nextLevel = 'Oro';
    currentPointsInLevel = points - PLATA_MIN;
    neededPointsInLevel = ORO_MIN - PLATA_MIN; // 50
    progress = (currentPointsInLevel / neededPointsInLevel) * 100;
    targetPoints = ORO_MIN;
    rewardMessage = 'Prioridad + Beneficio x3';
    motivationalMessage = `Te faltan ${ORO_MIN - points} pts para Oro`;
  } else if (points >= BRONCE_MIN) {
    currentLevel = 'Bronce';
    nextLevel = 'Plata';
    currentPointsInLevel = points - BRONCE_MIN;
    neededPointsInLevel = PLATA_MIN - BRONCE_MIN; // 30
    progress = (currentPointsInLevel / neededPointsInLevel) * 100;
    targetPoints = PLATA_MIN;
    rewardMessage = 'Beneficio Semanal x2';
    motivationalMessage = `Te faltan ${PLATA_MIN - points} pts para Plata`;
  } else {
    // Below Bronce (Still Bronce level by type, but showing progress to qualify)
    currentLevel = 'Bronce'; 
    nextLevel = 'Bronce (Meta)';
    currentPointsInLevel = points;
    neededPointsInLevel = BRONCE_MIN;
    progress = (currentPointsInLevel / neededPointsInLevel) * 100;
    targetPoints = BRONCE_MIN;
    rewardMessage = 'A las puertas del pozo';
    motivationalMessage = points === 0 
      ? '¡Empezá la semana! Completá viajes para sumar puntos.'
      : `Te faltan ${BRONCE_MIN - points} pts para Bronce`;
  }

  const isMaxLevel = points >= ORO_MIN;
  const isFemale = profile?.gender === 'female';
  
  // High Scoring Logic (Matching backend logic from onRideSettlementV6)
  const hasHighScoring = (profile.vamoScore ?? 100) >= 90;

  return (
    <div className={cn(
      "p-4 rounded-xl border shadow-sm space-y-4", 
      isFemale ? "bg-pink-900/10 border-pink-500/20" : "bg-card border-border shadow-indigo-500/5",
      className
    )}>
      {/* 1. Estado actual y puntos */}
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
             <span className={cn(
               "text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full",
               currentLevel === 'Oro' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
               currentLevel === 'Plata' ? "bg-zinc-100 text-zinc-900" :
               currentLevel === 'Bronce' ? "bg-orange-500/10 text-orange-500" :
               "bg-muted text-muted-foreground"
             )}>
                Nivel {currentLevel}
             </span>
             {hasHighScoring && (
               <span className="flex items-center gap-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-500/20 animate-pulse">
                 <VamoIcon name="award" className="h-3 w-3" />
                 Bono 1.2x Activo
               </span>
             )}
          </div>
          <p className="text-sm font-medium">
             {isMaxLevel ? (
                <span className="text-zinc-500">Manteniendo el estatus de élite</span>
             ) : points === 0 ? (
                <span className="text-primary italic font-semibold">¡Comenzá la semana y sumá!</span>
             ) : (
                <span className="text-muted-foreground">
                  +{points} pts <span className="text-foreground">hacia {nextLevel}</span>
                </span>
             )}
          </p>
        </div>
        <div className="text-right">
           <span className="text-2xl font-black">{points}</span>
           <span className="text-[10px] block text-muted-foreground uppercase tracking-tighter">pts totales</span>
        </div>
      </div>

      {/* 2. Barra de progreso */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
           <span>{isMaxLevel ? 'Meta Alcanzada' : `Meta: ${targetPoints} pts`}</span>
           <span>{isMaxLevel ? '100%' : `${Math.round(progress)}%`}</span>
        </div>
        <Progress 
          value={progress} 
          className={cn("h-2 bg-secondary", isFemale && "[&>div]:bg-pink-500")} 
        />
      </div>

      {/* 3. Meta actual y recompensa */}
      <div className="pt-1 flex items-center justify-between border-t border-dashed mt-2 pt-2">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", isFemale ? "bg-pink-500/10" : "bg-primary/10")}>
            <VamoIcon name="gift" className={cn("h-4 w-4", isFemale ? "text-pink-500" : "text-primary")} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-muted-foreground font-bold leading-none mb-1">
              {isMaxLevel ? 'Beneficio Activo' : `Próximo Beneficio`}
            </span>
            <span className="text-xs font-semibold leading-none">{rewardMessage}</span>
          </div>
        </div>
      </div>
      {/* 4. Footer info */}
      <div className="pt-2 flex flex-col gap-1">
        <div className="flex items-center justify-between">
           <div className="text-[10px] font-medium italic text-primary animate-pulse">
              {motivationalMessage}
           </div>
           <div className="text-[9px] text-muted-foreground font-medium bg-secondary/30 px-2 py-0.5 rounded-md flex items-center gap-1">
              <VamoIcon name="clock" className="h-3 w-3" />
              Reset: Lun 03:00
           </div>
        </div>
        <p className="text-[8px] text-muted-foreground/60 text-center uppercase tracking-tighter mt-1">
          * Los puntos se reinician después de la distribución semanal. El pozo se reparte entre niveles calificados.
        </p>
      </div>
    </div>
  );
}
