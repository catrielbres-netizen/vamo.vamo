"use client";
import React from 'react';
import { cn } from '@/lib/utils';
import { VamoIcon } from './VamoIcon';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

interface PassengerDriverCardProps {
  name: string;
  rating: number | string;
  vehicle: string;
  plate: string;
  vehiclePhoto?: string | null;
  photoURL?: string | null;
  eta?: string | null;
  statusText?: string | null;
  onChat?: () => void;
  unreadCount?: number;
}

export const PassengerDriverCard: React.FC<PassengerDriverCardProps> = ({
  name,
  rating,
  vehicle,
  plate,
  vehiclePhoto,
  photoURL,
  eta,
  statusText,
  onChat,
  unreadCount = 0
}) => {
  return (
    <div className="rounded-3xl p-5 mb-4 border border-white/5 animate-in fade-in duration-700" style={{ backgroundColor: '#222' }}>
      <div className="flex items-center gap-4 mb-4">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden" style={{ backgroundColor: '#2a2a2a', borderColor: '#333' }}>
          {photoURL ? (
            <img src={photoURL} alt={name} className="w-full h-full object-cover" />
          ) : (
            <VamoIcon name="user" className="w-8 h-8 text-zinc-500" />
          )}
        </div>
        {/* Name + Rating */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg text-white leading-tight truncate">{name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <VamoIcon name="star" className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-semibold text-zinc-400">{Number(rating).toFixed(1)}</span>
          </div>
        </div>
        {/* Primary Status (ETA or Label) */}
        {(eta || statusText) && (
          <div className="text-right shrink-0">
            <p className="text-2xl font-black leading-none" style={{ color: '#6366f1' }}>
              {eta || statusText}
            </p>
            {eta && (
              <p className="text-[10px] font-bold uppercase tracking-wider mt-1 text-zinc-600">
                Llegada
              </p>
            )}
          </div>
        )}

        {/* Chat Trigger (VamO PRO v1.0) */}
        {onChat && (
          <div className="relative ml-2">
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

      {/* VEHICLE INFO & PHOTO */}
      <div className="flex items-center justify-between pt-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          {vehiclePhoto ? (
            <Dialog>
              <DialogTrigger asChild>
                <button className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 shrink-0 active:scale-95 transition-transform">
                  <img src={vehiclePhoto} alt="Vehículo" className="w-full h-full object-cover" />
                </button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-950 border-white/10 p-4 rounded-3xl" aria-describedby={undefined}>
                <img src={vehiclePhoto} alt="Vehículo (Zoom)" className="w-full h-auto rounded-xl object-contain max-h-[80vh]" />
              </DialogContent>
            </Dialog>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-white/5 flex items-center justify-center shrink-0">
               <VamoIcon name="car" className="w-5 h-5 text-zinc-600" />
            </div>
          )}
          
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-300">{vehicle}</span>
            <div className="mt-1 px-2 py-0.5 rounded border border-white/10 inline-flex self-start text-[10px] font-mono font-black tracking-widest text-white shadow-inner bg-zinc-900">
              {plate.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
