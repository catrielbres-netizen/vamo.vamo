'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from './ui/button';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from './VamoIcon';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, Role } from '@/lib/types';
import { Timestamp, doc, runTransaction, increment, updateDoc, deleteField, getFirestore } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import RatingForm from './RatingForm';
import { cn } from '@/lib/utils';
import { getRideFinancialSnapshot, getDriverDisplayFinancials } from '@/lib/rideFinancials';
import { ExpressReceiptProgress } from './ExpressProgressWidget';
import { SharedDriverReceiptSummary } from './SharedDriverReceiptSummary';
import { SharedPassengerReceipt } from './SharedPassengerReceipt';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { MercadoPagoPaymentButton } from './MercadoPagoPaymentButton';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  }).format(value);
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function FinishedRideSummary({
  ride,
  userRole,
  onClose,
}: {
  ride: WithId<Ride>;
  userRole: Role;
  onClose?: () => void;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { profile } = useUser();
  const firebaseApp = useFirebaseApp();
  const router = useRouter();
  const pointsAwardedRef = useRef(false);
  const missionConfettiRef = useRef(false);
  const [isRatingSubmitted, setIsRatingSubmitted] = useState(false);

  useEffect(() => {
    const isDriver = userRole === 'driver';
    const missionDone = (ride.completedRide as any)?.missionCompleted;
    
    if (isDriver && missionDone && !missionConfettiRef.current) {
        missionConfettiRef.current = true;
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(() => {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    }
  }, [ride.completedRide, userRole]);

  // Puntos de pasajero y contador de viajes ahora se gestionan de forma segura en el backend (onRideSettlementV6).
  // La UI ya no realiza escrituras directas para evitar fallos por white-screens o desconexiones.

  const fallbackNavigate = () => {
    const target = userRole === 'driver' ? '/driver/rides' : '/dashboard/ride';
    window.location.href = target;
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    fallbackNavigate();
  };

  // BUG 2 — Eliminar auto-cierre por activeRideId === null
  /*
  useEffect(() => {
    if (profile?.activeRideId === null) {
      const timeout = setTimeout(() => {
        handleClose();
      }, 1200);

      return () => clearTimeout(timeout);
    }
  }, [profile?.activeRideId]);
  */

  const id = ride.id;
  useEffect(() => {
    console.log(`[RECEIPT_DIAGNOSTIC] ${id} status=${ride.status} hasCompletedRide=${!!ride.completedRide}`);
  }, [ride.status, !!ride.completedRide, id]);

  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (rating === 0 || !firebaseApp || isRatingSubmitted) {
        console.warn('[RATING_UI] disabled duplicate');
        return;
    }
    console.log('[RATING_UI] submit click');

    try {
      setIsRatingSubmitted(true);
      const functions = getFunctions(undefined, 'us-central1');
      const submitRating = httpsCallable(functions, 'submitRideRatingV1');
      await submitRating({ rideId: ride.id, score: rating, comment: comments });

      console.log('[RATING_UI] submit success');
      toast({ title: '¡Calificación enviada!', description: 'Gracias por tu opinión.' });

      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (e: any) {
      console.error('[RATING_UI] submit error:', e);
      setIsRatingSubmitted(false);
      toast({
        variant: 'destructive',
        title: 'Error al calificar',
        description: e.message || 'No se pudo guardar tu calificación.',
      });

      setTimeout(() => {
        handleClose();
      }, 1500);
    }
  };

  const [showSkip, setShowSkip] = useState(false);
  useEffect(() => {
    if (!ride.completedRide) {
        const timer = setTimeout(() => setShowSkip(true), 8000);
        return () => clearTimeout(timer);
    } else {
        setShowSkip(false);
    }
  }, [!!ride.completedRide]);

  const hasPricingFallback = !!((ride.pricing as any)?.estimatedTotal || (ride.pricing as any)?.finalTotal);
  const isProcessing = !ride.completedRide && (!showSkip || !hasPricingFallback);
  const settlementError = (ride as any).settlementError;

  if (settlementError) {
      return (
        <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-zinc-950">
          <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                <VamoIcon name="alert-triangle" className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-xl font-black text-white uppercase tracking-tighter text-center px-6">Error en la liquidación</p>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest text-center px-10">
                Hubo un problema al generar el recibo final. Los puntos y billetera se sincronizarán en breve.
            </p>
            <div className="p-3 bg-zinc-900 rounded-xl border border-white/5 w-[80%] overflow-hidden">
                <p className="text-[8px] font-mono text-zinc-600 break-words">{settlementError}</p>
            </div>
            <div className="flex flex-col w-full px-6 gap-2 pt-4">
                <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 h-14 font-black rounded-2xl"
                    onClick={async () => {
                        try {
                            const functions = getFunctions(firebaseApp, 'us-central1');
                            const retrySettle = httpsCallable(functions, 'retrySharedRideSettlementV1');
                            await retrySettle({ rideId: ride.id });
                            window.location.reload();
                        } catch (e: any) {
                            console.error(e);
                            alert("Error al reintentar: " + e.message);
                        }
                    }}
                >
                    Reintentar ahora
                </Button>
                <Button 
                    variant="ghost" 
                    className="w-full text-[10px] font-black uppercase tracking-widest text-zinc-600"
                    onClick={handleClose}
                >
                    Ver panel principal
                </Button>
            </div>
          </CardContent>
        </Card>
      );
  }

  if (isProcessing) {
      return (
        <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-xl font-black text-primary uppercase tracking-tighter text-center">Generando recibo...</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest text-center px-6">
                {showSkip ? 'Sincronización demorada. Podés volver al panel y el recibo aparecerá en tu historial.' : 'Calculando tarifa final, puntos y comisiones...'}
            </p>
            {showSkip && (
                <div className="flex flex-col w-full px-6 gap-2 mt-4">
                    <Button 
                        className="w-full bg-zinc-800 hover:bg-zinc-700 h-12 font-black rounded-xl text-xs uppercase tracking-widest"
                        onClick={handleClose}
                    >
                        Ir al panel
                    </Button>
                    <p className="text-[8px] text-zinc-500 text-center uppercase font-bold">El viaje ya fue marcado como completado.</p>
                </div>
            )}
          </CardContent>
        </Card>
      );
  }

  // --- MODO COMPARTIDO (FASE 4B-2) ---
  if (ride.rideType === 'shared' || (ride as any).isSharedRide === true) {
      const settlementStatus = (ride as any).sharedSettlementStatus;
      const receiptsGenerated = (ride as any).sharedReceiptsGenerated;
      const isDriver = userRole === 'driver';

      // Pantallas de espera y estados especiales (Similares a RideReceipt)
      if (settlementStatus === 'pending_shared_settlement' || settlementStatus === 'settling') {
          return (
            <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-zinc-950 p-12 text-center flex flex-col items-center gap-4">
                <VamoIcon name="loader" className="w-10 h-10 text-primary animate-spin" />
                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">Sincronizando...</h3>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">
                    Estamos procesando la liquidación compartida.
                </p>
                <Button onClick={handleClose} variant="ghost" className="text-[8px] font-black uppercase text-zinc-700 mt-4">Volver al panel</Button>
            </Card>
          );
      }

      if (settlementStatus === 'not_applicable') {
          return (
            <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-zinc-950 p-12 text-center flex flex-col items-center gap-4">
                <VamoIcon name="info" className="w-10 h-10 text-zinc-500" />
                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">Viaje Sin Cobro</h3>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">
                    Este viaje compartido no generó cargos financieros.
                </p>
                <Button onClick={handleClose} className="w-full bg-white text-black font-black uppercase rounded-2xl h-14 mt-4">SALIR</Button>
            </Card>
          );
      }

      if (settlementStatus === 'settled' && receiptsGenerated !== true) {
        return (
          <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-zinc-950 p-12 text-center flex flex-col items-center gap-4">
              <VamoIcon name="loader" className="w-8 h-8 text-primary animate-spin" />
              <h3 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">Cerrando Ciclo...</h3>
          </Card>
        );
      }

      // Render Final (Diferenciado por Rol)
      return (
        <div className="m-4 space-y-4">
           {isDriver 
             ? <SharedDriverReceiptSummary ride={ride} /> 
             : <SharedPassengerReceipt ride={ride} />
           }
           <div className="px-4 pb-4">
              <Button onClick={handleClose} className="w-full h-14 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-xl">
                 {isDriver ? 'VOLVER A MIS VIAJES' : 'VOLVER AL INICIO'}
              </Button>
           </div>
        </div>
      );
  }

  let rideDate = 'Cargando fecha...';
  try {
    if (ride.completedAt instanceof Timestamp) {
      rideDate = format(ride.completedAt.toDate(), "d 'de' MMMM, HH:mm'hs'", { locale: es });
    } else if (ride.completedAt) {
      const d = new Date(ride.completedAt as any);
      if (!isNaN(d.getTime())) {
        rideDate = format(d, "d 'de' MMMM, HH:mm'hs'", { locale: es });
      }
    }
  } catch(e) {
    console.error("Invalid date for completedAt:", ride.completedAt);
  }

  const totalFare = ride.completedRide?.totalFare || (ride.pricing as any)?.finalTotal || (ride.pricing as any)?.estimatedTotal || 0;
  const baseFare = ride.completedRide?.baseFare || 0;
  const distanceFare = ride.completedRide?.distanceFare || 0;
  const waitingFare = ride.completedRide?.waitingFare || 0;
  const waitingSeconds = ride.completedRide?.waitingSeconds || 0;

  const baseAndDistanceFare = baseFare + distanceFare;
  const discountAmount = (ride.pricing as any)?.discountAmount ?? 0;
  const isDriver = userRole === 'driver';
  
  // [VamO PRO] Driver Level Logic
  const currentPoints = profile?.rewardPoints ?? profile?.weeklyPoints ?? 0;
  let currentLevel = 'bronce';
  if (currentPoints >= 100) currentLevel = 'oro';
  else if (currentPoints >= 50) currentLevel = 'plata';
  
  const nextThreshold = currentLevel === 'bronce' ? 50 : currentLevel === 'plata' ? 100 : null;
  const pointsToNext = nextThreshold ? nextThreshold - currentPoints : 0;

  // [VamO PRO] Feedback Logic: Determine what the user gave and what the user received.
  const userRatingValue = isDriver ? ride.passengerRatingByDriver : ride.driverRatingByPassenger;
  const userCommentText = isDriver ? ride.passengerComments : ride.driverComments;

  const receivedRatingValue = isDriver ? ride.driverRatingByPassenger : ride.passengerRatingByDriver;
  const receivedCommentText = isDriver ? ride.driverComments : ride.passengerComments;
  const pointsAwarded = ride.completedRide?.pointsAwarded || (ride.serviceType === 'express' ? 2 : 5);

  return (
    <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl font-black text-primary uppercase tracking-tight flex items-center gap-2">
            ¡Viaje finalizado!
            {!ride.completedRide && (
                <div className="bg-amber-500 text-black text-[8px] px-2 py-0.5 rounded-full animate-pulse">PROVISORIO</div>
            )}
        </CardTitle>
        <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{`Recibo del ${rideDate}`}</CardDescription>
        {!ride.completedRide && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl mt-2">
                <p className="text-[8px] text-amber-500 font-bold uppercase text-center leading-tight">
                    Sincronización de puntos y billetera demorada.<br/>Tarifa calculada según estimación inicial.
                </p>
            </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="text-sm space-y-2 p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-start">
            <VamoIcon name="map-pin" className="w-4 h-4 mr-2 mt-1 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground text-xs">Desde</p>
              <p className="font-medium">{ride.origin.address}</p>
            </div>
          </div>
          <div className="flex items-start">
            <VamoIcon name="flag" className="w-4 h-4 mr-2 mt-1 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground text-xs">Hasta</p>
              <p className="font-medium">{ride.destination.address}</p>
            </div>
          </div>
        </div>
        {(() => {
          const baseData = getRideFinancialSnapshot(ride);
          const data = userRole === 'driver' ? getDriverDisplayFinancials(baseData) : baseData;
          const totalFare = data.totalFare;
          const discountAmount = data.discountAmount;
          const walletCoveredAmount = data.walletCoveredAmount;
          const cashToCollect = data.cashToCollect;
          const commissionAmount = data.commissionAmount;
          const vamoSubsidyAmount = data.vamoSubsidyAmount;
          const driverWalletCredit = data.driverWalletCredit;
          const driverNetAmount = data.driverNetEarnings;
          const originalTotal = data.originalTotal;
          const passengerPaysTotal = (ride.completedRide as any)?.passengerPaysTotal ?? (totalFare - discountAmount);
          
          const isFullyWallet = walletCoveredAmount >= passengerPaysTotal && passengerPaysTotal > 0;
          const hasCash = cashToCollect > 0;
          
          return (
            <>
                {/* Tarifa Original (Vista Pasajero) o Valor del Viaje (Vista Conductor) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500 font-bold uppercase tracking-widest text-[9px]">
                    {isDriver ? 'Total del viaje' : 'Tarifa del viaje'}
                  </span>
                  <span className={cn("font-bold text-white", !isDriver && discountAmount > 0 ? "line-through opacity-40" : "")}>
                    {formatCurrency(isDriver ? originalTotal : (discountAmount > 0 ? passengerPaysTotal + discountAmount : passengerPaysTotal))}
                  </span>
                </div>

                {/* Descuento Pasajero (Solo Vista Pasajero) */}
                {!isDriver && discountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs font-black text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <VamoIcon name="sparkles" className="h-3 w-3" />
                      <span className="uppercase tracking-tighter text-[9px]">
                        {(ride.pricing as any)?.expressDiscountAmount > 0 ? 'Beneficio Express VamO' : (data.discountReason || 'Beneficio VamO')}
                      </span>
                    </div>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                
                {/* Cobertura VamO Express (Vista Conductor) */}
                {isDriver && (ride.pricing as any)?.vamoExpressCoverageAmount > 0 && (
                    <div className="flex justify-between items-center text-xs font-black text-indigo-400 bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10 mt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-tighter">Cubierto por VamO Express</span>
                        <span className="text-[8px] opacity-60 font-medium italic">Se acreditará en tu billetera</span>
                      </div>
                      <span>+{formatCurrency((ride.pricing as any).vamoExpressCoverageAmount)}</span>
                    </div>
                )}

                {/* Comisión VamO (Vista Conductor) */}
                {isDriver && commissionAmount > 0 && (
                  <div className="flex justify-between items-center text-xs font-black text-rose-400/80">
                    <div className="flex items-center gap-1.5">
                      <VamoIcon name="percent" className="h-3 w-3" />
                      <span className="uppercase tracking-widest text-[9px]">Comisión VamO</span>
                    </div>
                    <span>-{formatCurrency(commissionAmount)}</span>
                  </div>
                )}


                {/* Tiempo de Espera (Vista Pasajero/Conductor) */}
                {waitingFare > 0 && (
                  <div className="flex justify-between items-center text-xs font-black text-orange-400/90">
                    <div className="flex items-center gap-1.5">
                      <VamoIcon name="clock" className="h-3 w-3" />
                      <span className="uppercase tracking-widest text-[9px]">Tiempo de Espera ({formatDuration(waitingSeconds)})</span>
                    </div>
                    <span>+{formatCurrency(waitingFare)}</span>
                  </div>
                )}
              <div className="flex flex-col gap-2 pt-2">
                {/* Total de la operación */}
                <div className="flex justify-between items-center font-black text-xl tracking-tighter">
                  <span className="uppercase text-[10px] tracking-widest text-zinc-500">
                    {isDriver ? 'Tu ganancia neta estimada' : 'Total a pagar'}
                  </span>
                  <span className={cn(isDriver ? "text-emerald-400" : "text-primary")}>
                    {formatCurrency(isDriver ? driverNetAmount : passengerPaysTotal)}
                  </span>
                </div>
                
                {isDriver && (
                  <div className="flex justify-between items-center font-bold text-sm tracking-tighter mt-1 opacity-70">
                    <span className="uppercase text-[9px] tracking-widest text-zinc-400">
                      Total a cobrar al pasajero
                    </span>
                    <span className="text-zinc-300">
                      {formatCurrency(passengerPaysTotal)}
                    </span>
                  </div>
                )}
                      {/* Forma de Pago Seleccionada */}
                <div className="space-y-2 pt-4 border-t border-dashed border-white/10 mt-2">
                  <span className="uppercase text-[10px] tracking-widest text-zinc-500 font-black">
                    Forma de pago
                  </span>
                  
                  {(ride.paymentMethod as any) === 'cash' || (ride.paymentMethod as any) === 'efectivo' ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex justify-between items-center text-md font-black text-white bg-zinc-900 p-4 rounded-2xl border border-white/5 shadow-inner">
                        <div className="flex flex-col">
                           <span className="text-[9px] font-bold mt-1 text-emerald-400">
                               {isDriver ? 'Cobrar el total. Comisión descuenta luego' : 'Pendiente pago en efectivo'}
                           </span>
                        </div>
                        <span className="text-emerald-400 text-2xl tracking-tighter italic">{formatCurrency(cashToCollect)}</span>
                      </div>
                    </div>
                  ) : (ride.paymentMethod as any) === 'wallet' || (ride.paymentMethod as any) === 'vamo_wallet' ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex justify-between items-center text-md font-black text-white bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20 shadow-inner">
                        <div className="flex flex-col">
                           <span className="uppercase tracking-widest text-[10px] text-indigo-300">Estado del pago</span>
                           <span className="text-[9px] font-bold mt-1 text-indigo-400">Pagado con Billetera VamO</span>
                        </div>
                        <span className="text-indigo-400 text-2xl tracking-tighter italic">{formatCurrency(walletCoveredAmount)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex justify-between items-center text-md font-black text-white bg-blue-500/10 p-4 rounded-2xl border border-blue-500/20 shadow-inner">
                        <div className="flex flex-col">
                           <span className="uppercase tracking-widest text-[10px] text-blue-300">Estado del pago</span>
                           {ride.paymentStatus === 'approved' ? (
                               <span className="text-[9px] font-bold mt-1 text-blue-400">
                                   Pagado (Mercado Pago)
                               </span>
                           ) : (
                               <span className="text-[9px] font-bold mt-1 text-blue-400">
                                   Pendiente (Mercado Pago)
                               </span>
                           )}
                           {/* Sandbox test check */}
                           {ride.paymentStatus === 'approved' && (ride as any).mpIsSandbox && (
                               <span className="text-[8px] font-bold mt-2 text-orange-400">Pago de prueba registrado correctamente. No se movió dinero real.</span>
                           )}
                        </div>
                        <span className="text-blue-400 text-2xl tracking-tighter italic">{formatCurrency(passengerPaysTotal)}</span>
                      </div>
                      {!isDriver && ride.paymentStatus !== 'approved' && (
                        <div className="mt-2">
                           <MercadoPagoPaymentButton ride={ride as any} amount={Math.max(0, passengerPaysTotal)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Detalle Mercado Pago */}
                {(ride as any).paymentProvider === 'mercadopago' && (
                  <div className="mt-4 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <VamoIcon name="credit-card" className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Medio de pago: Mercado Pago</span>
                    </div>
                    <div className="space-y-1 mt-2 border-t border-blue-500/10 pt-2">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                        <span className="uppercase">Comisión VamO ({(ride as any).vamoCommissionPercent || 18}%)</span>
                        <span>{formatCurrency((ride as any).vamoCommissionAmount || 0)}</span>
                      </div>
                      
                      {(ride as any).paymentMode === 'single_driver_no_split' ? (
                        <>
                          <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                            <span className="uppercase">Split automático</span>
                            <span className="text-amber-500">No aplicado</span>
                          </div>
                          {isDriver && (
                            <div className="flex justify-between text-[10px] font-bold text-zinc-400 mt-1">
                              <span className="uppercase">Neto estimado</span>
                              <span>{formatCurrency(((ride as any).pricing?.totalAmount || totalFare) - ((ride as any).vamoCommissionAmount || 0))}</span>
                            </div>
                          )}
                          {isDriver && (
                            <p className="mt-3 text-[8px] leading-relaxed font-bold uppercase tracking-widest text-zinc-500 text-center italic">
                              Comisión VamO registrada internamente. En esta etapa no fue retenida automáticamente por Mercado Pago.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                            <span className="uppercase">Retención MP (Marketplace Fee)</span>
                            <span className="text-emerald-500">Aplicada</span>
                          </div>
                          {isDriver && (
                            <div className="flex justify-between text-[10px] font-bold text-zinc-400 mt-1">
                              <span className="uppercase">Neto en tu cuenta</span>
                              <span>{formatCurrency((ride as any).driverGrossAmount || (((ride as any).pricing?.totalAmount || totalFare) - ((ride as any).vamoCommissionAmount || 0)))}</span>
                            </div>
                          )}
                          {isDriver && (
                            <p className="mt-3 text-[8px] leading-relaxed font-bold uppercase tracking-widest text-zinc-500 text-center italic">
                              Comisión VamO {(ride as any).vamoCommissionPercent || 18}% retenida automáticamente por Mercado Pago mediante marketplace.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

              </div>
              
            </>
          );
        })()}

        {isDriver && (ride.pricing as any)?.compensationAmount > 0 && (
          <div className="flex justify-between items-center text-sm font-black text-green-500 bg-green-500/10 p-3 rounded-xl border border-green-500/20 animate-in zoom-in-95 duration-500">
            <div className="flex items-center gap-2">
              <VamoIcon name="shield-check" className="h-4 w-4" />
              <span className="uppercase tracking-widest text-[10px]">Protección VamO</span>
            </div>
            <span>+{formatCurrency((ride.pricing as any).compensationAmount)}</span>
          </div>
        )}

        {isDriver && (ride.completedRide as any)?.missionCompleted && (
          <div className="relative overflow-hidden">
             {/* [VamO PRO] GESTO LINDO - REGALO GIGANTE ANIMADO */}
             <motion.div 
               initial={{ scale: 0.5, opacity: 0, y: 50 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               transition={{ type: "spring", damping: 15, stiffness: 100 }}
               className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6 rounded-[2.5rem] border border-white/30 shadow-[0_20px_50px_rgba(79,70,229,0.4)] relative overflow-hidden group"
             >
                {/* Background Sparkles */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col items-center text-center py-2">
                    <motion.div 
                        animate={{ 
                            rotate: [0, -10, 10, -10, 10, 0],
                            scale: [1, 1.1, 1, 1.1, 1] 
                        }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl mb-4"
                    >
                        <VamoIcon name="gift" className="w-10 h-10 text-indigo-600" />
                    </motion.div>
                    
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80 mb-1">¡Misión Cumplida!</p>
                    <h3 className="text-3xl font-black text-white italic tracking-tighter mb-4">¡RECOMPENSA DESBLOQUEADA!</h3>
                    
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 w-full">
                        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">Has ganado</p>
                        <p className="text-4xl font-black text-white tabular-nums drop-shadow-md">
                            {formatCurrency((ride.completedRide as any).missionBonus || 0)}
                        </p>
                    </div>
                    
                    <p className="mt-4 text-[9px] font-bold text-white/60 uppercase tracking-widest">Acreditado al instante en tu billetera</p>
                </div>

                {/* Animated Light Rays */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,255,255,0.1)_10deg,transparent_20deg)] animate-[spin_10s_linear_infinite] pointer-events-none" />
             </motion.div>
          </div>
        )}

        {isDriver && (
          <div className="mt-6 pt-6 border-t border-border/50 animate-in fade-in slide-in-from-bottom-2 duration-700">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <VamoIcon name="award" className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Recompensa</p>
                        <p className="text-lg font-black text-white leading-none">+{pointsAwarded} Puntos {ride.serviceType === 'express' ? 'Express' : 'Profesional'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Total</p>
                    <p className="text-lg font-black text-primary leading-none">{currentPoints}</p>
                </div>
             </div>

             {nextThreshold && (
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                            {pointsToNext <= 0 ? '¡Listo para el próximo nivel!' : `Faltan ${pointsToNext} para ${currentLevel === 'bronce' ? 'Plata' : 'Oro'}`}
                        </p>
                        <span className="text-[10px] font-black text-primary uppercase">{Math.round((currentPoints / nextThreshold) * 100)}%</span>
                    </div>
                    <Progress value={(currentPoints / nextThreshold) * 100} className="h-1.5 bg-zinc-900 border border-white/5" />
                </div>
             )}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground pt-4 mb-2">
          {isDriver
            ? `Pasajero: ${ride.passengerName || 'No disponible'}`
            : `Conductor: ${ride.driverName || 'No disponible'}`}
        </p>

        {/* [VamO PRO] Rating Received Section (Audit Support) */}
        {receivedRatingValue ? (
            <div className="mx-6 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mb-4 animate-in fade-in duration-700">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 text-center mb-2">Calificación Recibida</p>
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
                        <p className="text-xs text-zinc-400 italic text-center px-2">"{receivedCommentText}"</p>
                    )}
                </div>
            </div>
        ) : null}
      </CardContent>

      {/* [FASE 7.2] Express progress block — only for passengers */}
      {!isDriver && (
          <div className="px-6 pb-2">
              <ExpressReceiptProgress
                  profile={profile}
                  className=""
              />
          </div>
      )}

      <RatingForm
        participantName={isDriver ? ride.passengerName || 'Pasajero' : ride.driverName || 'Conductor'}
        participantRole={isDriver ? 'pasajero' : 'conductor'}
        photoURL={isDriver ? ride.passengerPhotoUrl : ride.driverPhotoUrl}
        onSubmit={handleRatingSubmit}
        isSubmitted={!!userRatingValue || isRatingSubmitted}
        initialRating={userRatingValue || undefined}
        initialComment={userCommentText || undefined}
        submitButtonText={isDriver ? 'Calificar y ver viajes' : 'Calificar y pedir otro viaje'}
      />

      <CardFooter className="pt-0 pb-6">
        <Button className="w-full h-12 rounded-2xl font-black uppercase tracking-widest shadow-lg" onClick={handleClose}>
          {userRole === 'driver' ? 'Finalizar' : 'Volver a pedir viaje'}
        </Button>
      </CardFooter>
    </Card>
  );
}
