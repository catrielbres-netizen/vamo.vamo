'use client';

import { FirebaseClientProvider } from '@/firebase';
import { APIProvider } from '@vis.gl/react-google-maps';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <APIProvider 
      apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
      libraries={['places']}
    >
      <FirebaseClientProvider>
        {children}
      </FirebaseClientProvider>
    </APIProvider>
  );
}
