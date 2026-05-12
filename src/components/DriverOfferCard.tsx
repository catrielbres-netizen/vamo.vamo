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
import { Sparkles } from 'lucide-react';
import { getRideFinancialSnapshot, type RideFinancialSnapshot } from '@/lib/rideFinancials';
import { formatDistance } from '@/lib/formatters';
import { useTelemetry } from '@/lib/telemetry';

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
 * PaymentBreakdownPanel — Single source of truth for driver payment display.
 * Consumes financial snapshot strictly with no silent fallbacks.
 */
function PaymentBreakdownPanel({ 
    snapshot,
    className 
}: { 
    snapshot: RideFinancialSnapshot;
    className?: string;
}) {
    const { totalFare, walletCoveredAmount, cashToCollect, vamoSubsidyAmount } = snapshot;
    const hasWallet = walletCoveredAmount > 0;
    const hasSubsidy = vamoSubsidyAmount > 0;

    return (
        <div className={cn("rounded-3xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3 shadow-inner", className)}>
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
      fn({ offerId: offer.id }).catch(e => console.warn('[OFFER_ACK] failed', e));
      telemetry.trackMatching(offer.rideId, 'offer_received', { offerId: offer.id });
    }
  }, [firebaseApp, offer.id, offer.status, telemetry]);

  const distanceToOrigin = useMemo(() => {
    if (!currentLocation || !offer.origin) return null;
    const meters = haversineDistance(currentLocation, offer.origin);
    return formatDistance(meters);
  }, [currentLocation, offer.origin]);

  const handleAcceptRide = async () => {
    if (!firebaseApp) return;
    setIsAccepting(true);
    telemetry.trackMatching(offer.rideId, 'offer_accepted', { offerId: offer.id });
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const acceptRide = httpsCallable(functions, 'acceptRideV2');
      await acceptRide({ rideId: offer.rideId });
    } catch (error: any) {
      console.error('Error accepting ride:', error);
      telemetry.trackError('matching_accept_failed', error, { rideId: offer.rideId });
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
      console.error('Error ignoring ride:', error);
      telemetry.trackError('matching_ignore_failed', error, { rideId: offer.rideId });
      toast({ variant: 'destructive', title: 'Error al ignorar', description: error.message });
      setIsIgnoring(false);
    }
  };

  if (!isMounted) return null;

  const isUrgent = remainingTime < 10;

  return (
    <div className={cn(
        "bg-card border rounded-[2.5rem] overflow-hidden relative",
        isNew 
            ? "shadow-[0_20px_60px_rgba(0,0,0,0.3)] border-primary/30 ring-4 ring-primary/5 animate-in slide-in-from-bottom-6 duration-500" 
            : "shadow-lg border-border/50 opacity-95"
    )}>
        <div className={cn(
            "absolute top-0 inset-x-0 h-1 transition-colors duration-500",
            isUrgent ? "bg-destructive animate-pulse" : "bg-primary"
        )} />

        <div className="p-6 pt-7 space-y-5">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">
                        {(offer as any).isScheduled ? 'Viaje Reservado' : 'Nueva Solicitud'}
                    </p>
                    {(offer as any).isScheduled && (offer as any).scheduledAt ? (
                        <div className="flex items-center gap-2 mb-1">
                            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-3 py-1.5">
                                <VamoIcon name="calendar" className="w-3.5 h-3.5 text-indigo-400"/>
                                <span className="text-sm font-black text-indigo-300 tracking-tight">
                                    {new Date(
                                        (offer as any).scheduledAt?.toMillis 
                                            ? (offer as any).scheduledAt.toMillis() 
                                            : (offer as any).scheduledAt
                                    ).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <VamoIcon name="user" className="w-4 h-4 text-primary"/>
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
                    )}
                </div>
                <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                    offer.serviceType === 'express' 
                        ? 'bg-violet-500/10 text-violet-500 border border-violet-500/20' 
                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                )}>
                    <VamoIcon name={offer.serviceType === 'express' ? 'zap' : 'award'} className="w-3 h-3" />
                    {offer.serviceType === 'express' ? 'Express' : 'Profesional'}
                </div>
            </div>

            <PaymentBreakdownPanel snapshot={financial} />

            <div className="relative flex flex-col gap-5 pl-4">
                <div className="absolute left-[22px] top-[26px] bottom-[26px] w-0.5 bg-gradient-to-b from-primary via-border/40 to-accent opacity-30" />
                
                <div className="relative z-10 flex items-start gap-4">
                    <div className="mt-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
                        <div className="w-1.5 h-1.5 bg-background rounded-full" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-0.5">Origen</p>
                        <p className="font-bold text-foreground text-base leading-tight">{offer?.origin?.address || 'Ubicación de origen'}</p>
                        {distanceToOrigin && (
                            <div className="flex items-center gap-1 mt-1 text-xs font-bold text-primary">
                                <VamoIcon name="navigation" className="w-3 h-3" />
                                <span>A {distanceToOrigin} de vos</span>
                            </div>
                        )}
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
