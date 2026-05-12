'use client';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AdvancedMarker, Marker, useMap } from '@vis.gl/react-google-maps';
import type { Place } from '@/lib/types';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';

interface RideMapProps {
  status: string;
  origin: Place;
  destination: Place;
  driverLocation?: { lat: number; lng: number } | null;
  isExpanded?: boolean;
}

// Safe Marker Wrapper (Bloque 6 Fix)
// AdvancedMarker REQUIRES a MapId. If missing, it crashes the map.
function VamoMarker({ position, children }: { position: google.maps.LatLngLiteral, children: React.ReactNode }) {
  const map = useMap();
  const hasMapId = map && (map as any).getMapId?.();

  if (hasMapId) {
    return <AdvancedMarker position={position}>{children}</AdvancedMarker>;
  }
  
  // Fallback to legacy Marker if no MapId
  return <Marker position={position} />;
}

export default function RideMap({
  status,
  origin,
  destination,
  driverLocation,
  isExpanded = false,
}: RideMapProps) {
  const map = useMap();
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const directionsService = useMemo(() => (typeof google !== 'undefined' ? new google.maps.DirectionsService() : null), []);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);

  // 1. Manejo de Rutas (Directions API)
  useEffect(() => {
    if (!map || !directionsService || typeof google === 'undefined') return;

    // Initialize renderer if not exists
    if (!directionsRenderer.current) {
      directionsRenderer.current = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true, // we handle our own markers
        polylineOptions: {
          strokeColor: '#6366f1',
          strokeOpacity: 0.9,
          strokeWeight: 6,
        },
      });
    }

    const fetchRoute = async () => {
      let start: google.maps.LatLngLiteral | null = null;
      let end: google.maps.LatLngLiteral | null = null;

      if (status === 'driver_assigned' && driverLocation && origin) {
        start = { lat: driverLocation.lat, lng: driverLocation.lng };
        end = { lat: origin.lat, lng: origin.lng };
      } else if ((status === 'in_progress' || status === 'paused') && driverLocation && destination) {
        start = { lat: driverLocation.lat, lng: driverLocation.lng };
        end = { lat: destination.lat, lng: destination.lng };
      } else if (status === 'searching' && origin && destination) {
        start = { lat: origin.lat, lng: origin.lng };
        end = { lat: destination.lat, lng: destination.lng };
      }

      if (start && end) {
        try {
          const result = await directionsService.route({
            origin: start,
            destination: end,
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: true,
          });
          setDirections(result);
          directionsRenderer.current?.setDirections(result);
        } catch (error) {
          console.error("Directions request failed:", error);
        }
      } else {
        setDirections(null);
        directionsRenderer.current?.setDirections({ routes: [] } as any);
      }
    };

    fetchRoute();

    return () => {
      if (directionsRenderer.current) {
        directionsRenderer.current.setMap(null);
        directionsRenderer.current = null;
      }
    };
  }, [map, status, origin, destination, driverLocation, directionsService]);

  // 2. Manejo de bounds (fitBounds)
  useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    const bounds = new google.maps.LatLngBounds();

    const addPoint = (point?: { lat: number; lng: number } | null) => {
      if (point?.lat != null && point?.lng != null) {
        bounds.extend(new google.maps.LatLng(point.lat, point.lng));
      }
    };

    if (status === 'searching') {
      addPoint(origin);
      addPoint(destination);
    } else if (status === 'driver_assigned') {
      addPoint(driverLocation);
      addPoint(origin);
    } else if (status === 'driver_arrived') {
      addPoint(origin);
    } else if (status === 'in_progress' || status === 'paused') {
      addPoint(driverLocation);
      addPoint(destination);
    } else {
      addPoint(origin);
      addPoint(destination);
      addPoint(driverLocation);
    }

    if (bounds.isEmpty()) return;

    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setCenter(bounds.getCenter());
      map.setZoom(status === 'driver_arrived' ? 17 : 16);
    } else {
      map.fitBounds(bounds, {
        top: 120,
        right: 40,
        bottom: isExpanded ? 600 : 380,
        left: 40,
      });
    }
  }, [map, origin, destination, driverLocation, status, isExpanded]);

  const isSearching = status === 'searching';

  return (
    <>
      {origin?.lat != null && origin?.lng != null && (
        <VamoMarker position={origin}>
          <div className="relative flex flex-col items-center">
            {/* Outer large pinging aura - visible always but faster on searching */}
            <div className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500/30", isSearching ? "h-32 w-32 animate-ping" : "h-24 w-24 animate-pulse")} style={{ animationDuration: isSearching ? '2s' : '3s' }} />
            
            {/* Inner stable pulse */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-green-500/40 animate-pulse" />
            
            <div className="relative group transition-all duration-500 hover:scale-125 hover:-translate-y-2 cursor-pointer z-10">
              {/* Thick blurred glow effect */}
              <div className="absolute -inset-2 bg-green-500 blur-xl opacity-70 animate-pulse" />
              
              {/* Premium Pin container */}
              <div className="relative bg-zinc-950 p-3 rounded-full border-[3px] border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.8)] flex flex-col items-center justify-center">
                <VamoIcon name="map-pin" className="w-6 h-6 text-green-500 group-hover:animate-bounce" />
              </div>
              
              {/* Small dot below the pin pointing to actual location */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-r-[3px] border-b-[3px] border-green-500 rotate-45 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            </div>
          </div>
        </VamoMarker>
      )}

      {destination?.lat != null && destination?.lng != null && (
        <VamoMarker position={destination}>
          <div className="relative flex flex-col items-center">
             {/* Smooth aura for destination point */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full bg-white/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }} />

            <div className="relative group transition-all duration-500 animate-bounce hover:-translate-y-4 cursor-pointer z-10" style={{ animationDuration: '2.5s' }}>
              <div className="absolute -inset-2 bg-white blur-xl opacity-50 group-hover:opacity-80 transition-opacity" />
              
              <div className="relative bg-zinc-950 p-3 rounded-full border-[3px] border-white shadow-[0_0_40px_rgba(255,255,255,0.6)] flex items-center justify-center">
                <VamoIcon name="flag" className="h-6 w-6 text-white" />
              </div>
              
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-zinc-950 border-r-[3px] border-b-[3px] border-white rotate-45" />
            </div>
          </div>
        </VamoMarker>
      )}

      {driverLocation?.lat != null && driverLocation?.lng != null && (
        <VamoMarker position={driverLocation}>
          <div className="relative flex flex-col items-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full radar-pulse-2 bg-indigo-500/20" />
            <div className="relative group transition-all duration-300">
               <div className="absolute -inset-2 bg-indigo-500 blur-xl opacity-30 animate-pulse" />
               <div className="relative bg-indigo-600 p-3 rounded-full shadow-[0_0_40px_rgba(99,102,241,0.6)] border-2 border-white/20">
                 <VamoIcon name="car" className="h-6 w-6 text-white" />
               </div>
            </div>
          </div>
        </VamoMarker>
      )}
    </>
  );
}
