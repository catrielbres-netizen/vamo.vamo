'use client';

import React from 'react';
import { useUser } from '@/firebase';
import { VerificationStatus } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDriverDashboard } from '@/context/DriverRidesProvider';
import DriverOfferCard from '@/components/DriverOfferCard';

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
  const { profile } = useUser();
  const { rides: availableOffers, loading: isLoading, error, newRideIds } = useDriverDashboard();

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
              <Alert variant="destructive">
                <AlertTitle>Error al buscar ofertas</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isLoading && availableOffers.length > 0 ? (
               availableOffers.map((offer) => (
                <DriverOfferCard key={offer.id} offer={offer} isNew={newRideIds.has(offer.id)} />
              ))
            ) : !isLoading && (
              <Card className="text-center">
                  <CardHeader>
                      <CardTitle>No hay viajes disponibles</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <p className="text-muted-foreground">Estás en línea. Te notificaremos cuando haya una nueva solicitud cerca tuyo.</p>
                  </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
  );
}
