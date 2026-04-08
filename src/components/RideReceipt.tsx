'use client';

import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride, WithId } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface RideReceiptProps {
  ride: WithId<Ride> | Ride;
  onClose?: () => void;
  className?: string;
  closeLabel?: string;
}

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$ —';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  }).format(value);
}

function formatDuration(seconds?: number) {
  if (!seconds || isNaN(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function RideReceipt({ ride, onClose, className, closeLabel }: RideReceiptProps) {
  const { completedRide, origin, destination, driverName, serviceType, completedAt, id, pricing } = ride as any;

  const dateStr = completedAt instanceof Timestamp 
    ? format(completedAt.toDate(), "d 'de' MMMM, HH:mm'hs'", { locale: es })
    : completedAt ? format(new Date(completedAt as any), "d 'de' MMMM, HH:mm'hs'", { locale: es }) : '—';

  // BUG 1 FIX — Robust Total Priority
  // [VamO PRO] Total Priority (Driver Protection Logic)
  // Passengers see the net price, but data stores the gross fare
  const grossTotal = 
    completedRide?.finalTotal || 
    completedRide?.totalFare || 
    pricing?.final?.total || 
    pricing?.estimated?.total || 
    0;
  
  const discountAmount = pricing?.discountAmount || 0;
  const netTotal = grossTotal - discountAmount;

  const isProcessing = !completedRide || (!completedRide.finalTotal && !completedRide.totalFare);

  const baseAndDist = (completedRide?.baseFare ?? 0) + (completedRide?.distanceFare ?? 0);
  const waitFare = completedRide?.waitingFare ?? 0;
  const waitSecs = completedRide?.waitingSeconds ?? 0;
  const distanceKm = completedRide?.distanceMeters ? (completedRide.distanceMeters / 1000).toFixed(2) : '—';
  const durationStr = formatDuration(completedRide?.durationSeconds);

  return (
    <div className={cn("w-full animate-in fade-in zoom-in-95 duration-500", className)}>
      <Card className="border-none bg-zinc-950/40 glass-morphism premium-shadow overflow-hidden rounded-[2.5rem]">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
            <VamoIcon name="check" className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">Gracias por viajar</CardTitle>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">{dateStr}</p>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* TOTAL HIGHLIGHT */}
          <div className="flex flex-col items-center justify-center py-6 bg-white/5 rounded-[2rem] border border-white/5 relative overflow-hidden">
            {isProcessing && (
              <div className="absolute top-2 right-4 flex items-center gap-1.5 animate-pulse">
                <div className="w-1 h-1 rounded-full bg-primary" />
                <span className="text-[7px] font-black text-primary uppercase tracking-widest">Calculando final</span>
              </div>
            )}
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">
              {isProcessing ? 'Total Estimado' : 'Total Pagado'}
            </span>
            <span className="text-5xl font-black text-white tracking-tighter">{formatCurrency(netTotal)}</span>
            
            {isProcessing ? (
              <div className="mt-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-2">
                <VamoIcon name="loader" className="w-3 h-3 text-primary animate-spin" />
                <span className="text-[9px] font-black text-primary uppercase tracking-widest">Procesando comprobante...</span>
              </div>
            ) : (
              <div className="mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 flex items-center gap-2">
                <VamoIcon name={serviceType === 'express' ? "zap" : "star"} className="w-3 h-3 text-primary" />
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{serviceType === 'express' ? 'Express' : (serviceType === 'premium' ? 'Premium' : 'Normal')}</span>
              </div>
            )}
          </div>

          {/* TRIP DETAILS */}
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1 mt-1">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <div className="w-0.5 h-8 bg-zinc-800" />
                <div className="w-2 h-2 rounded-sm bg-primary" />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Origen</span>
                  <span className="text-sm font-bold text-zinc-200 line-clamp-1">{origin?.address || '—'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Destino</span>
                  <span className="text-sm font-bold text-zinc-200 line-clamp-1">{destination?.address || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-white/5" />

          {/* METRICS GRID */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900/40 p-4 rounded-2xl border border-white/5">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Distancia</p>
                <p className="text-lg font-black text-white">{distanceKm} <span className="text-xs text-zinc-500">km</span></p>
            </div>
            <div className="bg-zinc-900/40 p-4 rounded-2xl border border-white/5">
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Duración</p>
                <p className="text-lg font-black text-white">{durationStr}</p>
            </div>
          </div>

          {/* COST BREAKDOWN */}
          <div className="space-y-3 px-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              <span>Tarifa Base + Distancia</span>
              <span className="text-zinc-200">{formatCurrency(baseAndDist)}</span>
            </div>
            
            {waitFare > 0 && (
              <div className="flex justify-between items-center text-[10px] font-bold text-orange-500 uppercase tracking-wider">
                <span>Tiempo de Espera ({Math.ceil(waitSecs / 60)} min)</span>
                <span>{formatCurrency(waitFare)}</span>
              </div>
            )}

            {(ride as any).pricing?.discountAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] font-bold text-green-500 uppercase tracking-wider">
                <span>Descuento Aplicado</span>
                <span>-{formatCurrency((ride as any).pricing.discountAmount)}</span>
              </div>
            )}
          </div>

          <Separator className="bg-white/5" />

          {/* DRIVER INFO */}
          <div className="flex items-center justify-between p-4 bg-zinc-900/40 rounded-2xl border border-white/5">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                    <VamoIcon name="user" className="w-5 h-5 text-zinc-500" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Tu Conductor</p>
                    <p className="text-sm font-bold text-white">{driverName || 'Conductor VamO'}</p>
                </div>
             </div>
             {id && (
                 <p className="text-[8px] font-mono text-zinc-700 uppercase">{id.substring(0, 8)}</p>
             )}
          </div>
        </CardContent>

        <CardFooter className="pt-2 pb-8">
          <Button 
            onClick={onClose} 
            className="w-full h-14 rounded-2xl bg-white text-black hover:bg-zinc-200 font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all active:scale-[0.98]"
          >
            {closeLabel || 'Cerrar Recibo'}
          </Button>
        </CardFooter>
      </Card>
      
      <p className="text-center text-[9px] text-zinc-600 font-black uppercase tracking-widest mt-6">VamO Argentina — Comprobante oficial</p>
    </div>
  );
}
