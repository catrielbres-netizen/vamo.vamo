
// src/app/ClientProviders.tsx
'use client';

import { FirebaseClientProvider, useFirebaseInitialization } from '@/firebase';
import { MapsProvider } from '@/components/MapsProvider';
import { VamoIcon } from '@/components/VamoIcon';


function FirebaseGate({ children }: { children: React.ReactNode }) {
  const initializationState = useFirebaseInitialization();

  if (initializationState === 'error') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4 text-center">
        <VamoIcon name="alert-triangle" className="h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Error de Configuración</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          La aplicación no pudo conectarse a Firebase. Esto generalmente se debe a que las variables de entorno de Firebase (como la clave de API) no están configuradas correctamente.
        </p>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          Por favor, asegurate de que las variables de entorno `NEXT_PUBLIC_FIREBASE_*` estén configuradas en tu entorno de hosting y vuelve a intentarlo.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}


export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <MapsProvider>
        <FirebaseGate>
          {children}
        </FirebaseGate>
      </MapsProvider>
    </FirebaseClientProvider>
  );
}
