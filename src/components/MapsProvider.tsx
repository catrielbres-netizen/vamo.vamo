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
      {!mapsAreAvailable && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '8px',
          textAlign: 'center',
          fontSize: '12px',
          fontWeight: 'bold',
          borderBottom: '1px solid #f87171'
        }}>
          ⚠️ Google Maps API Key no configurada (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
        </div>
      )}
      {mapsAreAvailable ? (
        <APIProvider apiKey={apiKey} libraries={['places', 'routes', 'geocoding']}>
          {children}
        </APIProvider>
      ) : (
        <div className="relative w-full h-full bg-slate-100 flex items-center justify-center border-2 border-dashed border-slate-300">
           <div className="text-center p-6">
              <p className="text-slate-500 font-medium">Mapa no disponible</p>
              <p className="text-slate-400 text-sm">Falta configurar la clave de API de Google Maps.</p>
           </div>
           <div className="hidden">{children}</div>
        </div>
      )}
    </MapsAvailabilityContext.Provider>
  );
}
