'use client';

import React from 'react';
import { useFCM } from '@/hooks/useFCM';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export function PushNotificationPrompt({ forRole }: { forRole: 'passenger' | 'driver' }) {
    const { status, enablePush, supported, error } = useFCM();
    
    if (!supported || status === 'enabled') {
        return null; // Don't show if not supported or already enabled
    }
    
    const messages = {
        passenger: {
            title: "Activar Notificaciones",
            description: "Recibí alertas importantes sobre tus viajes, como cuando tu conductor llega al punto de encuentro.",
            buttonText: "Activar Notificaciones"
        },
        driver: {
            title: "¡No te pierdas ningún viaje!",
            description: "Para recibir solicitudes de viaje incluso con la app en segundo plano, es fundamental activar las notificaciones.",
            buttonText: "Activar Notificaciones de Viajes"
        }
    }

    const content = messages[forRole];

    if (status === 'config-error') {
         return (
           <Alert variant="destructive">
               <VamoIcon name="alert-triangle" className="h-4 w-4" />
               <AlertTitle>Error de Configuración de Notificaciones</AlertTitle>
               <AlertDescription>
                  <p>Falta la clave de servidor (VAPID key) para las notificaciones push. Un administrador debe agregar esta clave al archivo `next.config.js` para habilitar esta función.</p>
                  <p className="mt-2 text-xs">Esta clave se obtiene en la sección "Cloud Messaging" de la configuración del proyecto de Firebase.</p>
               </AlertDescription>
           </Alert>
       );
    }

    if (status === 'blocked') {
        return (
           <Alert variant="destructive">
               <VamoIcon name="bell" className="h-4 w-4" />
               <AlertTitle>Notificaciones Bloqueadas</AlertTitle>
               <AlertDescription>
                  Para recibir alertas, necesitás habilitar las notificaciones para este sitio en la configuración de tu navegador.
               </AlertDescription>
           </Alert>
       );
    }

    return (
        <Alert className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
            <VamoIcon name="bell" className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">{content.title}</AlertTitle>
            <AlertDescription>
                <p className="text-blue-700 dark:text-blue-500">{content.description}</p>
                 <Button size="sm" onClick={enablePush} disabled={status === 'loading'} className="mt-2 w-full bg-blue-600 hover:bg-blue-700">
                    {status === 'loading' ? <VamoIcon name="loader" className="animate-spin mr-2" /> : <VamoIcon name="check" className="mr-2" />}
                    {content.buttonText}
                </Button>
                 {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </AlertDescription>
        </Alert>
    );
}
