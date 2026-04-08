"use strict";
'use server';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledRideWorker = exports.ignoreRideV1 = exports.createRideV1 = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const eligibility_1 = require("./eligibility");
admin.initializeApp();
const db = admin.firestore();
const OFFER_DURATION_SECONDS = 60;
const MAX_DISTANCE_KM = 3; // Production value
function distanceInKm(lat1, lng1, lat2, lng2) {
    if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined)
        return Infinity;
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
async function findNextDriverAndCreateOffer(rideId) {
    const rideRef = db.doc(`rides/${rideId}`);
    try {
        await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists)
                throw new Error("Ride document not found.");
            const rideData = rideSnap.data();
            if (rideData.status !== 'searching')
                return;
            const notifiedDrivers = rideData.notifiedDrivers || [];
            const driversQuery = db.collection('users').where('driverStatus', '==', 'online').where('approved', '==', true).where('isSuspended', '==', false);
            const driversSnap = await tx.get(driversQuery);
            const candidatesPromises = driversSnap.docs
                .filter(doc => !notifiedDrivers.includes(doc.id))
                .map(async (driverDoc) => {
                const driverProfile = driverDoc.data();
                if (!(0, eligibility_1.canDriverTakeRide)(driverProfile, rideData.serviceType))
                    return null;
                const locSnap = await tx.get(db.doc(`drivers_locations/${driverDoc.id}`));
                const locData = locSnap.data();
                if (locData?.currentLocation?.lat === undefined || locData?.currentLocation?.lng === undefined)
                    return null;
                const distanceKm = distanceInKm(rideData.origin.lat, rideData.origin.lng, locData.currentLocation.lat, locData.currentLocation.lng);
                if (distanceKm > MAX_DISTANCE_KM)
                    return null;
                const rating = driverProfile.averageRating ?? 4.5;
                const score = (rating * 100) - (distanceKm * 20);
                return {
                    driverId: driverDoc.id,
                    distanceKm,
                    rating,
                    score,
                };
            });
            const resolvedCandidates = (await Promise.all(candidatesPromises)).filter((c) => c !== null);
            if (resolvedCandidates.length === 0) {
                logger.warn(`No more eligible drivers for ride ${rideId}. Cancelling.`);
                tx.update(rideRef, { status: "cancelled", cancelReason: "no_drivers_available", currentOfferedDriverId: null, matchingExpiresAt: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                return;
            }
            resolvedCandidates.sort((a, b) => {
                if (b.score !== a.score)
                    return b.score - a.score;
                return a.distanceKm - b.distanceKm;
            });
            const bestCandidate = resolvedCandidates[0];
            const nextDriverId = bestCandidate.driverId;
            const passengerSnap = await tx.get(db.doc(`users/${rideData.passengerId}`));
            const passengerName = passengerSnap.data()?.name || "Pasajero";
            const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OFFER_DURATION_SECONDS * 1000);
            const offerId = `${rideId}_${nextDriverId}`;
            const newOfferRef = db.collection('rideOffers').doc(offerId);
            const offerData = {
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
    }
    catch (e) {
        logger.error(`[findNextDriver] Transaction failed for ride ${rideId}: `, e);
    }
}
exports.createRideV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesi├│n.');
    const { origin, destination, serviceType, dryRun } = request.data;
    if (!origin || !destination || !serviceType)
        throw new https_1.HttpsError('invalid-argument', 'Faltan par├ímetros.');
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
            if (!passengerSnap.exists)
                throw new https_1.HttpsError('not-found', 'Tu perfil de usuario no fue encontrado.');
            const passengerData = passengerSnap.data();
            if (passengerData.activeRideId) {
                const activeRideSnap = await tx.get(db.doc(`rides/${passengerData.activeRideId}`));
                if (activeRideSnap.exists && !['completed', 'cancelled'].includes(activeRideSnap.data()?.status)) {
                    throw new https_1.HttpsError('failed-precondition', 'Ya ten├®s un viaje activo.');
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
    }
    catch (error) {
        logger.error(`[createRideV1] Transaction failed for passenger ${passengerId}`, error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', 'No se pudo crear el viaje.');
    }
});
exports.ignoreRideV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesi├│n.');
    const { rideId } = request.data;
    if (!rideId)
        throw new https_1.HttpsError('invalid-argument', 'Falta el ID del viaje.');
    const driverId = request.auth.uid;
    const rideRef = db.doc(`rides/${rideId}`);
    const offerId = `${rideId}_${driverId}`;
    const offerRef = db.collection('rideOffers').doc(offerId);
    try {
        await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists)
                return; // Ride already gone
            const rideData = rideSnap.data();
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
    }
    catch (error) {
        logger.error(`[ignoreRideV1] Error for driver ${driverId} on ride ${rideId}:`, error);
        throw new https_1.HttpsError('internal', 'No se pudo rechazar el viaje.');
    }
});
exports.scheduledRideWorker = (0, scheduler_1.onSchedule)({ schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires" }, async (event) => {
    const now = admin.firestore.Timestamp.now();
    // Query for rides where the offer has expired OR where we are in a searching state without an active offer
    const newRidesQuery = db.collection('rides').where('status', '==', 'searching').where('currentOfferedDriverId', '==', null);
    const expiredRidesQuery = db.collection('rides').where('status', '==', 'searching').where('matchingExpiresAt', '<=', now);
    const [newRidesSnap, expiredRidesSnap] = await Promise.all([newRidesQuery.get(), expiredRidesQuery.get()]);
    const ridesToProcess = new Map();
    newRidesSnap.forEach(doc => ridesToProcess.set(doc.id, doc.data()));
    expiredRidesSnap.forEach(doc => ridesToProcess.set(doc.id, doc.data()));
    for (const [rideId, rideData] of ridesToProcess) {
        if (rideData.status !== 'searching')
            continue;
        // If there was an offer, it has now expired. Mark it as such.
        if (rideData.currentOfferedDriverId) {
            const offerId = `${rideId}_${rideData.currentOfferedDriverId}`;
            await db.collection('rideOffers').doc(offerId).update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => { });
        }
        // Find the next driver. This handles both expired offers and brand-new rides.
        await findNextDriverAndCreateOffer(rideId);
    }
});
__exportStar(require("./handlers"), exports);
//# sourceMappingURL=index_old_utf8.js.map