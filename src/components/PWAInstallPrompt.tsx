'use client';

import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useUser } from '@/firebase';

export function PWAInstallPrompt() {
  const { canInstall, triggerInstall } = usePWAInstall();
  const { profile } = useUser();

  if (!canInstall || !profile) {
    return null;
  }

  const isDriver = profile.role === 'driver';

  if (isDriver) {
    return (
      <Alert variant="destructive" className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700">
          <VamoIcon name="alert-triangle" className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-300">¡Acción Requerida para Recibir Viajes!</AlertTitle>
          <AlertDescription>
              <div className="text-yellow-700 dark:text-yellow-500">
                <p>Para garantizar que recibas notificaciones de nuevos viajes al instante, <strong>es fundamental que instales la aplicación en tu dispositivo.</strong></p>
                <p className="text-xs mt-1">Sin la app instalada, las notificaciones de viaje no funcionarán correctamente cuando la app esté en segundo plano.</p>
              </div>
              <Button size="sm" onClick={triggerInstall} className="mt-2 w-full">
                  <VamoIcon name="download" className="mr-2 h-4 w-4" />
                  Instalar Aplicación Ahora
              </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Original, gentler prompt for passengers
  return (
    <Alert className="bg-primary/10 border-primary/20 text-primary-foreground">
        <VamoIcon name="smartphone" className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">Instalá VamO en tu dispositivo</AlertTitle>
        <AlertDescription>
            <p>Para una experiencia más rápida y directa, agregá VamO a tu pantalla de inicio.</p>
            <Button size="sm" onClick={triggerInstall} className="mt-2 w-full">
                <VamoIcon name="download" className="mr-2 h-4 w-4" />
                Instalar Aplicación
            </Button>
      </AlertDescription>
    </Alert>
  );
}
