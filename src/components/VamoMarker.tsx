'use client';

import React from 'react';
import { AdvancedMarker, Marker, useMap } from '@vis.gl/react-google-maps';

interface VamoMarkerProps {
  position: google.maps.LatLngLiteral;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  zIndex?: number;
}

/**
 * VamoMarker - Componente de Mapa Seguro
 * Detecta si el MapId actual permite AdvancedMarkers.
 * Si no hay MapId válido, cae automáticamente a Marker estándar para evitar crasheos.
 */
export function VamoMarker({ position, children, onClick, zIndex }: VamoMarkerProps) {
  const map = useMap();
  
  // Verificamos si el mapa tiene un MapId válido para AdvancedMarkers
  const hasMapId = map && (map as any).getMapId?.();

  if (hasMapId) {
    return (
      <AdvancedMarker 
        position={position} 
        onClick={onClick}
        zIndex={zIndex}
      >
        {children}
      </AdvancedMarker>
    );
  }

  // Fallback a marcador estándar de Google Maps si no hay MapId
  return (
    <Marker 
      position={position} 
      onClick={onClick}
      zIndex={zIndex}
    />
  );
}
