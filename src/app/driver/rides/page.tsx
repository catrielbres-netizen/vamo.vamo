'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { VerificationStatus } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDriverData } from '@/context/DriverRealtimeProvider';
import DriverOfferCard from '@/components/DriverOfferCard';
import { DailyEarningsWidget } from '@/components/DailyEarningsWidget';


import { WeeklyPoolCard } from '@/components/WeeklyPoolCard';
import { DriverMissionPanel } from '@/components/DriverMissionPanel';
import { NotificationToggle } from '@/components/NotificationToggle';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
const statusMessages: Record<string, {title: string, description: string, icon: string}> = {
    unverified: {
        title: 'Perfil Incompleto',
        description: 'Debes completar tu perfil y enviar la documentación para empezar a recibir viajes.',
        icon: 'loader'
    },
    pending_review: {
        title: 'Perfil en revisión',
        description: 'Tu información fue enviada correctamente. Nuestro equipo está evaluando tu solicitud. Pronto te notificaremos si fuiste aprobado o si necesitamos documentación adicional.',
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
  const { profile, rides: availableOffers, newRideIds, ready, error } = useDriverData();

  const isPendingReview = (profile as any)?.planBStatus === 'pending_docs' || (profile as any)?.planBStatus === 'pending_approval' || profile?.municipalStatus === 'pending_municipal_review';
  const statusKey = isPendingReview ? 'pending_review' : (profile?.approved ? 'approved' : 'unverified');
  const message = statusMessages[statusKey] || statusMessages.unverified;

  const isOnline = profile?.driverStatus === 'online';
  const balance = profile?.currentBalance ?? 0;
  // [VamO AUDIT] Allow rendering offers even if balance is low, so driver can see the penalty.
  const driverIsAvailable = isOnline && (profile?.approved || profile?.municipalStatus === 'pending_municipal_review');
  
  console.log(`[DRIVER_PAGE] Render. Online: ${isOnline}, Balance: ${balance}, Offers: ${availableOffers.length}`);

  return (
      <div className="space-y-4">
        {!profile?.approved && (
            <Alert variant="default" className="border-emerald-500/50 bg-emerald-500/10 rounded-2xl">
                <VamoIcon name="map-pin" className="h-5 w-5 text-emerald-400" />
                <AlertTitle className="text-emerald-400 font-black text-sm uppercase tracking-wider">
                    ¡VamO llega a tu ciudad!
                </AlertTitle>
                <AlertDescription className="text-emerald-500/90 text-xs mt-2 space-y-2 font-medium">
                    <p>
                        Estamos expandiendo nuestra red a nuevas localidades. En cualquier momento se activará el servicio en tu zona para que puedas empezar a recibir viajes.
                    </p>
                    <p className="text-emerald-400 font-bold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                        Te informaremos mediante correo electrónico tan pronto como tu área esté habilitada para operar.
                    </p>
                </AlertDescription>
            </Alert>
        )}

        {isPendingReview && (
            <Alert variant="default" className="border-indigo-500/50 bg-indigo-500/10 rounded-2xl">
                <VamoIcon name="clock" className="h-4 w-4 text-indigo-400" />
                <AlertTitle className="text-indigo-400 font-bold">Documentación en revisión</AlertTitle>
                <AlertDescription className="text-indigo-500/80 text-xs">
                    Estamos validando tus datos y documentación. Podrás recibir viajes cuando tu cuenta esté aprobada y tu zona habilitada.
                </AlertDescription>
            </Alert>
        )}

        {(!profile?.approved && !isPendingReview) && (
            <Alert variant="destructive" className="rounded-2xl">
                <VamoIcon name={message.icon} className="h-4 w-4" />
                <AlertTitle>{message.title}</AlertTitle>
                <AlertDescription className="mb-4">{message.description}</AlertDescription>
                <Button variant="outline" size="sm" className="w-full bg-red-950 hover:bg-red-900 border-red-500/50 text-white font-bold" asChild>
                    <Link href="/driver/profile">Ir a Mi Perfil</Link>
                </Button>
            </Alert>
        )}

        {(profile?.approved && !profile?.mpLinked) && (
            <Alert className="border-[#009EE3]/50 bg-[#009EE3]/10 rounded-2xl shadow-sm mb-4">
                <VamoIcon name="credit-card" className="h-5 w-5 text-[#009EE3]" />
                <AlertTitle className="text-[#009EE3] font-bold text-base flex items-center gap-2">
                    Activá los pagos digitales
                </AlertTitle>
                <AlertDescription className="text-[#009EE3]/90 text-xs mt-2 space-y-3">
                    <p>Vinculá tu cuenta de Mercado Pago para recibir viajes con pago digital. Los conductores vinculados pueden recibir tanto viajes en efectivo como con Mercado Pago.</p>
                    <ul className="list-disc pl-4 space-y-1 font-medium">
                        <li>Más viajes disponibles.</li>
                        <li>Cobro inmediato al finalizar el viaje.</li>
                        <li>El dinero llega directamente a tu cuenta Mercado Pago.</li>
                        <li>También seguís recibiendo viajes en efectivo.</li>
                    </ul>
                    <Button variant="default" size="sm" className="w-full bg-[#009EE3] hover:bg-[#007EBC] text-white font-bold mt-2 rounded-xl" asChild>
                        <Link href="/driver/profile">VINCULAR MERCADO PAGO</Link>
                    </Button>
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

            {!ready ? (
               <div className="flex flex-col items-center justify-center p-12 bg-card border border-border/50 rounded-[2rem] shadow-sm text-center">
                   <VamoIcon name="loader" className="h-10 w-10 animate-spin text-primary mb-4" />
                   <h3 className="text-xl font-bold tracking-tight">Cargando viajes...</h3>
               </div>
            ) : availableOffers.length > 0 ? (
               <div className="space-y-4">
                   {availableOffers.map((offer) => (
                    <DriverOfferCard key={offer.id} offer={offer} isNew={newRideIds.has(offer.id)} />
                  ))}
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center p-8 bg-card border border-border/50 rounded-[2rem] shadow-sm text-center">
                   <div className="relative w-20 h-20 mb-6">
                       <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-75" />
                       <div className="absolute inset-2 bg-primary/30 rounded-full animate-pulse" />
                       <div className="absolute inset-4 bg-primary rounded-full shadow-lg flex items-center justify-center">
                           <VamoIcon name="radar" className="w-6 h-6 text-primary-foreground" />
                       </div>
                   </div>
                   <h3 className="text-2xl font-bold tracking-tight mb-2">Buscando viajes</h3>
                   <p className="text-muted-foreground font-medium mb-8 text-balance text-center px-4">Mantené la app abierta para recibir solicitudes inmediatas en tu ubicación.</p>
               </div>
            )}
          </>
        ) : null}
        
        {/* Widgets movidos a sus respectivas secciones (Billetera/Misiones) para limpiar la pantalla de Inicio */}

        {profile?.approved && (
            <div className="pt-10 pb-20">
                {/* [VamO PRO] Heatmap section removed */}
            </div>
        )}
      </div>
  );
}
