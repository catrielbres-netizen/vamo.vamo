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
}

const DriverDashboardContext = createContext<DriverDashboardContextType | undefined>(
  undefined
);

async function fetchAndEnrichRides(rides: WithId<RideOffer>[]): Promise<EnrichedRideOffer[]> {
    const db = getFirestore();
    const enrichedRides: EnrichedRideOffer[] = [];

    for (const rideOffer of rides) {
        const rideDocRef = doc(db, 'rides', rideOffer.rideId);
        const rideDocSnap = await getDoc(rideDocRef);

        if (rideDocSnap.exists()) {
            const rideData = rideDocSnap.data() as Ride;
            enrichedRides.push({
                ...rideOffer,
                passengerName: rideData.passengerName,
                origin: rideData.origin,
                destination: rideData.destination,
                pricing: rideData.pricing,
            });
        } else {
          enrichedRides.push({
            ...rideOffer,
            passengerName: null,
            origin: { address: 'No disponible', lat: 0, lng: 0 },
            destination: { address: 'No disponible', lat: 0, lng: 0 },
            pricing: { estimatedTotal: 0, estimatedDistanceMeters: 0 },
        });
        }
    }
    return enrichedRides;
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
  }), [enrichedRides, isLoading, error, newRideIds]);

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
