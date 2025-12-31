'use client';

import { FirebaseClientProvider } from '@/firebase';

// Removed APIProvider from @vis.gl/react-google-maps to disable Maps functionality

export function Providers({ children }: { children: React.ReactNode }) {
  return (
      <FirebaseClientProvider>
        {children}
      </FirebaseClientProvider>
  );
}
