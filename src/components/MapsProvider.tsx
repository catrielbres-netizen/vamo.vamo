'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { createContext, useContext, useState } from 'react';

const MapsContext = createContext<{ ready: boolean }>({ ready: false });

export const useMapsReady = () => useContext(MapsContext);

export function MapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('Google Maps API Key is not configured.');
    return <>{children}</>;
  }

  return (
    <APIProvider
      apiKey={apiKey}
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
