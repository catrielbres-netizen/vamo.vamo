
'use server';
import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import * as crypto from "crypto";
import { onDocumentUpdated, onDocumentCreated, FirestoreEvent, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { canDriverTakeRide } from "./eligibility";
import { UserProfile, Ride, DriverLevel, ServiceType, RideStatus, CompletedRide, PricingConfig, WithdrawalRequest, WithId } from "./types";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();


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
        // Ensure complex data is stringified for transport.
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
            data: {
              title,
              body,
              link,
              ...processedData
            },
        };
        
        try {
            await admin.messaging().send(message);
            logger.info(`Successfully sent data-only notification to user ${userId}.`);
        } catch (error: any) {
            logger.error(`Error sending notification to ${userId}:`, error);
            // Clean up stale token if the error indicates it's invalid
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
    const R = 6371000; // Earth radius in meters

    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- PRICING & FARE CALCULATION HELPERS ---
function calculateFareV2({ distanceMeters, service, isNight = false }: { distanceMeters: number; service: ServiceType; isNight?: boolean; }) {
  const DAY_BASE_FARE = 1400;
  const DAY_PRICE_PER_100M = 152;
  const NIGHT_BASE_FARE = 1652;
  const NIGHT_PRICE_PER_100M = 189;

  const baseFare = isNight ? NIGHT_BASE_FARE : DAY_PRICE_PER_100M;
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

    // --- FARE CALCULATION ---
    const distanceMeters = haversineDistance(origin, destination);
    const estimatedTotal = calculateFareV2({ distanceMeters, service: serviceType });
    const estimatedDurationSeconds = distanceMeters / 8.33; // Approx 30km/h
    
    // --- DRY RUN FOR PRICE ESTIMATION ---
    if(dryRun) {
        return { estimatedTotal, estimatedDistanceMeters: distanceMeters };
    }

    // --- FULL RIDE CREATION ---
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
                city: passengerData.city || 'Rawson', // Default city
                country: passengerData.country || 'AR',
                pricing: {
                    estimatedTotal,
                    estimatedDistanceMeters: distanceMeters,
                    estimatedDurationSeconds,
                    surgeMultiplier: 1.0,
                    discountAmount: 0,
                },
                status: 'searching' as RideStatus,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                pricingVersion: 'v2',
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
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'No se pudo crear el viaje.');
    }
});

// --- MATCHING ENGINE (SIMPLIFIED) ---
export const matchingEngineV1 = onDocumentCreated("rides/{rideId}", async (event) => {
    const rideId = event.params.rideId;
    logger.info(`[MatchingEngine] Ride ${rideId} created and is now available to all drivers.`);
});

export const scheduledRideWorker = onSchedule({schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires"}, async (event) => {
    logger.log("Running Scheduled Ride Worker to handle expirations.");
    const now = admin.firestore.Timestamp.now();
    
    // The only job of this worker is to clean up rides that were never accepted.
    const expirationQuery = db.collection('rides')
        .where('status', '==', 'searching')
        .where('matchingExpiresAt', '<', now)
        .limit(50);
    
    const expiredRidesSnap = await expirationQuery.get();
    if (!expiredRidesSnap.empty) {
        const batch = db.batch();
        expiredRidesSnap.forEach(doc => {
            logger.warn(`[Worker] Ride ${doc.id} has expired while searching. Terminating.`);
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


export const acceptRideV2 = onCall({cors: true, region: 'us-central1'}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { rideId } = request.data;
    if (!rideId) {
        throw new HttpsError('invalid-argument', 'Falta el ID del viaje.');
    }

    const driverId = request.auth.uid;
    
    const rideRef = db.doc(`rides/${rideId}`);
    const driverRef = db.doc(`users/${driverId}`);
    const driverLocationRef = db.doc(`drivers_locations/${driverId}`);

    try {
        await db.runTransaction(async (transaction) => {
            const driverSnap = await transaction.get(driverRef);
            const rideSnap = await transaction.get(rideRef);

            if (!driverSnap.exists) {
                throw new HttpsError('not-found', 'No se encontró tu perfil de conductor.');
            }
            if (!rideSnap.exists) {
                throw new HttpsError('not-found', 'Este viaje ya no existe.');
            }
            
            const driverData = driverSnap.data() as UserProfile;
            const rideData = rideSnap.data() as Ride;

            // --- PRODUCTION-GRADE VALIDATION LOGIC ---
            if (!canDriverTakeRide(driverData, rideData.serviceType)) {
                 throw new HttpsError('failed-precondition', 'No estás habilitado para este tipo de viaje.');
            }
            if (rideData.status !== 'searching' || rideData.driverId) {
                throw new HttpsError('failed-precondition', 'Este viaje ya fue tomado por otro conductor.');
            }
            // --- END VALIDATION ---

            const driverLocation = (await transaction.get(driverLocationRef)).data()?.currentLocation;

            const rideUpdatePayload: { [key: string]: any } = {
                status: 'driver_assigned',
                driverId: driverId,
                driverName: driverData.name || 'Conductor',
                driverRating: driverData.averageRating ?? 5,
                driverLocationAtAccept: {
                    ...(driverLocation || { lat: 0, lng: 0 }),
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                },
                driverAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (driverData.vehicleModel && driverData.carModelYear) {
                rideUpdatePayload.driverVehicle = `${driverData.vehicleModel} (${driverData.carModelYear})`;
            } else if (driverData.vehicleModel) {
                rideUpdatePayload.driverVehicle = driverData.vehicleModel;
            }

            if (driverData.plateNumber) {
                rideUpdatePayload.driverPlate = driverData.plateNumber;
            }

            transaction.update(rideRef, rideUpdatePayload);

            transaction.update(driverRef, {
                activeRideId: rideId,
                driverStatus: 'in_ride',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.update(driverLocationRef, {
                driverStatus: 'in_ride',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        
        return { success: true };
    } catch (error: any) {
        logger.error(`[acceptRideV2] Error for driver ${driverId} and ride ${rideId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'No se pudo aceptar el viaje.');
    }
});


// --- Other Functions (unchanged) ---

export {
    createPaymentPreferenceV4,
    onRideSettlementV6,
    mercadoPagoWebhookV4,
    distributeWeeklyPoolV5,
    cleanupStaleDrivers,
    notifyOnRideUpdateV3,
    onRideCancelledV3,
    onOfferFinalized,
    cancelRideV1,
    driverArrivedV1,
    startRideV1,
    finishRideV1,
    submitRideRatingV1,
    approveDriverByAdminV1,
    rejectDriverByAdminV1,
    suspendDriverByAdminV1,
    adjustDriverBalanceByAdminV1,
    sendDriverNotificationByAdminV1,
    deleteDriverByAdminV1,
    requestWithdrawalV1,
    processWithdrawalByAdminV1
} from './handlers';
