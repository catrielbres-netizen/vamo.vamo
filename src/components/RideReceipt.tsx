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
import { Landmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp, useUser } from '@/firebase';
import { useState } from 'react';
import RatingForm from './RatingForm';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import { safeFixed, safeNumber } from '@/lib/formatters';

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
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isRatingSubmitted, setIsRatingSubmitted] = useState(false);
  const hasUserRated = !!((ride as any).driverRatingByPassenger || (ride as any).passengerRatingByDriver);
  
  // Detect if current viewer is driver or passenger to show correct rating
  const { user } = useUser();
  const isDriver = user?.uid === (ride as any).driverId;

  // [VamO PRO] What I gave to the other person
  const userRatingValue = isDriver ? (ride as any).passengerRatingByDriver : (ride as any).driverRatingByPassenger;
  const userCommentText = isDriver ? (ride as any).passengerComments : (ride as any).driverComments;

  // [VamO PRO] What the other person gave to me (Audit/Fraud Defense)
  const receivedRatingValue = isDriver ? (ride as any).driverRatingByPassenger : (ride as any).passengerRatingByDriver;
  const receivedCommentText = isDriver ? (ride as any).driverComments : (ride as any).passengerComments;

  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (isRatingSubmitted || !firebaseApp) {
        console.warn('[RATING_UI] disabled duplicate');
        return;
    }
    console.log('[RATING_UI] submit click');
    try {
      setIsRatingSubmitted(true);
      const functions = getFunctions(firebaseApp, 'us-central1');
      const submitRating = httpsCallable(functions, 'submitRideRatingV1');
      await submitRating({ rideId: ride.id, score: rating, comment: comments });
      console.log('[RATING_UI] submit success');
      toast({ title: 'Calificación enviada', description: 'Gracias por evaluar a tu conductor.' });
    } catch (error: any) {
      setIsRatingSubmitted(false);
      console.error('[RATING_UI] submit error:', error);
      toast({ variant: 'destructive', title: 'Error al enviar calificación', description: error.message });
    }
  };

  let dateStr = '—';
  try {
    if (completedAt instanceof Timestamp) {
      dateStr = format(completedAt.toDate(), "d 'de' MMMM, HH:mm'hs'", { locale: es });
    } else if (completedAt) {
      const d = new Date(completedAt as any);
      if (!isNaN(d.getTime())) {
        dateStr = format(d, "d 'de' MMMM, HH:mm'hs'", { locale: es });
      }
    }
  } catch(e) {
    console.error("Invalid date for completedAt:", completedAt);
  }

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

  if (isProcessing) {
      console.log('[RECEIPT_UI] summary fallback used due to missing completedRide');
  } else {
      console.log('[RECEIPT_UI] pricing source: completedRide');
  }

  const baseAndDist = (completedRide?.baseFare ?? 0) + (completedRide?.distanceFare ?? 0);
  const waitFare = completedRide?.waitingFare ?? 0;
  const waitSecs = completedRide?.waitingSeconds ?? 0;
  const distanceKm = completedRide?.distanceMeters ? safeFixed(completedRide.distanceMeters / 1000, 2, '—') : '—';
  const durationStr = formatDuration(completedRide?.durationSeconds);
  
  // ETA estimation from pricing
  const estDurationSecs = pricing?.estimated?.duration || 0;
  const estDurationStr = estDurationSecs > 0 ? formatDuration(estDurationSecs) : null;
  
  // Unique Receipt ID
  const receiptNumber = id ? `REC-${id.substring(0, 4).toUpperCase()}-${id.substring(id.length - 4).toUpperCase()}` : 'REC-PENDING';

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
              {isProcessing ? 'Total Estimado' : (isDriver ? 'Ingreso Neto Estimado' : 'Total a Pagar')}
            </span>
            <span className="text-5xl font-black text-white tracking-tighter">
              {formatCurrency(isDriver ? (completedRide?.driverNetAmount || 0) : ((completedRide?.totalFare || 0) - (completedRide?.discountAmount || 0)))}
            </span>
            
            {isProcessing ? (
              <div className="mt-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-2">
                <VamoIcon name="loader" className="w-3 h-3 text-primary animate-spin" />
                <span className="text-[9px] font-black text-primary uppercase tracking-widest">Procesando comprobante...</span>
              </div>
            ) : (
              <div className="mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 flex items-center gap-2">
                <VamoIcon name={serviceType === 'express' ? "zap" : "star"} className="w-3 h-3 text-primary" />
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{serviceType === 'express' ? 'Express' : 'Profesional'}</span>
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
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Tiempo Real</p>
                <p className="text-lg font-black text-white">{durationStr}</p>
                {estDurationStr && (
                  <p className="text-[8px] font-bold text-zinc-600 uppercase mt-1">Est: {estDurationStr}</p>
                )}
            </div>
          </div>

          {(() => {
            const data = completedRide || {};
            const totalFare = data.totalFare || 0;
            const discountAmount = data.discountAmount || 0;
            const walletCoveredAmount = data.walletCoveredAmount || 0;
            const cashToCollect = data.cashToCollect || 0;
            const commissionAmount = data.commissionAmount || 0;
            const municipalFee = data.municipalFee || 0;
            const vamoSubsidyAmount = data.vamoSubsidyAmount || 0;
            const driverWalletCredit = data.driverWalletCredit || 0;
            const originalTotal = totalFare;
            const isFullyWallet = walletCoveredAmount >= (totalFare - discountAmount) && (totalFare - discountAmount) > 0;
            const hasCash = cashToCollect > 0;

            return (
              <div className="bg-black rounded-[2rem] p-6 border border-white/5 space-y-4 shadow-2xl">
                <div className="flex justify-between items-center text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  <span>Detalle de Liquidación</span>
                  <VamoIcon name="receipt" className="h-3 w-3" />
                </div>

                <div className="space-y-3">
                  {/* Tarifa Original / Reconocida */}
                  <div className="flex justify-between items-center text-xs font-bold text-zinc-300">
                    <span className="opacity-60">{isDriver ? 'Tarifa reconocida' : 'Tarifa original'}</span>
                    <span className={cn(discountAmount > 0 && !isDriver ? "line-through opacity-40" : "")}>
                        {formatCurrency(originalTotal)}
                    </span>
                  </div>
                  
                  {/* Descuento Pasajero (Vista Pasajero) */}
                  {!isDriver && discountAmount > 0 && (
                    <div className="flex justify-between items-center text-xs font-black text-emerald-400 animate-in slide-in-from-right-2 duration-500">
                      <div className="flex items-center gap-1.5">
                        <VamoIcon name="sparkles" className="h-3 w-3" />
                        <span>{data.discountReason || 'Beneficio VamO'}</span>
                      </div>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}

                  {/* Cobertura VamO (Vista Conductor) */}
                  {isDriver && vamoSubsidyAmount > 0 && (
                    <div className="flex justify-between items-center text-xs font-black text-indigo-400 bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-tighter">Cobertura VamO</span>
                        <span className="text-[8px] opacity-60 font-medium italic">Absorción de descuento</span>
                      </div>
                      <span>+{formatCurrency(vamoSubsidyAmount)}</span>
                    </div>
                  )}

                  {/* Comisión VamO (Vista Conductor) */}
                  {isDriver && (
                    <div className="flex justify-between items-center text-xs font-black text-rose-400/80">
                      <div className="flex items-center gap-1.5">
                        <VamoIcon name="percent" className="h-3 w-3" />
                        <span>Comisión VamO</span>
                      </div>
                      <span>-{formatCurrency(commissionAmount)}</span>
                    </div>
                  )}

                  {/* Tasa Municipal (Vista Conductor) */}
                  {isDriver && municipalFee > 0 && (
                    <div className="flex justify-between items-center text-xs font-black text-amber-500/80">
                      <div className="flex items-center gap-1.5">
                        <Landmark className="h-3 w-3" />
                        <span>Tasa Municipal</span>
                      </div>
                      <span>-{formatCurrency(municipalFee)}</span>
                    </div>
                  )}

                  {/* Tiempo de Espera (Vista Pasajero/Conductor) */}
                  {waitFare > 0 && (
                    <div className="flex justify-between items-center text-xs font-black text-orange-400/90 animate-in slide-in-from-right-2 duration-500">
                      <div className="flex items-center gap-1.5">
                        <VamoIcon name="clock" className="h-3 w-3" />
                        <span>Tiempo de Espera ({formatDuration(waitSecs)})</span>
                      </div>
                      <span>+{formatCurrency(waitFare)}</span>
                    </div>
                  )}

                  {/* VamO Pay (Pago con billetera) */}
                  {walletCoveredAmount > 0 && (
                    <div className="flex justify-between items-center text-xs font-black text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <VamoIcon name="zap" className="h-3 w-3 text-indigo-400" />
                        <span>VamO Pay</span>
                      </div>
                      <span>-{formatCurrency(walletCoveredAmount)}</span>
                    </div>
                  )}

                  <Separator className="bg-white/10 my-2" />

                  {/* Acreditación en Billetera (Vista Conductor) */}
                  {isDriver && (
                    <div className="flex justify-between items-center bg-indigo-500/10 p-3 rounded-2xl border border-indigo-500/20">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-tight">Crédito en Billetera</span>
                        <span className="text-[8px] font-medium text-indigo-300 opacity-60">VamO Pay + Subsidio - Comisión</span>
                      </div>
                      <span className="text-xl font-black text-indigo-400 tracking-tighter">
                        {formatCurrency(driverWalletCredit)}
                      </span>
                    </div>
                  )}

                  {/* Final Cash to Collect */}
                  {hasCash ? (
                    <div className="flex justify-between items-center pt-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest leading-tight">
                            {isDriver ? 'Efectivo a Cobrar' : 'Efectivo a Pagar'}
                        </span>
                        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">
                            Dinero físico real
                        </span>
                      </div>
                      <span className="text-3xl font-black text-white tracking-tighter italic">
                        {formatCurrency(cashToCollect)}
                      </span>
                    </div>
                  ) : isFullyWallet ? (
                    <div className="flex flex-col items-center justify-center py-2 space-y-2">
                       <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                          <VamoIcon name="check-circle" className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Viaje 100% Pago</span>
                       </div>
                       <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter">No hay intercambio de efectivo</p>
                    </div>
                  ) : null}
                </div>
                
                {isDriver && vamoSubsidyAmount > 0 && (
                    <p className="text-[8px] font-medium text-indigo-400/80 italic text-center pt-2 border-t border-white/5">
                        La diferencia del descuento fue acreditada en tu billetera VamO.
                    </p>
                )}
              </div>
            );
          })()}

          <Separator className="bg-white/5" />

          {/* DRIVER INFO */}
          <div className="flex items-center justify-between p-4 bg-zinc-900/40 rounded-2xl border border-white/5">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                    <VamoIcon name="user" className="w-5 h-5 text-zinc-500" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">{isDriver ? 'Tu Pasajero' : 'Tu Conductor'}</p>
                    <p className="text-sm font-bold text-white">{isDriver ? ((ride as any).passengerName || 'Pasajero VamO') : (driverName || 'Conductor VamO')}</p>
                </div>
             </div>
             <div className="text-right">
                  <p className="text-[7px] font-black text-zinc-700 uppercase tracking-widest leading-none mb-1">Comprobante N°</p>
                  <p className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-tighter">{receiptNumber}</p>
              </div>
          </div>

          {/* [VamO PRO] Rating Received Section (Audit Support) */}
          {receivedRatingValue ? (
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 animate-in fade-in duration-700">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary text-center mb-2 italic">Calificación del {isDriver ? 'Pasajero' : 'Conductor'} hacia vos</p>
                  <div className="flex flex-col items-center gap-2">
                      <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                              <VamoIcon
                                  key={star}
                                  name="star"
                                  className={cn(
                                      "w-4 h-4",
                                      star <= receivedRatingValue ? "text-yellow-400 fill-yellow-400" : "text-zinc-800"
                                  )}
                              />
                          ))}
                      </div>
                      {receivedCommentText && (
                          <p className="text-xs text-zinc-400 italic text-center px-4 leading-relaxed">"{receivedCommentText}"</p>
                      )}
                  </div>
              </div>
          ) : null}
         </CardContent>

        <RatingForm
          participantName={isDriver ? (ride as any).passengerName || 'Pasajero' : (driverName || 'Conductor')}
          participantRole={isDriver ? 'pasajero' : 'conductor'}
          photoURL={isDriver ? (ride as any).passengerPhotoUrl : (ride as any).driverPhotoUrl}
          onSubmit={handleRatingSubmit}
          isSubmitted={!!userRatingValue || isRatingSubmitted}
          submitButtonText={'Enviar calificación'}
          initialRating={userRatingValue || undefined}
          initialComment={userCommentText || undefined}
        />

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
