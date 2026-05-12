'use client';

import React, { useState } from 'react';
import { useUser } from '@/firebase';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DriverMissionPanel } from './DriverMissionPanel';
import { WeeklyPoolCard } from './WeeklyPoolCard';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DriverRewardsHub() {
  const { profile } = useUser();
  const [activeTab, setActiveTab] = useState('daily');

  if (!profile || profile.role !== 'driver') return null;

  return (
    <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header con Info General */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 italic">Centro de Beneficios</h3>
        
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors">
              <VamoIcon name="info" className="w-3.5 h-3.5" />
              ¿Cómo funciona?
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-zinc-950 border-white/10 rounded-[2rem] p-6 shadow-2xl backdrop-blur-xl">
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-black text-white uppercase italic">Guía de Recompensas</h4>
                <p className="text-[11px] text-zinc-500 font-medium">En VamO premiamos tu profesionalismo y constancia.</p>
              </div>
              
              <div className="grid gap-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <VamoIcon name="zap" className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Misiones Diarias</p>
                    <p className="text-[10px] text-zinc-500">Dinero extra que se acredita al instante al completar la meta de viajes del día.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <VamoIcon name="award" className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Niveles Semanales</p>
                    <p className="text-[10px] text-zinc-500">Sumá puntos con cada viaje. Subí a Plata u Oro para multiplicar tus ganancias del Pozo.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <VamoIcon name="gift" className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Pozo Acumulado</p>
                    <p className="text-[10px] text-zinc-500">Se reparte todos los Lunes a las 03:00 AM entre los conductores calificados.</p>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Tabs defaultValue="daily" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 border border-white/5 p-1 rounded-2xl h-12">
          <TabsTrigger 
            value="daily" 
            className="rounded-xl data-[state=active]:bg-zinc-800 data-[state=active]:text-white font-bold text-xs uppercase tracking-widest transition-all"
          >
            <VamoIcon name="zap" className={cn("w-3.5 h-3.5 mr-2", activeTab === 'daily' ? "text-indigo-400" : "text-zinc-600")} />
            Meta Hoy
          </TabsTrigger>
          <TabsTrigger 
            value="weekly"
            className="rounded-xl data-[state=active]:bg-zinc-800 data-[state=active]:text-white font-bold text-xs uppercase tracking-widest transition-all"
          >
            <VamoIcon name="award" className={cn("w-3.5 h-3.5 mr-2", activeTab === 'weekly' ? "text-amber-400" : "text-zinc-600")} />
            Pozo Semanal
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-4">
          <TabsContent value="daily" className="mt-0 focus-visible:outline-none">
            <DriverMissionPanel />
          </TabsContent>
          <TabsContent value="weekly" className="mt-0 focus-visible:outline-none space-y-4">
            <WeeklyPoolCard />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
