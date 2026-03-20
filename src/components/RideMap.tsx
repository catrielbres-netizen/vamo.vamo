'use client';
import React, { useEffect, useRef } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { Place } from '@/lib/types';
import { VamoIcon } from './VamoIcon';

interface RideMapProps {
  status: string;
  origin: Place;
  destination: Place;
  driverLocation?: { lat: number; lng: number } | null;
}

export default function RideMap({
  status,
  origin,
  destination,
  driverLocation,
}: RideMapProps) {
  const map = useMap();
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    const bounds = new google.maps.LatLngBounds();

    const addPoint = (point?: { lat: number; lng: number } | null) => {
      if (point?.lat != null && point?.lng != null) {
        bounds.extend(new google.maps.LatLng(point.lat, point.lng));
      }
    };

    // Ajuste inteligente según estado
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
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      });
    }
  }, [map, origin, destination, driverLocation, status]);

  useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    let path: google.maps.LatLngLiteral[] = [];

    if (
      status === 'driver_assigned' &&
      driverLocation?.lat != null &&
      driverLocation?.lng != null &&
      origin?.lat != null &&
      origin?.lng != null
    ) {
      path = [
        { lat: driverLocation.lat, lng: driverLocation.lng },
        { lat: origin.lat, lng: origin.lng },
      ];
    }

    if (
      (status === 'in_progress' || status === 'paused') &&
      driverLocation?.lat != null &&
      driverLocation?.lng != null &&
      destination?.lat != null &&
      destination?.lng != null
    ) {
      path = [
        { lat: driverLocation.lat, lng: driverLocation.lng },
        { lat: destination.lat, lng: destination.lng },
      ];
    }

    if (path.length >= 2) {
      routePolylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
      });
    }

    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [map, status, origin, destination, driverLocation]);

  const isSearching = status === 'searching';

  return (
    <>
      {origin?.lat != null && origin?.lng != null && (
        <AdvancedMarker position={origin}>
          {isSearching ? (
            <div className="relative flex items-center justify-center">
              <div className="absolute h-16 w-16 rounded-full bg-blue-500/20 animate-ping" />
              <div className="absolute h-10 w-10 rounded-full bg-blue-500/20 animate-pulse" />
              <div className="relative z-10 rounded-full bg-white p-2 shadow-xl border">
                <VamoIcon name="map-pin" className="h-6 w-6 text-green-500" />
              </div>
            </div>
          ) : (
            <div className="rounded-full bg-white p-2 shadow-xl border">
              <VamoIcon name="map-pin" className="h-6 w-6 text-green-500" />
            </div>
          )}
        </AdvancedMarker>
      )}

      {destination?.lat != null && destination?.lng != null && (
        <AdvancedMarker position={destination}>
          <div className="rounded-full bg-white p-2 shadow-xl border">
            <VamoIcon name="flag" className="h-6 w-6 text-red-500" />
          </div>
        </AdvancedMarker>
      )}

      {driverLocation?.lat != null && driverLocation?.lng != null && (
        <AdvancedMarker position={driverLocation}>
          <div className="relative flex items-center justify-center">
            <div className="absolute h-12 w-12 rounded-full bg-blue-500/20 animate-pulse" />
            <div className="relative z-10 rounded-full bg-white p-2 shadow-2xl border-2 border-blue-500">
              <VamoIcon name="car" className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}