
'use server';
import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import * as crypto from "crypto";
import { onDocumentUpdated, onDocumentCreated, FirestoreEvent, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { canDriverTakeRide } from "./eligibility";
import { UserProfile, Ride, DriverLevel, ServiceType, RideStatus, CompletedRide, PricingConfig, WithdrawalRequest, WithId, RideOffer } from "./types";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();


// --- NOTIFICATION HELPER ---
const sendNotification = async (userId: string, title: string, body: string, link: string = '/', additionalData: { [key: string]: any } = {}) => {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
        logger.warn(`User ${userId} not found, cannot send notification.`);
        return;
    }

    const userProfile = userSnap.data() as UserProfile;
    const fcmToken = userProfile?.fcmToken;

    if (fcmToken) {
        const processedData: { [key: string]: string } = {};
        for (const key in additionalData) {
            if (typeof additionalData[key] === 'object') {
                processedData[key] = JSON.stringify(additionalData[key]);
            } else {
                processedData[key] = String(additionalData[key]);
            }
        }
        const message = {
            token: fcmToken,
            data: { title, body, link, ...processedData },
        };
        try {
            await admin.messaging().send(message);
            logger.info(`Successfully sent data-only notification to user ${userId}.`);
        } catch (error: any) {
            logger.error(`Error sending notification to ${userId}:`, error);
            if (error.code === 'messaging/registration-token-not-registered') {
                logger.info(`FCM token for user ${userId} is stale. Removing it.`);
                await userSnap.ref.update({ fcmToken: null });
            }
        }
    } else {
        logger.info(`User ${userId} does not have an FCM token. Skipping notification.`);
    }
};

function haversineDistance(coords1: { lat: number; lng: number; }, coords2: { lat: number; lng: number; }): number {
    if (!coords1 || !coords2) return Infinity;
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- PRICING & FARE CALCULATION HELPERS ---
function calculateFareV2({ distanceMeters, service, isNight = false }: { distanceMeters: number; service: ServiceType; isNight?: boolean; }) {
  const DAY_BASE_FARE = 1400;
  const DAY_PRICE_PER_100M = 152;
  const NIGHT_BASE_FARE = 1652;
  const NIGHT_PRICE_PER_100M = 189;

  const baseFare = isNight ? NIGHT_BASE_FARE : DAY_BASE_FARE;
  const pricePer100m = isNight ? NIGHT_PRICE_PER_100M : DAY_PRICE_PER_100M;
  const distanceCost = Math.ceil(distanceMeters / 100) * pricePer100m;
  let totalPremium = baseFare + distanceCost;

  let finalTotal;
  switch (service) {
    case "express":
      finalTotal = totalPremium * 0.90; // 10% discount
      break;
    case "premium":
    default:
      finalTotal = totalPremium;
      break;
  }
  return Math.ceil(finalTotal / 50) * 50;
}

// --- CALLABLE FUNCTIONS ---
export const createRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { origin, destination, serviceType, dryRun } = request.data;
    if (origin?.lat == null || origin?.lng == null || destination?.lat == null || destination?.lng == null || !serviceType) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros: origin, destination, o serviceType.');
    }
    const passengerId = request.auth.uid;
    const passengerRef = db.collection('users').doc(passengerId);

    const distanceMeters = haversineDistance(origin, destination);
    const estimatedTotal = calculateFareV2({ distanceMeters, service: serviceType });
    
    if (dryRun) {
        return { estimatedTotal, estimatedDistanceMeters: distanceMeters };
    }

    try {
        const rideRef = await db.runTransaction(async (transaction) => {
            const passengerSnap = await transaction.get(passengerRef);
            if (!passengerSnap.exists) {
                throw new HttpsError('not-found', 'No se encontró tu perfil de usuario.');
            }
            const passengerData = passengerSnap.data() as UserProfile;
            if (passengerData.role !== 'passenger') {
                throw new HttpsError('permission-denied', 'Solo los pasajeros pueden crear viajes.');
            }
            if (passengerData.activeRideId) {
                const existingRideSnap = await transaction.get(db.collection('rides').doc(passengerData.activeRideId));
                if (existingRideSnap.exists && !['completed', 'cancelled', 'expired'].includes(existingRideSnap.data()?.status)) {
                    throw new HttpsError('already-exists', 'Ya tenés un viaje activo.');
                }
            }
            const newRideDocRef = db.collection('rides').doc();
            const newRideData: Partial<Ride> = {
                passengerId,
                passengerName: passengerData.name || 'Pasajero',
                origin,
                destination,
                serviceType,
                city: passengerData.city || 'Rawson',
                country: passengerData.country || 'AR',
                pricing: {
                    estimatedTotal,
                    estimatedDistanceMeters: distanceMeters,
                    surgeMultiplier: 1.0,
                    discountAmount: 0,
                },
                status: 'searching' as RideStatus,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                pricingVersion: 'v1',
                matchingExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minute TTL for cleanup
                driverId: null,
            };
            transaction.set(newRideDocRef, newRideData);
            transaction.update(passengerRef, { activeRideId: newRideDocRef.id });
            return newRideDocRef;
        });
        return { success: true, rideId: rideRef.id };
    } catch (error: any) {
        logger.error(`[createRideV1] Error for user ${passengerId}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'No se pudo crear el viaje.');
    }
});


// --- MATCHING ENGINE - SPRINT 1 ---
async function findAndOfferDrivers(ride: Ride, rideId: string) {
    logger.info(`[Matching V7 - Broadcast] Finding all online drivers for ride ${rideId}`);

    // 1. Get ALL online drivers, no distance or geo filters.
    const onlineDriversSnap = await db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .get();

    if (onlineDriversSnap.empty) {
        logger.warn(`[Matching V7] No drivers are online. Ride ${rideId} will expire.`);
        return;
    }

    const allOnlineDriverIds = onlineDriversSnap.docs.map(doc => doc.id);
    
    if (allOnlineDriverIds.length === 0) {
         logger.warn(`[Matching V7] Query for online drivers returned 0 docs.`);
         return;
    }

    // 2. Secondary check for eligibility from the `users` collection.
    const driverProfilesSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', allOnlineDriverIds).get();

    const eligibleDrivers: { id: string; profile: UserProfile }[] = [];
    driverProfilesSnap.forEach(doc => {
        const driverProfile = doc.data() as UserProfile;
        // Basic eligibility: approved, not suspended, no active ride.
        if (driverProfile && driverProfile.approved && !driverProfile.isSuspended && !driverProfile.activeRideId) {
             eligibleDrivers.push({ id: doc.id, profile: driverProfile });
        }
    });

    if (eligibleDrivers.length === 0) {
        logger.warn(`[Matching V7] Found ${allOnlineDriverIds.length} online drivers, but none are currently eligible for ride ${rideId}.`);
        return;
    }

    const offerDurationMs = 30000; // 30 seconds as requested
    const offerExpiration = admin.firestore.Timestamp.fromMillis(Date.now() + offerDurationMs);

    const offerBatch = db.batch();
    const rideRef = db.doc(`rides/${rideId}`);
    const driverIdsToNotify = eligibleDrivers.map(d => d.id);

    eligibleDrivers.forEach(driver => {
        const offerRef = db.collection('rideOffers').doc(); // Let Firestore generate ID
        const driverLocationRef = db.collection('drivers_locations').doc(driver.id);
        
        const offerData: Partial<RideOffer> = {
            rideId,
            driverId: driver.id,
            passengerId: ride.passengerId,
            status: 'pending',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: offerExpiration,
            round: 1,
        };

        offerBatch.set(offerRef, offerData);
        offerBatch.update(driverLocationRef, { pendingOffers: admin.firestore.FieldValue.increment(1) });
        
        const rideDataForPush = {
            id: rideId,
            origin: ride.origin,
            destination: ride.destination,
            serviceType: ride.serviceType,
            pricing: { estimatedTotal: ride.pricing.estimatedTotal },
            passengerName: ride.passengerName,
        };

        sendNotification(driver.id, "¡Nuevo Viaje Disponible!", `Pasajero en ${ride.origin.address}.`, '/', { type: 'ride_offer', rideData: rideDataForPush })
          .catch(e => logger.error(`Failed to send offer notification to ${driver.id}`, e));
    });
    
    offerBatch.update(rideRef, {
        notifiedDrivers: admin.firestore.FieldValue.arrayUnion(...driverIdsToNotify),
        matchingStage: 'broadcast_all'
    });
    
    await offerBatch.commit();
    logger.info(`[Matching V7] Successfully created ${eligibleDrivers.length} offers for ride ${rideId}.`);
}


export const matchingEngineV1 = onDocumentCreated("rides/{rideId}", async (event) => {
    const rideId = event.params.rideId;
    const rideSnap = event.data;
    if (!rideSnap) {
        logger.warn(`[MatchingEngine] Event for ride ${rideId} has no data. Exiting.`);
        return;
    }
    const ride = rideSnap.data() as Ride;
    if (ride.status !== 'searching') {
        logger.log(`[MatchingEngine] Ride ${rideId} is not in 'searching' state. Ignoring.`);
        return;
    }
    
    logger.info(`[MatchingEngine] New ride ${rideId}. Triggering broadcast to all online drivers.`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await findAndOfferDrivers(ride, rideId);
});

export const acceptRideV2 = onCall({cors: true, region: 'us-central1'}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { rideId } = request.data;
    if (!rideId) {
        throw new HttpsError('invalid-argument', 'Falta el ID del viaje.');
    }

    const driverId = request.auth.uid;
    
    const offersQuery = db.collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('driverId', '==', driverId)
        .where('status', '==', 'pending');
    const offersSnap = await offersQuery.get();

    if (offersSnap.empty) {
        throw new HttpsError('not-found', 'Este viaje ya no está disponible para vos o fue tomado por otro conductor.');
    }
    const offerDoc = offersSnap.docs[0];
    const offerData = offerDoc.data();
    if (offerData.expiresAt && offerData.expiresAt.toMillis() < Date.now()) {
        await offerDoc.ref.update({ status: 'expired', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
        throw new HttpsError('deadline-exceeded', 'La oferta de viaje ha expirado.');
    }

    const rideRef = db.doc(`rides/${rideId}`);
    const driverRef = db.doc(`users/${driverId}`);
    const driverLocationRef = db.doc(`drivers_locations/${driverId}`);

    try {
        await db.runTransaction(async (transaction) => {
            const driverSnap = await transaction.get(driverRef);
            const rideSnap = await transaction.get(rideRef);

            if (!driverSnap.exists) throw new HttpsError('not-found', 'No se encontró tu perfil de conductor.');
            if (!rideSnap.exists) throw new HttpsError('not-found', 'Este viaje ya no existe.');
            
            const driverData = driverSnap.data() as UserProfile;
            const rideData = rideSnap.data() as Ride;

            if (!canDriverTakeRide(driverData, rideData.serviceType)) {
                 throw new HttpsError('failed-precondition', 'No estás habilitado para este tipo de viaje.');
            }
            if (rideData.status !== 'searching' || rideData.driverId) {
                throw new HttpsError('failed-precondition', 'Este viaje ya fue tomado por otro conductor.');
            }

            const driverLocation = (await transaction.get(driverLocationRef)).data()?.currentLocation;

            const rideUpdatePayload: { [key: string]: any } = {
                status: 'driver_assigned',
                driverId: driverId,
                driverName: driverData.name || 'Conductor',
                driverRating: driverData.averageRating ?? 5,
                driverLocationAtAccept: { ...(driverLocation || { lat: 0, lng: 0 }), timestamp: admin.firestore.FieldValue.serverTimestamp() },
                driverAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (driverData.vehicleModel) rideUpdatePayload.driverVehicle = `${driverData.vehicleModel} (${driverData.carModelYear || 'N/A'})`;
            if (driverData.plateNumber) rideUpdatePayload.driverPlate = driverData.plateNumber;

            transaction.update(rideRef, rideUpdatePayload);
            transaction.update(driverRef, { activeRideId: rideId, driverStatus: 'in_ride', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.update(driverLocationRef, { driverStatus: 'in_ride', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        
        const otherOffersQuery = db.collection('rideOffers').where('rideId', '==', rideId).where('status', '==', 'pending');
        const otherOffersSnapshot = await otherOffersQuery.get();
        if (!otherOffersSnapshot.empty) {
            const batch = db.batch();
            otherOffersSnapshot.forEach(doc => {
                batch.update(doc.ref, { status: 'cancelled', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
        }
        
        await offerDoc.ref.update({ status: 'accepted', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });

        logger.info(`[acceptRideV2] Cleaned up ${otherOffersSnapshot.size} other offers for ride ${rideId}.`);
        return { success: true };
    } catch (error: any) {
        logger.error(`[acceptRideV2] Error for driver ${driverId} and ride ${rideId}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'No se pudo aceptar el viaje.');
    }
});


export const scheduledRideWorker = onSchedule({schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires"}, async (event) => {
    logger.log("Running Scheduled Ride Worker to handle expirations.");
    const now = admin.firestore.Timestamp.now();
    
    // 1. Expire old pending offers
    const expiredOffersQuery = db.collection('rideOffers')
        .where('status', '==', 'pending')
        .where('expiresAt', '<=', now)
        .limit(100);
    
    const expiredOffersSnap = await expiredOffersQuery.get();
    if (!expiredOffersSnap.empty) {
        logger.info(`[Worker] Found ${expiredOffersSnap.size} expired offers to process.`);
        const batch = db.batch();
        expiredOffersSnap.forEach(doc => {
            batch.update(doc.ref, { status: 'expired', finalizedAt: now });
        });
        await batch.commit();
        logger.info(`[Worker] Processed ${expiredOffersSnap.size} expired offers.`);
    }

    // 2. Handle global ride expiration for rides that were never accepted
    const expirationQuery = db.collection('rides')
        .where('status', '==', 'searching')
        .where('matchingExpiresAt', '<', now)
        .limit(50);
    
    const expiredRidesSnap = await expirationQuery.get();
    if (!expiredRidesSnap.empty) {
        const batch = db.batch();
        expiredRidesSnap.forEach(doc => {
            logger.warn(`[Worker] Ride ${doc.id} has globally expired while searching. Terminating.`);
            batch.update(doc.ref, {
                status: 'cancelled',
                cancelledBy: 'system',
                cancelReason: 'No drivers accepted the ride in time.',
                updatedAt: now
            });
        });
        await batch.commit();
        logger.info(`[Worker] Cleaned up ${expiredRidesSnap.size} expired rides.`);
    }
});

export * from './handlers';

    