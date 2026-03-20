'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { type Ride, type WithId } from '@/lib/types';

/**
 * Hook to get the active ride data for a user.
 * @param rideId The ID of the ride to fetch.
 * @returns An object with the active ride (guaranteed to have an ID) and a loading state.
 */
export function useActiveRide(rideId: string | null | undefined) {
  const firestore = useFirestore();
  const [activeRide, setActiveRide] = useState<WithId<Ride> | null>(null);
  const [isRideLoading, setIsRideLoading] = useState(true);

  useEffect(() => {
    if (!rideId || !firestore) {
      setActiveRide(null);
      setIsRideLoading(false);
      return;
    }

    setIsRideLoading(true);
    const rideRef = doc(firestore, 'rides', rideId);

    const unsubscribe = onSnapshot(
      rideRef,
      (doc) => {
        if (doc.exists()) {
          setActiveRide({ id: doc.id, ...doc.data() } as WithId<Ride>);
        } else {
          console.warn(`Active ride with id ${rideId} not found.`);
          setActiveRide(null);
        }
        setIsRideLoading(false);
      },
      (error) => {
        console.error("Error fetching active ride:", error);
        setActiveRide(null);
        setIsRideLoading(false);
      }
    );

    return () => unsubscribe();
  }, [rideId, firestore]);

  return { activeRide, isRideLoading };
}
