'use client';
import { APIProvider } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY } from '@/lib/googleMaps';
import { createContext, useContext } from 'react';

const MapsContext = createContext<{ ready: boolean }>({ ready: false });

export const useMapsReady = () => useContext(MapsContext);

export function MapsProvider({ children }: { children: React.ReactNode }) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('Google Maps API Key missing');
    return <>{children}</>;
  }

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['places']}
      onLoad={() => {
        console.log('✅ Google Maps loaded');
      }}
    >
      <MapsContext.Provider value={{ ready: true }}>
        {children}
      </MapsContext.Provider>
    </APIProvider>
  );
}
