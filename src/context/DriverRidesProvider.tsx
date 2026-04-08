'use client';

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useUser } from '@/firebase';
import { useDriverRides } from '@/hooks/useDriverRides';
import { type Ride, type RideOffer, type WithId } from '@/lib/types';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

// This is the enriched object the UI components will receive.
export type EnrichedRideOffer = WithId<RideOffer> & { 
  passengerName?: string | null;
  origin: Ride['origin'];
  destination: Ride['destination'];
  pricing: Ride['pricing'];
};

interface DriverDashboardContextType {
  rides: EnrichedRideOffer[];
  loading: boolean;
  error: string | null;
  newRideIds: Set<string>;
  currentLocation: { lat: number, lng: number } | null;
  setCurrentLocation: (loc: { lat: number, lng: number } | null) => void;
}

const DriverDashboardContext = createContext<DriverDashboardContextType | undefined>(
  undefined
);

async function fetchAndEnrichRides(rides: WithId<RideOffer>[]): Promise<EnrichedRideOffer[]> {
    // Current RideOffer already has denormalized data (origin, destination, passengerName, pricing).
    // We no longer need to fetch the 'rides' document sequentially for each offer.
    return rides.map(offer => ({
        ...offer,
        // These fields are now guaranteed to be in the RideOffer document from the backend.
        // We provide defaults just in case of older documents.
        passengerName: offer.passengerName || "Pasajero",
        origin: offer.origin,
        destination: offer.destination,
        pricing: {
            estimated: {
                total: offer.estimatedTotal,
                breakdown: {} as any, // Only total is critical for initial broadcast display
                configSnapshot: {} as any,
                calculatedAt: null as any,
            }
        }
    }));
}

export const DriverRidesProvider = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useUser();
  const isDriverAvailable = useMemo(() => {
    if (!profile) return false;
    // Ensure 'approved' is treated as a strict boolean
    return profile.driverStatus === 'online' && !!profile.approved && (profile.currentBalance ?? 0) >= 0;
  }, [profile]);

  const { rides: rawRides, loading: initialLoading, error, newRideIds } = useDriverRides(isDriverAvailable);
  
  const [enrichedRides, setEnrichedRides] = useState<EnrichedRideOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);

  useEffect(() => {
    if (initialLoading) {
      setIsLoading(true);
      return;
    }
    if (rawRides.length > 0) {
      fetchAndEnrichRides(rawRides)
        .then(setEnrichedRides)
        .finally(() => setIsLoading(false));
    } else {
      setEnrichedRides([]);
      setIsLoading(false);
    }
  }, [rawRides, initialLoading]);

  const value = useMemo(() => ({
    rides: enrichedRides,
    loading: isLoading,
    error,
    newRideIds,
    currentLocation,
    setCurrentLocation
  }), [enrichedRides, isLoading, error, newRideIds, currentLocation]);

  return (
    <DriverDashboardContext.Provider value={value}>
      {children}
    </DriverDashboardContext.Provider>
  );
};

export const useDriverDashboard = () => {
  const context = useContext(DriverDashboardContext);
  if (context === undefined) {
    throw new Error('useDriverDashboard must be used within a DriverRidesProvider');
  }
  return context;
};
