
// src/app/ClientProviders.tsx
'use client';

import { FirebaseClientProvider } from '@/firebase';
import { MapsProvider } from '@/components/MapsProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <MapsProvider>
        {children}
      </MapsProvider>
    </FirebaseClientProvider>
  );
}
