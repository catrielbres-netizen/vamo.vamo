'use client';

import React from 'react';
import { useUser } from '@/firebase';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { getArgentinaDateStr } from '@/lib/date';

export function DriverMissionPanel() {
  const { profile } = useUser();
  if (!profile || profile.role !== 'driver') return null;

  const todayStr = getArgentinaDateStr();
  const dStats = profile.dailyStats?.lastResetDate === todayStr ? profile.dailyStats : { ridesCount: 0, missionsCompleted: [] };
  const dailyCount = dStats.ridesCount || 0;
  const completedMissions = dStats.missionsCompleted || [];
  
  // [VamO PRO v4.5] Multi-phase Mission Logic
  let GOAL = 5;
  let REWARD = 1000;
  let missionId = 'daily_5';
  let phaseName = 'Fase 1';

  if (completedMissions.includes('daily_20')) {
    GOAL = 30;
    REWARD = 5000;
    missionId = 'daily_30';
    phaseName = 'Fase 4';
  } else if (completedMissions.includes('daily_12')) {
    GOAL = 20;
    REWARD = 3000;
    missionId = 'daily_20';
    phaseName = 'Fase 3';
  } else if (completedMissions.includes('daily_5')) {
    GOAL = 12;
    REWARD = 2000;
    missionId = 'daily_12';
    phaseName = 'Fase 2';
  }

  const isCurrentMissionCompleted = completedMissions.includes(missionId);
  const progress = Math.min((dailyCount / GOAL) * 100, 100);

  return (
    <div className={cn(
      "p-5 rounded-[2rem] border shadow-2xl transition-all duration-500",
      isCurrentMissionCompleted 
        ? "bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/10" 
        : "bg-zinc-900/50 backdrop-blur-xl border-white/5 shadow-black/40"
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
             <span className={cn(
               "text-[10px] uppercase font-black tracking-[0.2em] px-2 py-0.5 rounded-full",
               isCurrentMissionCompleted ? "bg-emerald-500 text-white" : "bg-indigo-500/20 text-indigo-400"
             )}>
                Misión Diaria • {phaseName}
             </span>
             {isCurrentMissionCompleted && (
               <span className="flex items-center gap-1 text-emerald-500 text-[10px] font-black animate-bounce">
                 <VamoIcon name="check-circle" className="h-3 w-3" />
                 ¡PREMIO COBRADO!
               </span>
             )}
          </div>
          <h4 className="text-sm font-bold text-white tracking-tight">
             {isCurrentMissionCompleted 
               ? `¡Felicidades! Completaste la ${phaseName}` 
               : (dailyCount >= GOAL 
                  ? "¡Meta alcanzada! Procesando bono..." 
                  : `Hacé ${GOAL - dailyCount} viajes más para un bono de $${REWARD}`)}
          </h4>
        </div>
        <div className="text-right">
           <span className="text-2xl font-black text-white">{dailyCount}</span>
           <span className="text-xs font-bold text-zinc-500 block -mt-1">/{GOAL}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-end">
           <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Progreso del día</p>
           <p className="text-[10px] font-black text-white">{Math.round(progress)}%</p>
        </div>
        <Progress 
            value={progress} 
            className={cn(
                "h-2 bg-white/5",
                isCurrentMissionCompleted ? "[&>div]:bg-emerald-500" : "[&>div]:bg-indigo-500"
            )} 
        />
      </div>

      {!isCurrentMissionCompleted && (
        <div className="mt-4 p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
             <VamoIcon name="gift" className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="flex-1">
             <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide leading-none">
                Recompensa Retirable
             </p>
             <p className="text-lg font-black text-indigo-400 italic tabular-nums leading-tight">
                ${REWARD}
             </p>
          </div>
        </div>
      )}
      
      {isCurrentMissionCompleted && missionId === 'daily_25' && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-center">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">¡Héroe del Día!</p>
            <p className="text-[11px] font-medium text-emerald-500/60 italic overflow-hidden">Hoy has demostrado ser de los mejores conductores de VamO. ¡Mañana vamos por más!</p>
        </div>
      )}
    </div>
  );
}
