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
  const [loading, setLoading] = useState(true);
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
    console.log(`[DRIVER_OFFERS] listener attached`);
    console.log(`[DRIVER_OFFERS] query params`, { driverId, status: "pending", limit: 20 });

    const offersQuery = query(
      collection(firestore, "rideOffers"),
      where("driverId", "==", driverId),
      where("status", "==", "pending"),
      limit(20)
    );

    const unsubscribe = onSnapshot(offersQuery, (snapshot) => {
      const now = Timestamp.now();
      console.log(`[DRIVER_OFFERS] snapshot count:`, snapshot.docs.length);
      
      const validOffers: OfferWithId[] = snapshot.docs
        .map(doc => {
            const data = doc.data() as RideOffer;
            console.log(`[DRIVER_OFFERS] offer received:`, doc.id, data);
            return { ...data, id: doc.id };
        })
        // Relax filter with a 5-minute grace period (up from 1m) to handle substantial client clock skew.
        .filter(offer => {
            const isValid = offer.expiresAt && (offer.expiresAt.toMillis() + 300000) > now.toMillis();
            if (!isValid) {
                console.log(`[DRIVER_OFFERS] filtered out reason: expired locally. expiresAt=${offer.expiresAt?.toMillis()}, now=${now.toMillis()}`);
            }
            return isValid;
        });

      setOffers(prevOffers => {
          const prevOfferIds = new Set(prevOffers.map(o => o.id));
          const newOffers = validOffers.filter(o => !prevOfferIds.has(o.id));

          if (newOffers.length > 0) {
              // The `id` property is now guaranteed to be a string.
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
          return validOffers;
      });
      
      setLoading(false);
      setError(null);

    }, (err) => {
      console.error("[useDriverRides] Error in onSnapshot listener:", err);
      if (err.message.includes('The query requires an index')) {
          setError("Error de base de datos: Falta un índice. Revisa la consola de Firebase.");
      } else {
          setError("Error de conexión buscando ofertas.");
      }
      setOffers([]);
      setLoading(false);
    });

    return () => unsubscribe();

  }, [shouldListen, firestore, user]);
  
  const sortedOffers = useMemo(() => {
    // Sort offers that are guaranteed to have an `expiresAt`
    return [...offers].sort((a, b) => (a.expiresAt.seconds || 0) - (b.expiresAt.seconds || 0));
  }, [offers]);

  return { 
      rides: sortedOffers,
      loading, 
      error, 
      newRideIds: newOfferIds
  };
}
