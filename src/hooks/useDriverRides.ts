'use client';

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot, Timestamp, limit } from "firebase/firestore";
import { useFirestore, useUser } from "@/firebase";
import { type RideOffer } from "@/lib/types";
import { playOfferSound, announceNewRide } from "@/lib/sounds";

// Define a clear, local type for the offer object that includes the document ID.
// This removes the ambiguity of the potentially problematic `WithId` utility type.
type OfferWithId = RideOffer & { id: string };

/**
 * A hook that listens for available ride OFFERS for the current driver.
 * It now guarantees that every offer returned has a valid `id` property.
 */
export function useDriverRides(shouldListen: boolean) {
  const firestore = useFirestore();
  const { user } = useUser();
  
  const [offers, setOffers] = useState<OfferWithId[]>([]);
  const [loading, setLoading] = useState(shouldListen);
  const [error, setError] = useState<string | null>(null);
  const [newOfferIds, setNewOfferIds] = useState(new Set<string>());

  useEffect(() => {
    if (!shouldListen || !firestore || !user) {
      setOffers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const driverId = user.uid;
    console.log(`[DRIVER_OFFERS] UID: ${driverId} | Listening: ${shouldListen}`);
    console.log(`[DRIVER_OFFERS] Query started: rideOffers where driverId == ${driverId} and status == pending`);

    const offersQuery = query(
      collection(firestore, "rideOffers"),
      where("driverId", "==", driverId),
      where("status", "==", "pending"),
      limit(20)
    );

    const unsubscribe = onSnapshot(offersQuery, (snapshot) => {
      console.log(`[DRIVER_OFFERS] Snapshot received. Docs: ${snapshot.docs.length}`);
      
      const rideMap = new Map<string, OfferWithId>();
      
      snapshot.docs.forEach(doc => {
          const data = doc.data();
          const mappedOffer: OfferWithId = {
              id: doc.id,
              rideId: data.rideId,
              driverId: data.driverId,
              passengerId: data.passengerId,
              status: data.status,
              sentAt: data.sentAt,
              expiresAt: data.expiresAt,
              finalizedAt: data.finalizedAt,
              score: data.score,
              distanceMeters: data.distanceMeters,
              round: data.round,
              origin: data.origin,
              destination: data.destination,
              serviceType: data.serviceType,
              estimatedTotal: data.estimatedTotal,
              passengerName: data.passengerName,
              cityKey: data.cityKey,
              offerBreakdown: data.offerBreakdown,
              isDiscountApplied: data.isDiscountApplied,
              compensationAmount: data.compensationAmount,
              passengerPaysTotal: data.passengerPaysTotal,
              driverReceivesTotal: data.driverReceivesTotal
          };

          // [VamO AUDIT] Deduplicate by rideId. 
          // If we have multiple offers for the same rideId, we keep the one with the higher round (if available) or just the latest doc.
          const existing = rideMap.get(data.rideId);
          if (!existing || (mappedOffer.round || 0) > (existing.round || 0)) {
              rideMap.set(data.rideId, mappedOffer);
          }
      });

      const validOffers = Array.from(rideMap.values());
      console.log(`[DRIVER_OFFERS] Deduplicated to ${validOffers.length} unique rides.`);

      // Update offers state
      setOffers(validOffers);
      
      // Update loading state immediately after the first sync
      setLoading(false);
      setError(null);

      // Handle "new offer" sound/notifications separately from state returns
      const prevOfferIds = new Set(offers.map(o => o.id));
      const newOffers = validOffers.filter(o => !prevOfferIds.has(o.id));

      if (newOffers.length > 0 && prevOfferIds.size > 0) {
          const newIds = new Set(newOffers.map(o => o.id));
          setNewOfferIds(newIds);
          
          setTimeout(() => {
              setNewOfferIds(currentNewIds => {
                  const updatedIds = new Set(currentNewIds);
                  newIds.forEach(id => updatedIds.delete(id));
                  return updatedIds;
              });
          }, 3000);
      }

    }, (err) => {
      console.error("[useDriverRides] Error in onSnapshot listener:", err);
      setError("Error de conexión buscando ofertas.");
      setOffers([]);
      setLoading(false);
    });

    return () => {
        console.log(`[DRIVER_OFFERS] listener detached for ${user?.uid}`);
        unsubscribe?.();
    };
  }, [shouldListen, firestore, user?.uid]);
  
  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => (a?.expiresAt?.seconds || 0) - (b?.expiresAt?.seconds || 0));
  }, [offers]);

  return { 
      rides: sortedOffers,
      loading, 
      error, 
      newRideIds: newOfferIds
  };
}
