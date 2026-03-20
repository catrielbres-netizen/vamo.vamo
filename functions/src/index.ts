
'use server';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { canDriverTakeRide } from "./eligibility";
import { UserProfile, Ride, RideOffer, ServiceType } from "./types";

admin.initializeApp();
const db = admin.firestore();
const OFFER_DURATION_SECONDS = 60;
const MAX_DISTANCE_KM = 3; // Production value

function distanceInKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) return Infinity;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function findNextDriverAndCreateOffer(rideId: string) {
    const rideRef = db.doc(`rides/${rideId}`);
    try {
        await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists) throw new Error("Ride document not found.");
            const rideData = rideSnap.data() as Ride;

            if (rideData.status !== 'searching') return;

            const notifiedDrivers = rideData.notifiedDrivers || [];
            const driversQuery = db.collection('users').where('driverStatus', '==', 'online').where('approved', '==', true).where('isSuspended', '==', false);
            const driversSnap = await tx.get(driversQuery);

            const candidatesPromises = driversSnap.docs
              .filter(doc => !notifiedDrivers.includes(doc.id))
              .map(async (driverDoc) => {
                const driverProfile = driverDoc.data() as UserProfile;
                if (!canDriverTakeRide(driverProfile, rideData.serviceType as ServiceType)) return null;

                const locSnap = await tx.get(db.doc(`drivers_locations/${driverDoc.id}`));
                const locData = locSnap.data();
                
                if (locData?.currentLocation?.lat === undefined || locData?.currentLocation?.lng === undefined) return null;

                const distanceKm = distanceInKm(rideData.origin.lat, rideData.origin.lng, locData.currentLocation.lat, locData.currentLocation.lng);
                if (distanceKm > MAX_DISTANCE_KM) return null;
                
                const rating = driverProfile.averageRating ?? 4.5;
                const score = (rating * 100) - (distanceKm * 20);

                return {
                    driverId: driverDoc.id,
                    distanceKm,
                    rating,
                    score,
                };
              });
              
            const resolvedCandidates = (await Promise.all(candidatesPromises)).filter((c) => c !== null) as { driverId: string; distanceKm: number; rating: number; score: number }[];


            if (resolvedCandidates.length === 0) {
                logger.warn(`No more eligible drivers for ride ${rideId}. Cancelling.`);
                tx.update(rideRef, { status: "cancelled", cancelReason: "no_drivers_available", currentOfferedDriverId: null, matchingExpiresAt: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                return;
            }
            
            resolvedCandidates.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.distanceKm - b.distanceKm;
            });
            
            const bestCandidate = resolvedCandidates[0];
            const nextDriverId = bestCandidate.driverId;
            
            const passengerSnap = await tx.get(db.doc(`users/${rideData.passengerId}`));
            const passengerName = passengerSnap.data()?.name || "Pasajero";

            const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OFFER_DURATION_SECONDS * 1000);
            const offerId = `${rideId}_${nextDriverId}`;
            const newOfferRef = db.collection('rideOffers').doc(offerId);

            const offerData: RideOffer = {
              rideId,
              driverId: nextDriverId,
              passengerId: rideData.passengerId,
              status: 'pending',
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
              expiresAt,
              round: (rideData.notifiedDrivers || []).length + 1,
              origin: rideData.origin,
              destination: rideData.destination,
              serviceType: rideData.serviceType,
              estimatedTotal: rideData.pricing?.estimatedTotal ?? 0,
              passengerName: passengerName,
            };

            tx.set(newOfferRef, offerData);

            tx.update(rideRef, {
                currentOfferedDriverId: nextDriverId,
                matchingExpiresAt: expiresAt,
                notifiedDrivers: admin.firestore.FieldValue.arrayUnion(nextDriverId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
    } catch(e) {
        logger.error(`[findNextDriver] Transaction failed for ride ${rideId}: `, e);
    }
}

export const createRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { origin, destination, serviceType, dryRun } = request.data;
    if (!origin || !destination || !serviceType) throw new HttpsError('invalid-argument', 'Faltan parámetros.');
    
    const passengerId = request.auth.uid;
    // Simple estimated total for now, replace with real pricing logic
    const estimatedTotal = 5000; 

    if (dryRun) {
        return { estimatedTotal };
    }

    const passengerRef = db.doc(`users/${passengerId}`);

    try {
        const rideRef = await db.runTransaction(async (tx) => {
            const passengerSnap = await tx.get(passengerRef);
            if (!passengerSnap.exists) throw new HttpsError('not-found', 'Tu perfil de usuario no fue encontrado.');
            const passengerData = passengerSnap.data() as UserProfile;

            if (passengerData.activeRideId) {
                const activeRideSnap = await tx.get(db.doc(`rides/${passengerData.activeRideId}`));
                if (activeRideSnap.exists && !['completed', 'cancelled'].includes(activeRideSnap.data()?.status)) {
                    throw new HttpsError('failed-precondition', 'Ya tenés un viaje activo.');
                }
            }

            const newRideRef = db.collection('rides').doc();
            tx.set(newRideRef, {
                passengerId,
                origin, 
                destination, 
                serviceType,
                status: 'searching', 
                pricing: { estimatedTotal },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                notifiedDrivers: [],
                currentOfferedDriverId: null,
                matchingExpiresAt: null,
            });
            tx.update(passengerRef, { activeRideId: newRideRef.id });
            return newRideRef;
        });
        return { success: true, rideId: rideRef.id };
    } catch(error: any) {
        logger.error(`[createRideV1] Transaction failed for passenger ${passengerId}`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'No se pudo crear el viaje.');
    }
});

export const ignoreRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { rideId } = request.data;
    if (!rideId) throw new HttpsError('invalid-argument', 'Falta el ID del viaje.');
    
    const driverId = request.auth.uid;
    const rideRef = db.doc(`rides/${rideId}`);
    const offerId = `${rideId}_${driverId}`;
    const offerRef = db.collection('rideOffers').doc(offerId);

    try {
        await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists) return; // Ride already gone
            const rideData = rideSnap.data() as Ride;

            if (rideData.status !== 'searching' || rideData.currentOfferedDriverId !== driverId) {
                return; // Not our turn to ignore
            }

            tx.update(offerRef, { status: 'rejected', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
            tx.update(rideRef, {
                currentOfferedDriverId: null,
                matchingExpiresAt: null, // This will trigger the worker to find a new driver
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        await findNextDriverAndCreateOffer(rideId);
        return { success: true };
    } catch (error: any) {
        logger.error(`[ignoreRideV1] Error for driver ${driverId} on ride ${rideId}:`, error);
        throw new HttpsError('internal', 'No se pudo rechazar el viaje.');
    }
});

export const scheduledRideWorker = onSchedule({ schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires" }, async (event) => {
    const now = admin.firestore.Timestamp.now();

    // Query for rides where the offer has expired OR where we are in a searching state without an active offer
    const newRidesQuery = db.collection('rides').where('status', '==', 'searching').where('currentOfferedDriverId', '==', null);
    const expiredRidesQuery = db.collection('rides').where('status', '==', 'searching').where('matchingExpiresAt', '<=', now);

    const [newRidesSnap, expiredRidesSnap] = await Promise.all([newRidesQuery.get(), expiredRidesQuery.get()]);

    const ridesToProcess = new Map<string, Ride>();
    newRidesSnap.forEach(doc => ridesToProcess.set(doc.id, doc.data() as Ride));
    expiredRidesSnap.forEach(doc => ridesToProcess.set(doc.id, doc.data() as Ride));

    for (const [rideId, rideData] of ridesToProcess) {
        if (rideData.status !== 'searching') continue;

        // If there was an offer, it has now expired. Mark it as such.
        if (rideData.currentOfferedDriverId) {
             const offerId = `${rideId}_${rideData.currentOfferedDriverId}`;
             await db.collection('rideOffers').doc(offerId).update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        }
        
        // Find the next driver. This handles both expired offers and brand-new rides.
        await findNextDriverAndCreateOffer(rideId);
    }
});

export * from './handlers';
