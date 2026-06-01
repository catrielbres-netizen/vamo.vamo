'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride, WithId, SharedRideRequest } from '@/lib/types';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getSharedPassengerFinancialSnapshot } from '@/lib/sharedRideFinancials';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface SharedPassengerReceiptProps {
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

export function SharedPassengerReceipt({ ride, className }: SharedPassengerReceiptProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [request, setRequest] = useState<SharedRideRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user || !ride.id) return;

    const q = query(
      collection(firestore, 'shared_ride_requests'),
      where('finalRideId', '==', ride.id),
      where('passengerId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setRequest(snap.docs[0].data() as SharedRideRequest);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [firestore, user, ride.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-zinc-900/50 rounded-[2.5rem] border border-white/5">
        <VamoIcon name="loader" className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest text-zinc-500">Preparando recibo compartido...</p>
      </div>
    );
  }

  const snapshot = request ? getSharedPassengerFinancialSnapshot(request) : null;

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-zinc-900/50 rounded-[2.5rem] border border-white/5">
        <VamoIcon name="alert-circle" className="w-8 h-8 text-rose-500" />
        <p className="text-sm font-black uppercase tracking-widest text-zinc-500">Recibo no encontrado</p>
        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">Comunicate con soporte si el problema persiste.</p>
      </div>
    );
  }

  const isSuccess = snapshot.isFinancialReceipt;

  return (
    <div className={cn("w-full space-y-4 animate-in fade-in zoom-in-95 duration-500", className)}>
      <Card className="border-none bg-zinc-950/40 glass-morphism premium-shadow overflow-hidden rounded-[2.5rem]">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
            <VamoIcon name="check" className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-black text-white uppercase tracking-tight italic">VamO Compartido</CardTitle>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Recibo Individual de Trayecto</p>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {!isSuccess ? (
             <div className="flex flex-col items-center justify-center py-10 bg-rose-500/5 rounded-[2rem] border border-rose-500/10 text-center px-6">
                <VamoIcon name="info" className="w-10 h-10 text-rose-400 mb-4" />
                <p className="text-sm font-black text-white uppercase italic mb-2">Viaje No Completado</p>
                <p className="text-xs font-bold text-zinc-500 uppercase leading-relaxed">
                   {snapshot.reason || "Este viaje compartido no generó cobro porque no fue completado."}
                </p>
             </div>
          ) : (
             <>
                {/* SAVINGS HIGHLIGHT */}
                <div className="flex flex-col items-center justify-center py-8 bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10 relative overflow-hidden">
                    <div className="absolute top-2 right-4 flex items-center gap-1.5 animate-bounce">
                        <VamoIcon name="sparkles" className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">
                      Ahorraste en este viaje
                    </span>
                    <span className="text-5xl font-black text-emerald-400 tracking-tighter">
                      {formatCurrency(snapshot.savingsAmount)}
                    </span>
                    <div className="mt-3 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">-{snapshot.savingsPercent}% Descuento</span>
                    </div>
                </div>

                {/* TRIP DETAILS */}
                <div className="space-y-4 px-2">
                    <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center gap-1 mt-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <div className="w-0.5 h-8 bg-zinc-800" />
                            <div className="w-2 h-2 rounded-sm bg-primary" />
                        </div>
                        <div className="flex-1 space-y-4">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Desde mi ubicación</span>
                                <span className="text-sm font-bold text-zinc-200 line-clamp-1">{request?.origin?.address || '—'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Hacia mi destino</span>
                                <span className="text-sm font-bold text-zinc-200 line-clamp-1">{request?.destination?.address || '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator className="bg-white/5" />

                {/* FINANCIAL DETAIL */}
                <div className="bg-zinc-900 rounded-[2rem] p-6 border border-white/5 space-y-4 shadow-inner">
                    <div className="flex justify-between items-center text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                        <span>Detalle Financiero</span>
                        <VamoIcon name="receipt" className="h-3.5 w-3.5" />
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold text-zinc-400">
                            <span className="opacity-60 uppercase tracking-tighter">Precio de Referencia Individual</span>
                            <span className="line-through opacity-40">{formatCurrency(snapshot.individualFareReference)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs font-black text-emerald-400">
                            <div className="flex items-center gap-1.5">
                                <VamoIcon name="zap" className="h-3 h-3" />
                                <span className="uppercase tracking-tighter">Beneficio Ruta Compartida</span>
                            </div>
                            <span>-{formatCurrency(snapshot.savingsAmount)}</span>
                        </div>

                        <Separator className="bg-white/5 my-2" />

                        <div className="flex justify-between items-center pt-2">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white uppercase tracking-widest leading-tight">Pagaste en Efectivo</span>
                                <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">Precio por asiento individual</span>
                            </div>
                            <span className="text-3xl font-black text-white tracking-tighter italic">
                                {formatCurrency(snapshot.farePaid)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-5 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10">
                    <p className="text-[10px] font-medium text-zinc-400 leading-relaxed text-center italic">
                        Tu viaje individual costaba <span className="font-bold text-white">{formatCurrency(snapshot.individualFareReference)}</span>.<br/> 
                        Por viajar en VamO Compartido ({(snapshot.sharedPassengerCount || 2)} pasajeros), pagaste <span className="font-bold text-emerald-400">{formatCurrency(snapshot.farePaid)}</span> y ahorraste <span className="font-bold text-emerald-400">{formatCurrency(snapshot.savingsAmount)}</span>.
                    </p>
                </div>
                
                {/* PAYMENT METHOD DETAILED */}
                <div className="flex justify-between items-center bg-zinc-900/40 p-4 rounded-2xl border border-white/5">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Forma de Pago</span>
                        <span className="text-sm font-bold text-white uppercase tracking-tighter">
                            {snapshot.paymentMethod === 'cash' ? 'Efectivo' : 'Billetera VamO'}
                        </span>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Estado</span>
                        <span className="text-sm font-bold text-emerald-400 uppercase tracking-tighter">
                            {snapshot.isFinancialReceipt ? 'Cobrado' : 'Pendiente'}
                        </span>
                    </div>
                </div>
             </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-[8px] text-zinc-700 font-black uppercase tracking-widest italic pt-2">Comprobante individual de viaje compartido</p>
    </div>
  );
}
