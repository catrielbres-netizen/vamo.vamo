'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { type EnrichedRideOffer, useDriverDashboard } from '@/context/DriverRidesProvider';
import { Timestamp } from 'firebase/firestore';
import { haversineDistance } from '@/lib/geo';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', { 
    style: 'currency', 
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function useCountdown(expiresAt: Timestamp) {
    const [remaining, setRemaining] = useState(0);

    useEffect(() => {
        if (!expiresAt) return;
        
        const interval = setInterval(() => {
            const now = Date.now();
            const expiryTime = expiresAt.toMillis();
            const secondsLeft = Math.max(0, Math.floor((expiryTime - now) / 1000));
            setRemaining(secondsLeft);
        }, 1000);

        return () => clearInterval(interval);
    }, [expiresAt]);

    return remaining;
}

export default function DriverOfferCard({ offer, isNew }: { offer: EnrichedRideOffer, isNew: boolean }) {
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { currentLocation } = useDriverDashboard();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isIgnoring, setIsIgnoring] = useState(false);
  const remainingTime = useCountdown(offer.expiresAt as Timestamp);

  // [VamO PRO] Removal of strict client-side disabling. 
  // We trust the useDriverDashboard hook to remove the offer when it's truly gone.
  // This prevents 'dead' buttons due to clock skew between client and server.

  const distanceToOrigin = useMemo(() => {
    if (!currentLocation || !offer.origin) return null;
    const meters = haversineDistance(currentLocation, offer.origin);
    if (meters < 1000) return `${meters.toFixed(0)}m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }, [currentLocation, offer.origin]);

  const handleAcceptRide = async () => {
    if (!firebaseApp) return;
    setIsAccepting(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const acceptRide = httpsCallable(functions, 'acceptRideV2');
      await acceptRide({ rideId: offer.rideId });
    } catch (error: any) {
      console.error('Error accepting ride:', error);
      toast({ variant: 'destructive', title: 'Error al aceptar', description: error.message });
      setIsAccepting(false);
    }
  };

  const handleIgnoreRide = async () => {
    if (!firebaseApp) return;
    setIsIgnoring(true);
    try {
      const ignore = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'ignoreRideV1');
      await ignore({ rideId: offer.rideId });
      toast({ variant: 'default', title: 'Oferta ignorada' });
    } catch (error: any) {
      console.error('Error ignoring ride:', error);
      toast({ variant: 'destructive', title: 'Error al ignorar', description: error.message });
      setIsIgnoring(false);
    }
  };

  const cardClasses = isNew 
    ? "bg-card shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-2 border-primary/30 rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-6 duration-500 relative ring-4 ring-primary/5" 
    : "bg-card shadow-lg border border-border/50 rounded-[2.5rem] overflow-hidden relative opacity-95";

  const isUrgent = remainingTime < 10;

  return (
    <div className={cardClasses}>
      {/* Visual Urgency Bar */}
      <div className={`absolute top-0 inset-x-0 h-1.5 transition-colors duration-500 ${isUrgent ? 'bg-destructive animate-pulse' : 'bg-primary'}`} />
      
      <div className="p-7 pb-4">
        {/* Header with Service Badge */}
        <div className="flex justify-between items-center mb-6">
            <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">Nueva Solicitud</span>
                <div className="flex items-center gap-2">
                    <VamoIcon name="user" className="w-4 h-4 text-primary"/>
                    <h3 className="text-xl font-bold tracking-tight text-foreground">{offer.passengerName || 'Pasajero'}</h3>
                </div>
            </div>
            <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm ${
                offer.serviceType === 'express' 
                ? 'bg-violet-500/10 text-violet-500 border border-violet-500/20' 
                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
            }`}>
                <VamoIcon name={offer.serviceType === 'express' ? 'zap' : 'award'} className="w-3 h-3" />
                {offer.serviceType === 'express' ? 'Express' : (offer.serviceType === 'premium' ? 'Premium' : 'Normal')}
            </div>
        </div>

        {/* PROMINENT EARNINGS */}
        <div className="bg-secondary/30 rounded-[2rem] p-6 flex flex-col items-center justify-center border border-border/40 mb-8 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.25em] mb-2">GANANCIA ESTIMADA</p>
          <div className="flex items-baseline gap-1">
            <p className="font-black text-6xl text-primary tracking-tight leading-none">
                {formatCurrency(offer.pricing?.estimated?.total ?? (offer as any).estimatedTotal ?? 0)}
            </p>
          </div>
        </div>

        {/* TRIP GEOGRAPHY */}
        <div className="relative flex flex-col gap-6 pl-4 mb-2">
            <div className="absolute left-[23px] top-[28px] bottom-[28px] w-0.5 bg-gradient-to-b from-primary via-border to-accent z-0 opacity-40" />
            
            {/* ORIGIN (HIGHER HIERARCHY) */}
            <div className="relative z-10 flex items-start gap-5">
                <div className="mt-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(var(--primary),0.3)] ring-4 ring-primary/10">
                    <div className="w-2 h-2 bg-background rounded-full" />
                </div>
                <div className="flex flex-col">
                    <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-0.5">ORIGEN</p>
                    <p className="font-bold text-foreground text-lg leading-tight tracking-tight">{offer.origin.address}</p>
                    {distanceToOrigin && (
                        <div className="flex items-center gap-1 mt-1 text-sm font-bold text-primary animate-in fade-in slide-in-from-left-2">
                            <VamoIcon name="navigation" className="w-3.5 h-3.5" />
                            <span>A {distanceToOrigin} de vos</span>
                        </div>
                    )}
                </div>
            </div>
            
            {/* DESTINATION (SMALLER) */}
            <div className="relative z-10 flex items-start gap-5">
                <div className="mt-1.5 w-5 h-5 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 border-2 border-accent/50 ring-4 ring-accent/5">
                    <div className="w-2 h-2 bg-accent rounded-sm" />
                </div>
                <div className="flex flex-col">
                    <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest mb-0.5">DESTINO</p>
                    <p className="font-semibold text-muted-foreground text-sm leading-tight">{offer.destination.address}</p>
                </div>
            </div>
        </div>
      </div>

      {/* ACTION AREA */}
      <div className="p-6 pt-4 flex flex-col gap-5 bg-muted/30 border-t border-border/40">
          {/* URGENT COUNTDOWN */}
          <div className="w-full">
              <div className="flex justify-between items-end mb-2.5 px-2">
                  <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">TIEMPO RESTANTE</span>
                  <span className={`font-black tracking-tighter transition-all duration-300 ${
                      isUrgent 
                      ? 'text-4xl text-destructive animate-pulse' 
                      : 'text-xl text-primary'
                  }`}>
                      {remainingTime}<span className="text-xs ml-0.5 opacity-70">s</span>
                  </span>
              </div>
              <div className="w-full bg-border/40 rounded-full h-2 overflow-hidden shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-linear shadow-sm ${isUrgent ? 'bg-destructive' : 'bg-primary'}`} 
                    style={{ width: `${(remainingTime / (offer.round === 1 ? 60 : 30)) * 100}%` }}
                  ></div>
              </div>
          </div>
          
          {/* BUTTONS */}
          <div className="grid grid-cols-2 gap-4">
              <Button 
                onClick={handleIgnoreRide} 
                disabled={isAccepting || isIgnoring} 
                className="w-full h-16 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] border-border/50 text-muted-foreground/60 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 transition-all active:scale-95" 
                variant="outline"
              >
                {isIgnoring ? 'Ocultando...' : 'Rechazar'}
              </Button>
              <Button 
                onClick={handleAcceptRide} 
                disabled={isAccepting || isIgnoring} 
                className="w-full h-16 rounded-[1.5rem] text-lg font-black tracking-tight shadow-xl shadow-primary/20 bg-gradient-to-br from-primary via-primary to-primary/80 hover:to-primary/90 transition-all active:scale-95 flex items-center gap-2 group" 
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
