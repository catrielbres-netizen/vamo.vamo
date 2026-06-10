'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { EnrichedRideOffer } from '@/lib/types';
import { useDriverData } from '@/context/DriverRealtimeProvider';
import { Timestamp } from 'firebase/firestore';
import { haversineDistance } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { Sparkles, Zap, TrendingDown } from 'lucide-react';
import { getRideFinancialSnapshot, type RideFinancialSnapshot } from '@/lib/rideFinancials';
import { formatDistance } from '@/lib/formatters';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import Logger from '@/lib/telemetry/logger';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', { 
    style: 'currency', 
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function useCountdown(expiresAt: any) {
    const [remaining, setRemaining] = useState(() => {
        if (!expiresAt) return 0;
        const now = Date.now();
        const expiryTime = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : (expiresAt?.seconds ? expiresAt.seconds * 1000 : 0);
        if (!expiryTime) return 0;
        return Math.max(0, Math.floor((expiryTime - now) / 1000));
    });

    useEffect(() => {
        if (!expiresAt) return;
        
        const interval = setInterval(() => {
            const now = Date.now();
            const expiryTime = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : (expiresAt?.seconds ? expiresAt.seconds * 1000 : 0);
            if (!expiryTime) return;
            const secondsLeft = Math.max(0, Math.floor((expiryTime - now) / 1000));
            setRemaining(secondsLeft);
        }, 1000);

        return () => clearInterval(interval);
    }, [expiresAt]);

    return remaining;
}

/**
 * DynamicPricingBadge — Shown only when pricing.dynamic.applied === true.
 * Reads exclusively from RideFinancialSnapshot — no recalculation.
 */
function DynamicPricingBadge({ serviceType }: { serviceType?: string }) {
    const isExpress = serviceType === 'express';
    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 w-fit">
            <TrendingDown className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                {isExpress ? 'Tarifa Dinámica Express' : 'Tarifa Dinámica VamO'}
            </span>
        </div>
    );
}

/**
 * DynamicPricingBreakdown — Desglose de tarifa dinámica.
 * Solo se renderiza cuando dynamicApplied === true.
 */
function DynamicPricingBreakdown({
    municipalBaseFare,
    dynamicDiscountAmount,
    dynamicDiscountPercent,
    finalFare,
    serviceType,
}: {
    municipalBaseFare: number;
    dynamicDiscountAmount: number;
    dynamicDiscountPercent: number;
    finalFare: number;
    serviceType?: string;
}) {
    const isExpress = serviceType === 'express';
    const infoText = isExpress
        ? 'Viaje Express con Tarifa Dinámica activa.'
        : 'Este viaje usa Tarifa Dinámica. Aceptarlo suma beneficios para el Pozo Semanal.';

    return (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col gap-2.5">
            {/* Tarifa oficial */}
            <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white/50 uppercase tracking-tight">Tarifa oficial</span>
                <span className="font-black text-white/60 line-through">{formatCurrency(municipalBaseFare)}</span>
            </div>

            {/* Descuento VamO */}
            <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3 text-emerald-400" />
                    <span className="font-bold text-emerald-400 uppercase tracking-tight">
                        Descuento VamO ({dynamicDiscountPercent}%)
                    </span>
                </div>
                <span className="font-black text-emerald-400">-{formatCurrency(dynamicDiscountAmount)}</span>
            </div>

            {/* Separador */}
            <div className="h-px bg-emerald-500/10" />

            {/* Total final */}
            <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Total al pasajero</span>
                <span className="text-xl font-black text-emerald-300 tracking-tighter">{formatCurrency(finalFare)}</span>
            </div>

            {/* Texto informativo */}
            <p className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-tight leading-snug mt-0.5">
                {infoText}
            </p>
        </div>
    );
}

/**
 * PaymentBreakdownPanel — Single source of truth for driver payment display.
 * Consumes financial snapshot strictly with no silent fallbacks.
 */
function PaymentBreakdownPanel({ 
    snapshot,
    serviceType,
    className 
}: { 
    snapshot: RideFinancialSnapshot;
    serviceType?: string;
    className?: string;
}) {
    const { totalFare, walletCoveredAmount, cashToCollect, vamoSubsidyAmount,
            dynamicApplied, municipalBaseFare, dynamicDiscountAmount } = snapshot;
    const hasWallet = walletCoveredAmount > 0;
    const hasSubsidy = vamoSubsidyAmount > 0;

    // Descuento porcentual: si municipalBaseFare > 0 lo calculamos del snapshot
    const dynamicDiscountPercent = municipalBaseFare > 0
        ? Math.round((dynamicDiscountAmount / municipalBaseFare) * 100)
        : 0;

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {/* Badge dinámico — solo si aplica */}
            {dynamicApplied && <DynamicPricingBadge serviceType={serviceType} />}

            {/* Desglose dinámico — solo si aplica */}
            {dynamicApplied && (
                <DynamicPricingBreakdown
                    municipalBaseFare={municipalBaseFare}
                    dynamicDiscountAmount={dynamicDiscountAmount}
                    dynamicDiscountPercent={dynamicDiscountPercent}
                    finalFare={totalFare}
                    serviceType={serviceType}
                />
            )}

            {/* Panel de pago estándar */}
            <div className={cn("rounded-3xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3 shadow-inner")}>
                <div className="flex justify-between items-center text-xs px-1">
                    <span className="font-bold text-white/40 uppercase tracking-tight">Tarifa del viaje</span>
                    <span className="font-black text-white/80">{formatCurrency(totalFare)}</span>
                </div>

                {hasWallet && (
                   <div className="flex justify-between items-center text-xs px-1">
                       <div className="flex items-center gap-1.5 font-bold text-emerald-400/80 uppercase tracking-tight">
                           <VamoIcon name="zap" className="h-3 w-3 text-indigo-400" />
                           <span>VamO Pay</span>
                       </div>
                       <span className="font-black text-emerald-400">-{formatCurrency(walletCoveredAmount)}</span>
                   </div>
                )}

                {hasSubsidy && (
                    <div className="flex justify-between items-center text-xs px-1">
                        <div className="flex items-center gap-1.5 font-bold text-indigo-400/80 uppercase tracking-tight">
                            <Sparkles className="w-3 h-3" />
                            <span>Descuento VamO</span>
                        </div>
                        <span className="font-black text-indigo-400">-{formatCurrency(vamoSubsidyAmount)}</span>
                    </div>
                )}

                <div className="h-px bg-white/5 my-1" />

                <div className="flex justify-between items-center p-4 rounded-2xl border border-white/10 bg-zinc-900/50 shadow-inner">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest leading-none">Cobrás en efectivo</span>
                        {(hasWallet || hasSubsidy) && (
                            <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-tighter mt-1 italic">Diferencia acreditada en Wallet</span>
                        )}
                    </div>
                    <span className="text-4xl font-black text-white tracking-tighter leading-none italic">
                        {formatCurrency(cashToCollect)}
                    </span>
                </div>
            </div>
        </div>
    );
}

function SharedRideOfferDetails({ offer }: { offer: EnrichedRideOffer }) {
    const formatCurrency = (val: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
    
    const totalGroupFare = offer.cashToCollect || offer.estimatedTotal || 0;
    
    // Tarifa estimada de viaje normal individual equivalente
    const referenceIndividualFare = (offer as any).individualFareReference ?? (offer as any).estimatedIndividualFare ?? 0;
    
    // Beneficio extra para el conductor por sobre el individual
    const driverExtraBenefit = (offer as any).driverBenefitAmount ?? (totalGroupFare - referenceIndividualFare);
    
    const hasValidBenefit = referenceIndividualFare > 0 && driverExtraBenefit > 0;

    return (
        <div className="space-y-4">
            {/* PANEL PRINCIPAL DE TARIFAS GRUPALES */}
            <div className="p-5 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/25 shadow-inner space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">TOTAL GRUPAL ESTIMADO</span>
                        <span className="text-[8px] font-bold text-indigo-300/60 uppercase tracking-tight mt-1">Efectivo total a cobrar</span>
                    </div>
                    <span className="text-3xl font-black text-white italic tracking-tighter">
                        {formatCurrency(totalGroupFare)}
                    </span>
                </div>

                <div className="h-px bg-indigo-500/10" />

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-indigo-300/80 uppercase tracking-wider">PASAJEROS</span>
                        <span className="text-white text-base font-black italic">{offer.sharedPassengerCount || 0}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-indigo-300/80 uppercase tracking-wider">PARADAS</span>
                        <span className="text-white text-base font-black italic">{(offer.pickupStopsCount || 0) + (offer.dropoffStopsCount || 0)}</span>
                    </div>
                </div>
            </div>

            {/* DETALLE COMPARATIVO PREMIUM */}
            <div className="p-5 rounded-[2rem] bg-white/5 border border-white/10 space-y-3.5 shadow-inner">
                {/* Referencia individual */}
                <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white/50 uppercase tracking-tight">REF. VIAJE INDIVIDUAL</span>
                    <span className="font-black text-white/75">
                        {referenceIndividualFare > 0 ? formatCurrency(referenceIndividualFare) : 'Diferencia no disponible'}
                    </span>
                </div>

                {/* Separador sutil */}
                <div className="h-px bg-white/5" />

                {/* Beneficio / Diferencia Extra */}
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">GANANCIA EXTRA COMPARTIDO</span>
                    <span className="text-xl font-black text-emerald-400 tracking-tighter">
                        {hasValidBenefit ? `+${formatCurrency(driverExtraBenefit)}` : 'Diferencia no disponible'}
                    </span>
                </div>

                {/* Explicación en texto claro */}
                {hasValidBenefit ? (
                    <p className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-tight leading-snug bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/10 italic text-center">
                        🎉 ¡Ganás {formatCurrency(driverExtraBenefit)} más que con un viaje individual similar!
                    </p>
                ) : (
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-tight leading-snug bg-zinc-900/40 p-3 rounded-xl border border-white/5 italic text-center">
                        Beneficio estimado por viaje compartido activo
                    </p>
                )}
            </div>

            {/* LISTA DE PASAJEROS Y SUS APORTES INDIVIDUALES */}
            {(offer as any).sharedPassengers && (offer as any).sharedPassengers.length > 0 && (
                <div className="p-4 rounded-2xl bg-zinc-950/40 border border-white/5 space-y-2">
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-wider block">Desglose de pasajeros</span>
                    {(offer as any).sharedPassengers.map((pax: any, index: number) => {
                        const paxFare = pax.sharedFare || pax.sharedFareEstimate || offer.sharedFarePerPassenger || 0;
                        return (
                            <div key={index} className="flex justify-between items-center text-xs py-1 border-b border-white/5 last:border-b-0">
                                <span className="font-bold text-white/80">{pax.passengerName || `Pasajero ${index + 1}`}</span>
                                <span className="font-black text-indigo-300">{formatCurrency(paxFare)}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* HOJA DE RUTA PRELIMINAR */}
            {offer.orderedStopsPreview && offer.orderedStopsPreview.length > 0 && (
                <div className="p-4 rounded-[2rem] bg-zinc-900 border border-white/5 space-y-4">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block text-center">Hoja de Ruta (Ordenada)</span>
                    <div className="relative space-y-3">
                        {/* Línea vertical de tiempo */}
                        <div className="absolute left-[15px] top-2 bottom-4 w-0.5 bg-white/5" />
                        {offer.orderedStopsPreview.map((stop: any, idx: number) => (
                            <div key={idx} className="relative flex gap-4 z-10">
                                <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                                    stop.type === 'pickup' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                )}>
                                    <VamoIcon name={stop.type === 'pickup' ? "user-plus" : "user-minus"} className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <span className="text-xs font-black uppercase text-white/80 tracking-tight leading-tight">{stop.type === 'pickup' ? 'Subida' : 'Bajada'} • Pasajero</span>
                                    <span className="text-[10px] font-medium text-zinc-500 line-clamp-1">{stop.location?.address}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-[9px] text-white/40 uppercase font-bold leading-tight bg-zinc-900/50 p-3 rounded-xl border border-white/5 italic">
                Cada solicitud corresponde a 1 pasajero. No se permiten acompañantes no registrados.
            </p>
        </div>
    );
}

export default function DriverOfferCard({ offer, isNew }: { offer: EnrichedRideOffer, isNew: boolean }) {
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { location: currentLocation } = useDriverData();
  const telemetry = useTelemetry();

  const [isAccepting, setIsAccepting] = useState(false);
  const [isIgnoring, setIsIgnoring] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const remainingTime = useCountdown(offer.expiresAt as Timestamp);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // [VamO PRO] Unified Financial Snapshot
  const financial = useMemo(() => getRideFinancialSnapshot(offer), [offer]);

  // ACKNOWLEDGE OFFER DELIVERY
  useEffect(() => {
    if (firebaseApp && offer.id && offer.status === 'pending') {
      const fn = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'acknowledgeOfferV1');
      fn({ offerId: offer.id }).catch(e => Logger.logWarn('[OFFER_ACK] failed', e));
      telemetry.trackMatching(offer.rideId, 'offer_received', { offerId: offer.id });
      Logger.trackRideEvent('driver_offer_received', { rideId: offer.rideId, offerId: offer.id });
    }
  }, [firebaseApp, offer.id, offer.status, telemetry, offer.rideId]);

  const distanceInfo = useMemo(() => {
    if (!currentLocation || !offer.origin) return null;
    
    // Normalizar coordenadas del conductor considerando el anidamiento en Firestore
    const driverCoords = {
      lat: (currentLocation as any).currentLocation?.lat ?? (currentLocation as any).currentLocation?.latitude ?? (currentLocation as any).lat ?? (currentLocation as any).latitude,
      lng: (currentLocation as any).currentLocation?.lng ?? (currentLocation as any).currentLocation?.longitude ?? (currentLocation as any).lng ?? (currentLocation as any).longitude,
    };
    
    // Normalizar coordenadas del pasajero
    const passengerCoords = {
      lat: (offer.origin as any).lat ?? (offer.origin as any).latitude,
      lng: (offer.origin as any).lng ?? (offer.origin as any).longitude,
    };

    if (driverCoords.lat == null || driverCoords.lng == null || passengerCoords.lat == null || passengerCoords.lng == null) {
      return null;
    }

    const meters = haversineDistance(driverCoords, passengerCoords);
    if (!isFinite(meters) || meters < 0) return null;

    const formattedDist = formatDistance(meters);
    
    // Estimación Premium de ETA: ~1 min por cada 300 metros (promedio urbano realista)
    const etaMin = Math.max(1, Math.ceil(meters / 300));
    const etaText = `${etaMin} min`;

    return {
      distance: formattedDist,
      eta: etaText,
      fullLabel: `Pasajero a ${formattedDist} • ${etaText}`,
      shortLabel: `A ${formattedDist} de vos`,
    };
  }, [currentLocation, offer.origin]);


  const handleAcceptRide = async () => {
    if (!firebaseApp) return;
    setIsAccepting(true);
    telemetry.trackMatching(offer.rideId, 'offer_accepted', { offerId: offer.id });
    Logger.trackRideEvent('driver_offer_accept_attempt', { rideId: offer.rideId, offerId: offer.id });
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const acceptRide = httpsCallable(functions, 'acceptRideV2');
      await acceptRide({ rideId: offer.rideId });
      Logger.trackRideEvent('driver_offer_accept_success', { rideId: offer.rideId, offerId: offer.id });
    } catch (error: any) {
      Logger.logError('Error accepting ride:', error);
      telemetry.trackError('matching_accept_failed', error, { rideId: offer.rideId });
      Logger.trackRideEvent('driver_offer_accept_error', { rideId: offer.rideId, error: error.message });
      toast({ variant: 'destructive', title: 'Error al aceptar', description: error.message });
      setIsAccepting(false);
    }
  };

  const handleIgnoreRide = async () => {
    if (!firebaseApp) return;
    setIsIgnoring(true);
    telemetry.trackMatching(offer.rideId, 'offer_ignored', { offerId: offer.id });
    try {
      const ignore = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'ignoreRideV1');
      await ignore({ rideId: offer.rideId });
      toast({ variant: 'default', title: 'Oferta ignorada' });
    } catch (error: any) {
      Logger.logError('Error ignoring ride:', error);
      telemetry.trackError('matching_ignore_failed', error, { rideId: offer.rideId });
      toast({ variant: 'destructive', title: 'Error al ignorar', description: error.message });
      setIsIgnoring(false);
    }
  };

  if (!isMounted) return null;

  const isUrgent = remainingTime < 10;
  const isScheduled = !!(offer as any).isScheduled && !!(offer as any).scheduledAt;

  const scheduledInfo = isScheduled ? (() => {
    const rawAt = (offer as any).scheduledAt;
    const ms = rawAt?.toMillis ? rawAt.toMillis() : Number(rawAt);
    const d = new Date(ms);
    const diffMin = Math.round((ms - Date.now()) / 60000);
    const h = Math.floor(diffMin / 60), m = diffMin % 60;
    return {
      timeLabel: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      dayLabel: d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }),
      countdown: h > 0 ? `En ${h}h${m > 0 ? ` ${m}min` : ''}` : diffMin > 1 ? `En ${diffMin} min` : 'Ahora mismo',
    };
  })() : null;

  return (
    <div className={cn(
        "bg-card border rounded-[2.5rem] overflow-hidden relative",
        isScheduled
            ? "border-indigo-500/40 shadow-[0_20px_60px_rgba(99,102,241,0.15)] ring-4 ring-indigo-500/10 animate-in slide-in-from-bottom-6 duration-500"
            : isNew 
                ? "shadow-[0_20px_60px_rgba(0,0,0,0.3)] border-primary/30 ring-4 ring-primary/5 animate-in slide-in-from-bottom-6 duration-500" 
                : "shadow-lg border-border/50 opacity-95"
    )}>
        <div className={cn(
            "absolute top-0 inset-x-0 h-1.5 transition-colors duration-500",
            isScheduled ? "bg-indigo-500" : isUrgent ? "bg-destructive animate-pulse" : "bg-primary"
        )} />

        <div className="p-6 pt-7 space-y-5">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">
                        {offer.isSharedRide ? 'Viaje Compartido' : isScheduled ? 'Viaje Reservado' : 'Nueva Solicitud'}
                    </p>
                    {/* Nombre del pasajero — siempre visible */}
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            isScheduled ? "bg-indigo-500/20 border border-indigo-500/30" : "bg-primary/10 border border-primary/20"
                        )}>
                            <VamoIcon name="user" className={cn("w-4 h-4", isScheduled ? "text-indigo-400" : "text-primary")}/>
                        </div>
                        <h3 className="text-xl font-black tracking-tight text-foreground">
                            {offer.passengerName || 'Pasajero'}
                        </h3>
                        {offer.isVip && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest animate-pulse">
                            <Sparkles className="w-2.5 h-2.5 fill-amber-500" />
                            VIP
                          </div>
                        )}
                    </div>
                    {/* Distancia y ETA Realtime del Conductor al Pasajero */}
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-primary animate-in fade-in duration-300">
                        <VamoIcon name="navigation" className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-extrabold">
                            {distanceInfo ? distanceInfo.fullLabel : 'Distancia no disponible'}
                        </span>
                    </div>
                </div>
                <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                    offer.isSharedRide 
                        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                        : isScheduled
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                            : offer.serviceType === 'express' 
                                ? 'bg-violet-500/10 text-violet-500 border border-violet-500/20' 
                                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                )}>
                    <VamoIcon name={offer.isSharedRide ? 'users' : isScheduled ? 'calendar' : (offer.serviceType === 'express' ? 'zap' : 'award')} className="w-3 h-3" />
                    {offer.isSharedRide ? 'VamO Compartido' : isScheduled ? 'Reservado' : (offer.serviceType === 'express' ? 'Express' : 'Profesional')}
                </div>
            </div>

            {/* ── BANNER DE RESERVA prominente ── */}
            {isScheduled && scheduledInfo && (
                <div className="rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-500/15 to-indigo-600/5 p-4 flex flex-col gap-3">
                    {/* Aviso */}
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/25 flex items-center justify-center shrink-0">
                            <VamoIcon name="clock" className="w-5 h-5 text-indigo-300" />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-black text-indigo-300 uppercase tracking-wider leading-none mb-1">
                                ⚠ Este viaje NO es inmediato
                            </p>
                            <p className="text-[11px] text-white/50 leading-snug">
                                El pasajero reservó para una hora específica. Aceptarlo es un compromiso de disponibilidad.
                            </p>
                        </div>
                    </div>
                    {/* Hora + cuenta regresiva */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-indigo-900/40 border border-indigo-500/20 rounded-xl p-3 flex flex-col gap-0.5">
                            <span className="text-[9px] font-black text-indigo-400/80 uppercase tracking-wider">Hora del viaje</span>
                            <span className="text-2xl font-black text-white tracking-tighter leading-none">
                                {scheduledInfo.timeLabel}<span className="text-sm font-bold text-white/50 ml-1">hs</span>
                            </span>
                        </div>
                        <div className="bg-indigo-900/40 border border-indigo-500/20 rounded-xl p-3 flex flex-col gap-0.5">
                            <span className="text-[9px] font-black text-indigo-400/80 uppercase tracking-wider">Sale en</span>
                            <span className="text-sm font-black text-indigo-200 tracking-tight leading-tight pt-1">{scheduledInfo.countdown}</span>
                        </div>
                    </div>
                    {/* Día */}
                    <div className="flex items-center gap-2 px-0.5">
                        <VamoIcon name="calendar" className="w-3.5 h-3.5 text-indigo-400/50 shrink-0" />
                        <span className="text-[10px] font-bold text-indigo-300/60 capitalize tracking-wide">{scheduledInfo.dayLabel}</span>
                    </div>
                </div>
            )}

            {offer.isSharedRide ? (
                <SharedRideOfferDetails offer={offer} />
            ) : (
                <PaymentBreakdownPanel snapshot={financial} serviceType={offer.serviceType} />
            )}

            <div className="relative flex flex-col gap-5 pl-4">
                <div className="absolute left-[22px] top-[26px] bottom-[26px] w-0.5 bg-gradient-to-b from-primary via-border/40 to-accent opacity-30" />
                
                <div className="relative z-10 flex items-start gap-4">
                    <div className="mt-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
                        <div className="w-1.5 h-1.5 bg-background rounded-full" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-0.5">Origen</p>
                        <p className="font-bold text-foreground text-base leading-tight">{offer?.origin?.address || 'Ubicación de origen'}</p>
                        <div className="flex items-center gap-1 mt-1 text-xs font-bold text-primary">
                            <VamoIcon name="navigation" className="w-3 h-3" />
                            <span>
                                {distanceInfo ? distanceInfo.shortLabel : 'Distancia no disponible'}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div className="relative z-10 flex items-start gap-4">
                    <div className="mt-1 w-4 h-4 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 border-2 border-accent/40 ring-4 ring-accent/5">
                        <div className="w-1.5 h-1.5 bg-accent rounded-sm" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest mb-0.5">Destino</p>
                        <p className="font-semibold text-muted-foreground text-sm leading-tight">{offer?.destination?.address || 'Ubicación de destino'}</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="px-6 pb-6 pt-2 space-y-4 border-t border-border/30 bg-muted/20">
            <div className="pt-4">
                <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">
                        Tiempo para aceptar
                    </span>
                    <span className={cn(
                        "font-black tracking-tighter transition-all duration-300",
                        isUrgent ? "text-3xl text-destructive animate-pulse" : "text-xl text-primary"
                    )}>
                        {remainingTime}<span className="text-xs ml-0.5 opacity-70">s</span>
                    </span>
                </div>
                <div className="w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
                    <div 
                        className={cn(
                            "h-full rounded-full transition-all duration-1000 ease-linear",
                            isUrgent ? "bg-destructive" : "bg-primary"
                        )}
                        style={{ width: `${(remainingTime / 30) * 100}%` }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Button 
                    onClick={handleIgnoreRide} 
                    disabled={isAccepting || isIgnoring} 
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border-border/40 text-muted-foreground/60 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 transition-all active:scale-95" 
                    variant="outline"
                >
                    {isIgnoring ? 'Rechazando...' : 'Rechazar'}
                </Button>
                <Button 
                    onClick={handleAcceptRide} 
                    disabled={isAccepting || isIgnoring} 
                    className="h-14 rounded-2xl text-base font-black tracking-tight shadow-xl shadow-primary/20 bg-gradient-to-br from-primary to-primary/80 hover:to-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 group" 
                    size="lg"
                >
                    {isAccepting ? (
                        <VamoIcon name="loader" className="animate-spin w-5 h-5"/>
                    ) : (
                        <>
                            <span>Aceptar</span>
                            <VamoIcon name="chevron-right" className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    </div>
  );
}
