'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride, WithId } from '@/lib/types';
import { Landmark, Users, Wallet } from 'lucide-react';
import { getSharedDriverFinancialSnapshot } from '@/lib/sharedRideFinancials';
import { cn } from '@/lib/utils';

interface SharedDriverReceiptSummaryProps {
  ride: WithId<Ride> | Ride;
  className?: string;
}

function formatCurrency(value?: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$ —';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export function SharedDriverReceiptSummary({ ride, className }: SharedDriverReceiptSummaryProps) {
  const snapshot = getSharedDriverFinancialSnapshot(ride as Ride);
  
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-zinc-900/50 rounded-[2.5rem] border border-white/5">
        <VamoIcon name="loader" className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest text-zinc-500">Sincronizando resumen...</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-4 animate-in fade-in zoom-in-95 duration-500", className)}>
      <Card className="border-none bg-zinc-950/40 glass-morphism premium-shadow overflow-hidden rounded-[2.5rem]">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
            <VamoIcon name="check-circle" className="w-8 h-8 text-indigo-400" />
          </div>
          <CardTitle className="text-2xl font-black text-white uppercase tracking-tight italic">VamO Compartido — Liquidado</CardTitle>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Liquidación Final de Ruta</p>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* TOTAL HIGHLIGHT */}
          <div className="flex flex-col items-center justify-center py-8 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10 relative overflow-hidden">
             <div className="absolute top-2 right-4 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none">Efectivo en mano</span>
             </div>
             <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">
               Recaudación Total Cobrada
             </span>
             <span className="text-5xl font-black text-white tracking-tighter">
               {formatCurrency(snapshot.grossCash)}
             </span>
             <div className="mt-4 px-4 py-1.5 rounded-full bg-zinc-900/80 border border-white/5 flex items-center gap-2">
                <VamoIcon name="users" className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{snapshot.passengerBreakdown.length} Pasajeros en Ruta</span>
             </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
             <p className="text-[11px] font-medium text-emerald-400 leading-relaxed italic">
                 “Mientras más pasajeros se suman, más barato viajan todos y más gana el conductor.”
             </p>
          </div>

          {/* FINANCIAL SUMMARY */}
          <div className="bg-zinc-900/40 rounded-[2rem] p-5 border border-white/5 space-y-4">
             <div className="flex justify-between items-center text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                 <span>Resumen de Liquidación</span>
             </div>
             
             <div className="flex justify-between items-center text-xs font-medium text-zinc-500">
                 <span>Total Individual Estimado Sumado</span>
                 <span>{formatCurrency(snapshot.totalIndividualFare)}</span>
             </div>
             
             <div className="flex justify-between items-center text-xs font-black text-emerald-400">
                 <span>Ahorro Total Pasajeros</span>
                 <span>{formatCurrency(snapshot.totalPassengerSavings)}</span>
             </div>
             
             <div className="h-[1px] w-full bg-white/5 my-2" />
             
             <div className="flex justify-between items-center text-xs font-black text-white">
                 <span>Total Compartido Cobrado</span>
                 <span>{formatCurrency(snapshot.grossCash)}</span>
             </div>
             
             <div className="flex justify-between items-center text-xs font-black text-rose-400">
                 <span>Comisión VamO</span>
                 <span>-{formatCurrency(snapshot.commissionAmount)}</span>
             </div>
             
             <div className="h-[1px] w-full bg-white/5 my-2" />
             
             <div className="flex justify-between items-center text-sm font-black text-indigo-400">
                 <span className="uppercase tracking-widest">Neto Final Conductor</span>
                 <span>{formatCurrency(snapshot.driverNetAfterCommission)}</span>
             </div>
          </div>



          {/* BALANCE IMPACT */}
          <div className="p-6 rounded-[2rem] bg-zinc-900 border border-white/10 shadow-inner">
             <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                        <Wallet className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Impacto en Saldo Digital</p>
                        <p className="text-xl font-black text-white italic">Ajuste de Cuenta</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-black text-rose-500 tracking-tighter">
                        {formatCurrency(snapshot.netBalanceImpact)}
                    </p>
                </div>
             </div>
             <p className="text-[9px] font-medium text-zinc-500 leading-relaxed italic text-center border-t border-white/5 pt-3">
                “El efectivo fue cobrado en mano. La comisión se registra como ajuste en tu saldo VamO.”
             </p>
          </div>

          {/* PASSENGER LIST */}
          <div className="space-y-3">
             <div className="flex items-center gap-2 px-2">
                <Users className="w-3.5 h-3.5 text-zinc-500" />
                <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Detalle de Pasajeros</h3>
             </div>
             <div className="space-y-2">
                {snapshot.passengerBreakdown.map((p, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500">
                                {p.passengerName?.[0] || '?'}
                            </div>
                            <div>
                                <p className="text-xs font-black text-white leading-none mb-1">{p.passengerName}</p>
                                <p className="text-[8px] font-bold text-zinc-500 uppercase">{p.status === 'dropped_off' ? 'Completado' : p.status}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className={cn(
                                "text-sm font-black",
                                p.amount > 0 ? "text-emerald-400" : "text-zinc-600"
                            )}>
                                {formatCurrency(p.amount)}
                            </p>
                        </div>
                    </div>
                ))}
             </div>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-[8px] text-zinc-700 font-black uppercase tracking-widest italic pt-2">Resumen de liquidación compartida oficial</p>
    </div>
  );
}
