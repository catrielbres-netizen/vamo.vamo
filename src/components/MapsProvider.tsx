'use client';
import { APIProvider } from '@vis.gl/react-google-maps';
import React from 'react';

const MapsAvailabilityContext = React.createContext({ mapsAvailable: true });

export const useMapsAvailability = () => React.useContext(MapsAvailabilityContext);

export function MapsProvider({ children }: React.PropsWithChildren) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
  const mapsAreAvailable = !!apiKey;

  return (
    <MapsAvailabilityContext.Provider value={{ mapsAvailable: mapsAreAvailable }}>
      {mapsAreAvailable ? (
        <APIProvider apiKey={apiKey} libraries={['places', 'routes', 'geocoding']}>
          {children}
        </APIProvider>
      ) : (
        <>{children}</>
      )}
    </MapsAvailabilityContext.Provider>
  );
}
