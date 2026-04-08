'use client';

import React, { useEffect, useRef } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { VerificationStatus } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDriverDashboard } from '@/context/DriverRidesProvider';
import DriverOfferCard from '@/components/DriverOfferCard';
import { DriverProgressPanel } from '@/components/DriverProgressPanel';

const statusMessages: Record<VerificationStatus, {title: string, description: string, icon: string}> = {
    unverified: {
        title: 'Perfil Incompleto',
        description: 'Debes completar tu perfil y enviar la documentación para empezar a recibir viajes.',
        icon: 'loader'
    },
    pending_review: {
        title: 'Cuenta en Revisión',
        description: 'Nuestro equipo está verificando tu documentación. Recibirás una notificación cuando tu cuenta sea aprobada. Esto puede demorar hasta 24hs.',
        icon: 'clock'
    },
    rejected: {
        title: 'Cuenta Rechazada',
        description: 'Hubo un problema con tu documentación. Por favor, contactá a soporte para más información.',
        icon: 'x-circle'
    },
    approved: {
        title: '¡Estás en línea!',
        description: 'Ya podés recibir viajes. ¡Buenas rutas!',
        icon: 'shield-check'
    }
};

export default function DriverRidesPage() {
  const { profile, user } = useUser();
  const { rides: availableOffers, loading: isLoading, error, newRideIds } = useDriverDashboard();

  // --- "Nextel" Sound Alert Logic ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    // Only play if there are offers and driver is online
    const shouldPlay = availableOffers.length > 0 && profile?.driverStatus === 'online';

    if (shouldPlay && !isPlayingRef.current) {
        isPlayingRef.current = true;
        
        const playNextelSound = async () => {
            if (!isPlayingRef.current) return;

            try {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }
                
                const ctx = audioContextRef.current;
                
                // Handle autoplay policy
                if (ctx.state === 'suspended') {
                    await ctx.resume();
                }

                const playBip = (freq: number, start: number, duration: number) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, start);
                    gain.gain.setValueAtTime(0.1, start);
                    gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(start);
                    osc.stop(start + duration);
                };

                const now = ctx.currentTime;
                // Radio "pipi" pattern
                playBip(900, now, 0.05);
                playBip(700, now + 0.06, 0.05);
                
                // Loop every 2 seconds if still playing
                setTimeout(() => {
                    if (isPlayingRef.current) playNextelSound();
                }, 2000);

            } catch (err) {
                console.error("Audio playback failed (Nextel Alert):", err);
                isPlayingRef.current = false;
            }
        };

        playNextelSound();
    } else if (!shouldPlay && isPlayingRef.current) {
        isPlayingRef.current = false;
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
        }
    }

    return () => {
        isPlayingRef.current = false;
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
        }
    };
  }, [availableOffers.length, profile?.driverStatus]);

  if (!profile) {
      return null; 
  }
  
  if (!profile.approved) {
    const statusKey = profile.vehicleVerificationStatus || 'unverified';
    const message = statusMessages[statusKey] || statusMessages.unverified;
    return (
        <Alert variant="default" className="border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30">
            <VamoIcon name={message.icon} className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-700 dark:text-yellow-300">{message.title}</AlertTitle>
            <AlertDescription className="text-yellow-600 dark:text-yellow-500">
                {message.description}
            </AlertDescription>
        </Alert>
    );
  }

  const isOnline = profile?.driverStatus === 'online';
  const balance = profile?.currentBalance ?? 0;
  const driverIsAvailable = isOnline && profile.approved && balance >= 0;

  return (
      <div className="space-y-4">

        {isOnline && balance < 0 && (
            <Alert variant="destructive">
                <VamoIcon name="alert-triangle" className="h-4 w-4" />
                <AlertTitle>¡Saldo Insuficiente!</AlertTitle>
                <AlertDescription>
                    No podrás recibir nuevos viajes hasta que no regularices tu saldo. Por favor, cargá crédito desde la pestaña "Ganancias".
                </AlertDescription>
            </Alert>
        )}

        {driverIsAvailable ? (
          <>
            {error && (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Error al buscar ofertas</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isLoading && availableOffers.length > 0 ? (
               <div className="space-y-4">
                   {availableOffers.map((offer) => (
                    <DriverOfferCard key={offer.id} offer={offer} isNew={newRideIds.has(offer.id)} />
                  ))}
               </div>
            ) : !isLoading && (
               <div className="flex flex-col items-center justify-center p-8 bg-card border border-border/50 rounded-[2rem] shadow-sm text-center">
                   <div className="relative w-20 h-20 mb-6">
                       <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-75" />
                       <div className="absolute inset-2 bg-primary/30 rounded-full animate-pulse" />
                       <div className="absolute inset-4 bg-primary rounded-full shadow-lg flex items-center justify-center">
                           <VamoIcon name="radar" className="w-6 h-6 text-primary-foreground" />
                       </div>
                   </div>
                   <h3 className="text-2xl font-bold tracking-tight mb-2">Buscando viajes</h3>
                   <p className="text-muted-foreground font-medium mb-8">Estás en línea. Mantené la app abierta para recibir nuevas solicitudes en tu zona.</p>

                   {profile && <DriverProgressPanel profile={profile} className="w-full mt-4" />}
               </div>
            )}
          </>
        ) : null}
      </div>
  );
}
