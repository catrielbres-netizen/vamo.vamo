'use client';

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { useFirestore, useUser } from "@/firebase";
import { type RideOffer } from "@/lib/types";
import { notificationSoundUri } from "@/lib/sounds";

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

    const offersQuery = query(
      collection(firestore, "rideOffers"),
      where("driverId", "==", driverId),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(offersQuery, (snapshot) => {
      const now = Timestamp.now();
      
      const validOffers: OfferWithId[] = snapshot.docs
        .map(doc => ({ ...(doc.data() as RideOffer), id: doc.id }))
        .filter(offer => offer.expiresAt && offer.expiresAt.toMillis() > now.toMillis());

      setOffers(prevOffers => {
          const prevOfferIds = new Set(prevOffers.map(o => o.id));
          const newOffers = validOffers.filter(o => !prevOfferIds.has(o.id));

          if (newOffers.length > 0) {
              // The `id` property is now guaranteed to be a string.
              const newIds = new Set(newOffers.map(o => o.id));
              setNewOfferIds(newIds);
              
              try {
                const audio = new Audio(notificationSoundUri);
                audio.play().catch(e => console.warn("Could not play notification sound:", e));
              } catch (e) {
                console.error("Error playing notification sound:", e);
              }

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
