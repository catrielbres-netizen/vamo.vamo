"use client";
import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { VamoIcon } from './VamoIcon';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatRating } from '@/lib/formatters';
import { getReputationLevel } from '@/lib/scoring';

interface PassengerDriverCardProps {
  name: string;
  rating: number | string;
  vamoScore?: number;
  vehicle?: string; // Legacy / Fallback
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: number | string;
  vehicleColor?: string;
  plate: string;
  vehiclePhoto?: string | null;
  photoURL?: string | null;
  eta?: string | null;
  statusText?: string | null;
  onChat?: () => void;
  unreadCount?: number;
  isArrived?: boolean;
  isMunicipal?: boolean; // VamO PRO: Sello Municipal
}

export const PassengerDriverCard: React.FC<PassengerDriverCardProps> = ({
  name,
  rating,
  vamoScore,
  vehicle,
  vehicleBrand,
  vehicleModel,
  vehicleYear,
  vehicleColor,
  plate,
  vehiclePhoto,
  photoURL,
  eta,
  statusText,
  onChat,
  unreadCount = 0,
  isArrived = false,
  isMunicipal = false, // VamO PRO: Sello Municipal
}) => {
  const prevUnreadCount = useRef(unreadCount);

  // Fallback for legacy vehicle string
  const vehicleFull = vehicleBrand 
    ? `${vehicleBrand} ${vehicleModel} ${vehicleYear}`.trim()
    : vehicle;

  useEffect(() => {
      if (unreadCount > prevUnreadCount.current) {
          try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              if (audioCtx.state === 'suspended') audioCtx.resume();
              const osc = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              osc.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              
              // Distinctive "Pop/Bloop" sound for new chat message
              osc.type = 'sine';
              osc.frequency.setValueAtTime(600, audioCtx.currentTime); 
              osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
              
              gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
              gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.05);
              gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
              
              osc.start(audioCtx.currentTime);
              osc.stop(audioCtx.currentTime + 0.2);
          } catch (e) {
              console.warn("[CHAT] Audio play failed", e);
          }
      }
      prevUnreadCount.current = unreadCount;
  }, [unreadCount]);

  return (
    <div 
      className={cn(
        "relative rounded-3xl p-5 mb-4 border border-white/5 animate-in fade-in duration-700 overflow-hidden",
        !vehiclePhoto && "bg-[#222]"
      )}
    >
      {vehiclePhoto && (
         <>
            <div 
               className="absolute inset-0 bg-cover bg-center" 
               style={{ backgroundImage: `url(${vehiclePhoto})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60" />
         </>
      )}
      <div className="relative z-10 w-full">
        <Dialog>
          <DialogTrigger asChild>
          <div className="flex items-center gap-4 mb-4 cursor-pointer active:scale-[0.98] transition-all">
            {/* Avatar */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden" style={{ backgroundColor: '#2a2a2a', borderColor: '#333' }}>
                {photoURL ? (
                  <img src={photoURL} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <VamoIcon name="user" className="w-8 h-8 text-zinc-500" />
                )}
              </div>
              {isMunicipal && (
                <div className="absolute -bottom-1 -right-1 bg-[#121212] rounded-full p-0.5">
                   <div className="bg-emerald-500 rounded-full p-1 shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                      <VamoIcon name="shield-check" className="w-2.5 h-2.5 text-white" />
                   </div>
                </div>
              )}
            </div>
            {/* Name + Rating */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                  <p className="font-bold text-lg text-white leading-tight truncate">{name}</p>
                  {isMunicipal && <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1 py-0.5 rounded">MUNI</span>}
              </div>
              {(!vamoScore && isNaN(Number(rating))) || rating === 'NUEVO' ? (
                <div className="flex items-center gap-1 mt-1 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20 inline-flex">
                  <VamoIcon name="sparkles" className="w-3 h-3 text-yellow-500" />
                  <span className="text-[10px] font-black tracking-widest uppercase text-yellow-500">Nuevo</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <VamoIcon name="shield-check" className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">{getReputationLevel(vamoScore ?? 100)}</span>
                </div>
              )}
            </div>
            {/* Primary Status (ETA or Label) */}
            {(eta || statusText) && (
              <div className="text-right shrink-0">
                {isArrived ? (
                   <div className="bg-black/80 backdrop-blur-md border border-emerald-500/50 rounded-xl px-4 py-2 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                       <p className="text-xs font-black text-emerald-400 uppercase tracking-widest whitespace-nowrap">
                         Conductor
                       </p>
                       <p className="text-[10px] font-bold text-white uppercase tracking-wider mt-0.5 whitespace-nowrap">
                         Está afuera
                       </p>
                   </div>
                ) : (
                  <>
                    <p className="text-2xl font-black leading-none" style={{ color: '#6366f1' }}>
                      {eta || statusText}
                    </p>
                    {eta && (
                      <p className="text-[10px] font-bold uppercase tracking-wider mt-1 text-zinc-400 shadow-sm">
                        Llegada
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogTrigger>

        <DialogContent className="max-w-sm rounded-[2.5rem] bg-zinc-950 border-white/5 p-8 gap-6 shadow-2xl" aria-describedby={undefined}>
            <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-indigo-500/20 shadow-xl">
                    {photoURL ? (
                        <img src={photoURL} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                            <VamoIcon name="user" className="w-10 h-10 text-zinc-700" />
                        </div>
                    )}
                </div>
                <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{name}</h3>
                    {(!vamoScore && isNaN(Number(rating))) || rating === 'NUEVO' ? (
                        <div className="flex items-center justify-center gap-2 mt-1 bg-yellow-500/10 px-3 py-1 rounded-lg border border-yellow-500/20">
                            <VamoIcon name="sparkles" className="w-4 h-4 text-yellow-500" />
                            <span className="text-xs font-black uppercase tracking-widest text-yellow-500">Conductor Nuevo</span>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-2 mt-1">
                            <VamoIcon name="shield-check" className="w-4 h-4 text-indigo-400" />
                            <span className="text-lg font-black uppercase text-white">{getReputationLevel(vamoScore ?? 100)}</span>
                            <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest ml-1">Nivel VamO Score</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Vehículo Asignado</p>
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-inner">
                            {vehiclePhoto ? (
                                <img src={vehiclePhoto} alt="Auto" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <VamoIcon name="car" className="w-8 h-8 text-zinc-800" />
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg font-black text-white uppercase leading-tight">
                                {vehicleFull}
                            </span>
                            {vehicleColor && <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{vehicleColor}</span>}
                            <div className="mt-2 px-3 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 inline-flex self-start text-xs font-mono font-black tracking-[0.15em] text-indigo-400">
                                {plate.toUpperCase()}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={cn(
                    "p-4 rounded-3xl flex items-start gap-4",
                    isMunicipal ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-indigo-500/5 border border-indigo-500/10"
                )}>
                    <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
                        isMunicipal ? "bg-emerald-500/10 border-emerald-500/20" : "bg-indigo-500/10 border-indigo-500/20"
                    )}>
                        <VamoIcon name={isMunicipal ? "award" : "shield-check"} className={cn("h-5 w-5", isMunicipal ? "text-emerald-400" : "text-indigo-400")} />
                    </div>
                    <div className="flex flex-col">
                        <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest mb-1",
                            isMunicipal ? "text-emerald-400" : "text-indigo-400"
                        )}>
                            {isMunicipal ? "Habilitación Municipal Activa" : "Identidad Verificada"}
                        </span>
                        <p className="text-[11px] text-zinc-400 leading-tight">
                            {isMunicipal 
                                ? "Este conductor cuenta con habilitación oficial de la Municipalidad y toda su documentación técnica al día." 
                                : "Este conductor ha pasado los filtros de seguridad de VamO y cuenta con documentación validada."}
                        </p>
                    </div>
                </div>
            </div>

            {onChat && (
                <Button 
                    onClick={() => onChat()}
                    className="w-full h-14 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase tracking-widest border border-white/5"
                >
                    <VamoIcon name="message-circle" className="mr-2 h-5 w-5 text-indigo-500" />
                    Enviar Mensaje
                </Button>
            )}
        </DialogContent>
      </Dialog>

      {/* CHAT TRIGGER (Outside Dialog for main card persistence) */}
      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-300">
                {vehicleFull} {vehicleColor && `• ${vehicleColor}`}
            </span>
            <div className="mt-1 px-2 py-0.5 rounded border border-white/10 inline-flex self-start text-[10px] font-mono font-black tracking-widest text-white shadow-inner bg-zinc-900">
              {plate.toUpperCase()}
            </div>
          </div>
        </div>

        {onChat && (
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); onChat(); }}
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 border border-white/5 shadow-xl",
                unreadCount > 0 ? "bg-primary animate-pulse shadow-primary/20" : "bg-zinc-800"
              )}
            >
              <VamoIcon name="message-circle" className={cn("w-6 h-6", unreadCount > 0 ? "text-primary-foreground" : "text-zinc-400")} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-primary text-[10px] font-black rounded-full flex items-center justify-center border-2 border-primary">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
