"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRideSummaryPreviewV1 = exports.togglePauseV1 = exports.scheduledMonthlyResetV1 = exports.scheduledWeeklyResetV1 = exports.onRideCreatedV1 = exports.expireRideOfferTaskV1 = exports.onRideOfferUpdatedV1 = exports.scheduledRideWorker = exports.acceptRideV2 = exports.ignoreRideV1 = exports.createRideV1 = void 0;
exports.findNextDriverAndCreateOffer = findNextDriverAndCreateOffer;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const tasks_1 = require("firebase-functions/v2/tasks");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const geofire = __importStar(require("geofire-common"));
const firebaseAdmin_1 = require("./lib/firebaseAdmin");
const city_1 = require("./lib/city");
const eligibility_1 = require("./eligibility");
const pricing_1 = require("./lib/pricing");
const OFFER_DURATION_SECONDS = 20;
const MAX_MATCHING_ATTEMPTS = 10;
const MAX_BROADCAST_DRIVERS = 5;
function normalizeCityKey(input) {
    if (!input)
        return null;
    return input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}
async function isRawsonBroadcastEnabled(db) {
    try {
        const snap = await db.doc("config/matching").get();
        return snap.exists && snap.data()?.rawsonBroadcastEnabled === true;
    }
    catch (err) {
        console.error("MATCHING_CONFIG_READ_ERROR", err);
        return false;
    }
}
async function hasPendingOffersInRound(db, rideId, round) {
    const snap = await db
        .collection("rideOffers")
        .where("rideId", "==", rideId)
        .where("round", "==", round)
        .where("status", "==", "pending")
        .limit(1)
        .get();
    return !snap.empty;
}
/**
 * [VamO PRO] Emergency Switch Helper
 */
async function getSystemConfig() {
    const db = (0, firebaseAdmin_1.getDb)();
    const snap = await db.doc('config/system').get();
    if (!snap.exists) {
        return { matchingEnabled: true, expressEnabled: true, globalMaintenance: false };
    }
    return snap.data();
}
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
/**
 * [VamO PRO] Centralized radius logic for progressive matching.
 * @param attempt 1-indexed attempt number
 */
function getMatchingRadiusByAttempt(attempt) {
    if (attempt <= 1)
        return 1500;
    if (attempt === 2)
        return 3000;
    if (attempt === 3)
        return 5000;
    return 10000;
}
async function findNextDriverAndCreateOffer(rideId) {
    logger.info(`[MATCH_DEBUG] START (GEOHASH_V1) for ride ${rideId}`);
    const db = (0, firebaseAdmin_1.getDb)();
    const rideRef = db.doc(`rides/${rideId}`);
    logger.info(`[MATCH_DEBUG] START matching for ride: ${rideId}`);
    try {
        const rideSnap = await rideRef.get();
        if (!rideSnap.exists)
            return;
        const rideData = rideSnap.data();
        if (rideData.status !== 'searching') {
            logger.info(`[MATCH_DEBUG] Ride ${rideId} is not in 'searching' status. Current: ${rideData.status}`);
            return;
        }
        const systemConfig = await getSystemConfig();
        if (!systemConfig.matchingEnabled) {
            logger.warn(`[MATCH_DEBUG] Matching system is DISABLED globally. Stopping search.`);
            return;
        }
        const cityKey = normalizeCityKey(rideData.city || rideData.origin?.city || rideData.destination?.city || "");
        const isRawsonBroadcast = (await isRawsonBroadcastEnabled(db)) || cityKey === "rawson";
        if (isRawsonBroadcast) {
            const hasPending = await hasPendingOffersInRound(db, rideId, (rideData.matchingAttempts || 0) + 1);
            if (hasPending) {
                logger.info(`[MATCH_DEBUG] Rawson Broadcast: Ongoing pending round for ride ${rideId}. Skipping.`);
                return;
            }
        }
        const center = [rideData.origin.lat, rideData.origin.lng];
        // Progressive radii based on matching attempts
        const currentAttempts = (rideData.matchingAttempts || 0);
        const radiusInM = getMatchingRadiusByAttempt(currentAttempts + 1);
        const bounds = geofire.geohashQueryBounds(center, radiusInM);
        logger.info(`[MATCH_DEBUG] Geohash query: attempt=${currentAttempts + 1}, center=[${center}], radius=${radiusInM}m, boundsCount=${bounds.length}`);
        const promises = bounds.map(b => {
            return db.collection('drivers_locations')
                .where('geohash', '>=', b[0])
                .where('geohash', '<=', b[1])
                .get();
        });
        const snapshots = await Promise.all(promises);
        const geoCandidates = [];
        snapshots.forEach((snap, index) => {
            snap.forEach(doc => {
                const data = doc.data();
                if (!data.currentLocation)
                    return;
                const distanceKm = geofire.distanceBetween([data.currentLocation.lat, data.currentLocation.lng], center);
                if (distanceKm <= radiusInM / 1000) {
                    if (data.driverStatus === 'online' && data.approved === true && data.isSuspended === false) {
                        geoCandidates.push({ id: doc.id, distanceKm });
                    }
                    else {
                        logger.info(`[MATCH_DEBUG] Candidate ${doc.id} discarded (initial pass). Status: ${data.driverStatus}, Approved: ${data.approved}, Suspended: ${data.isSuspended}`);
                    }
                }
            });
        });
        logger.info(`[MATCH_DEBUG] First pass complete. geoCandidates found: ${geoCandidates.length}`);
        if (geoCandidates.length === 0) {
            const currentAttempts = (rideData.matchingAttempts || 0) + 1;
            logger.warn(`[MATCH_DEBUG] NO candidates found within radius. Attempt: ${currentAttempts}`);
            if (currentAttempts >= MAX_MATCHING_ATTEMPTS) {
                logger.error(`[MATCH_DEBUG] Max attempts reached (${MAX_MATCHING_ATTEMPTS}). Cancelling ride ${rideId}.`);
                await rideRef.update({
                    status: 'cancelled',
                    cancelledBy: 'system',
                    cancelReason: 'NO_DRIVERS_NEARBY',
                    matchingAttempts: currentAttempts,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp()
                });
                if (rideData.passengerId) {
                    await db.doc(`users/${rideData.passengerId}`).update({ activeRideId: null });
                }
            }
            else {
                await rideRef.update({
                    matchingAttempts: currentAttempts,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            return;
        }
        geoCandidates.sort((a, b) => a.distanceKm - b.distanceKm);
        const topCandidates = geoCandidates.slice(0, 10);
        const candidateProfiles = await Promise.all(topCandidates.map(async (c) => {
            const userSnap = await db.doc(`users/${c.id}`).get();
            const profile = userSnap.exists ? userSnap.data() : null;
            return { ...c, profile };
        }));
        const finalCandidates = candidateProfiles.filter(c => {
            const p = c.profile;
            if (!p) {
                logger.info(`[MATCH_DEBUG] Driver ${c.id} discarded: Profile not found in /users.`);
                return false;
            }
            if (rideData.notifiedDrivers?.includes(c.id)) {
                logger.info(`[MATCH_DEBUG] Driver ${c.id} discarded: Already notified.`);
                return false;
            }
            if (rideData.operatingAreaId && p.operatingAreaId !== rideData.operatingAreaId) {
                logger.info(`[MATCH_DEBUG] Driver ${c.id} discarded: Operating area mismatch (${p.operatingAreaId} vs ${rideData.operatingAreaId}).`);
                return false;
            }
            if (rideData.preferredDriverGender && p.gender && p.gender !== rideData.preferredDriverGender) {
                logger.info(`[MATCH_DEBUG] Driver ${c.id} discarded: Gender mismatch.`);
                return false;
            }
            const service = rideData.serviceType;
            const hasService = p.servicesOffered?.[service];
            const isNormalFallback = service === 'normal' && p.servicesOffered?.premium;
            if (!hasService && !isNormalFallback) {
                logger.info(`[MATCH_DEBUG] Driver ${c.id} discarded: Service mismatch. Requested: ${service}, Offered: ${JSON.stringify(p.servicesOffered)}`);
                return false;
            }
            return true;
        });
        logger.info(`[MATCH_DEBUG] Profile filtering complete. finalCandidates: ${finalCandidates.length}`);
        if (finalCandidates.length === 0) {
            logger.warn(`[MATCH_DEBUG] NO candidates left after profile filtering. Incrementing matchingAttempts.`);
            await rideRef.update({ matchingAttempts: admin.firestore.FieldValue.increment(1) });
            return;
        }
        finalCandidates.sort((a, b) => {
            const pA = a.profile;
            const pB = b.profile;
            if (a.distanceKm !== b.distanceKm)
                return a.distanceKm - b.distanceKm;
            if ((pB.acceptanceRate || 0) !== (pA.acceptanceRate || 0))
                return (pB.acceptanceRate || 0) - (pA.acceptanceRate || 0);
            const levelValues = { oro: 3, plata: 2, bronce: 1 };
            const lvlA = levelValues[(pA.driverLevel || 'bronce').toLowerCase()] || 0;
            const lvlB = levelValues[(pB.driverLevel || 'bronce').toLowerCase()] || 0;
            return lvlB - lvlA;
        });
        const round = (rideData.matchingAttempts || 0) + 1;
        const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OFFER_DURATION_SECONDS * 1000);
        if (isRawsonBroadcast) {
            const winners = finalCandidates.slice(0, MAX_BROADCAST_DRIVERS);
            const winnerIds = winners.map(w => w.id);
            logger.info(`[MATCH_DEBUG] Rawson Broadcast branch: choosing ${winners.length} drivers: ${winnerIds.join(',')}`);
            const passengerSnap = await db.doc(`users/${rideData.passengerId}`).get();
            const passengerName = passengerSnap.data()?.name || "Pasajero";
            const batch = db.batch();
            for (const winner of winners) {
                const offerId = `${rideId}_${winner.id}_round_${round}`;
                const offerData = {
                    rideId, driverId: winner.id, passengerId: rideData.passengerId,
                    status: 'pending', sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt, round,
                    origin: rideData.origin, destination: rideData.destination,
                    serviceType: rideData.serviceType, estimatedTotal: rideData.pricing?.estimated?.total ?? 0,
                    passengerName
                };
                batch.set(db.collection('rideOffers').doc(offerId), offerData);
            }
            batch.update(rideRef, {
                currentOfferedDriverId: winnerIds[0],
                matchingExpiresAt: expiresAt,
                matchingAttempts: admin.firestore.FieldValue.increment(1),
                notifiedDrivers: admin.firestore.FieldValue.arrayUnion(...winnerIds),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastOfferCreatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await batch.commit();
            logger.info(`[MATCH_DEBUG] Broadcast round ${round} SUCCESS: ${winners.length} offers created.`);
            for (const winnerId of winnerIds) {
                const offerId = `${rideId}_${winnerId}_round_${round}`;
                (0, firebaseAdmin_1.getFunctions)().taskQueue('expireRideOfferTaskV1').enqueue({ offerId, rideId }, { scheduleDelaySeconds: OFFER_DURATION_SECONDS }).catch(e => logger.error(`Task queue failed for ${offerId}`, e));
            }
        }
        else {
            const winner = finalCandidates[0];
            const nextDriverId = winner.id;
            logger.info(`[MATCH_DEBUG] Sequential WINNER chosen: ${nextDriverId} at distance ${winner.distanceKm.toFixed(2)}km`);
            await db.runTransaction(async (tx) => {
                const currentRideSnap = await tx.get(rideRef);
                if (currentRideSnap.data()?.status !== 'searching')
                    return;
                const passengerSnap = await tx.get(db.doc(`users/${rideData.passengerId}`));
                const passengerName = passengerSnap.data()?.name || "Pasajero";
                const offerId = `${rideId}_${nextDriverId}_round_${round}`;
                const offerData = {
                    rideId, driverId: nextDriverId, passengerId: rideData.passengerId,
                    status: 'pending', sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt, round,
                    origin: rideData.origin, destination: rideData.destination,
                    serviceType: rideData.serviceType, estimatedTotal: rideData.pricing?.estimated?.total ?? 0,
                    passengerName
                };
                tx.set(db.collection('rideOffers').doc(offerId), offerData);
                tx.update(rideRef, {
                    currentOfferedDriverId: nextDriverId,
                    matchingExpiresAt: expiresAt,
                    matchingAttempts: admin.firestore.FieldValue.increment(1),
                    notifiedDrivers: admin.firestore.FieldValue.arrayUnion(nextDriverId),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                logger.info(`[MATCH_DEBUG] Transaction SUCCESS: Offer ${offerId} created.`);
            });
            const offerId = `${rideId}_${nextDriverId}_round_${round}`;
            await (0, firebaseAdmin_1.getFunctions)().taskQueue('expireRideOfferTaskV1').enqueue({ offerId, rideId }, { scheduleDelaySeconds: OFFER_DURATION_SECONDS }).catch(e => logger.error(`Task queue failed`, e));
        }
    }
    catch (e) {
        logger.error(`[MATCH_DEBUG] CRITICAL_ERROR:`, e);
    }
}
exports.createRideV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = (0, firebaseAdmin_1.getDb)();
    const { origin, destination, serviceType, dryRun, promotionId, preferredDriverGender } = request.data;
    const passengerId = request.auth.uid;
    const userRef = db.doc(`users/${passengerId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
        throw new https_1.HttpsError('not-found', 'Perfil de usuario no encontrado.');
    const passengerProfile = userSnap.data();
    const CURRENT_TERMS_V = 'v1.2';
    if (!dryRun && (!passengerProfile.termsAccepted || passengerProfile.termsVersion !== CURRENT_TERMS_V)) {
        throw new https_1.HttpsError('failed-precondition', 'Debes aceptar los Términos y Condiciones actualizados.');
    }
    if (!origin || !destination || !serviceType)
        throw new https_1.HttpsError('invalid-argument', 'Faltan parámetros.');
    const systemConfig = await getSystemConfig();
    if (systemConfig.globalMaintenance)
        throw new https_1.HttpsError('unavailable', 'Sistema en mantenimiento.');
    const distKm = distanceInKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const durationMin = (distKm / 30) * 60;
    const resolvedCity = origin.city || passengerProfile.city || null;
    // Determine city for pricing (origin.city preferred)
    let cityKey;
    if (origin.city) {
        cityKey = (0, city_1.normalizeCity)(origin.city);
        console.log("CITY INITIAL (origin.city):", cityKey);
    }
    else if (passengerProfile.city) {
        cityKey = (0, city_1.normalizeCity)(passengerProfile.city);
        console.log("CITY INITIAL (passengerProfile.city):", cityKey);
    }
    else {
        cityKey = "rawson";
        console.log("CITY INITIAL (fallback):", cityKey);
    }
    let pricingConfig = null;
    // Try city-specific pricing
    const citySnap = await db.doc(`cities/${cityKey}`).get();
    pricingConfig = citySnap.data()?.pricing || null;
    if (pricingConfig) {
        console.log("PRICING SOURCE: city document", cityKey);
    }
    else {
        console.log("PRICING NOT FOUND for city", cityKey, "- falling back to global config");
        const globalPricingSnap = await db.doc('config/pricing').get();
        pricingConfig = globalPricingSnap.data();
        if (pricingConfig) {
            console.log("PRICING SOURCE: global config");
        }
        else {
            console.log("GLOBAL PRICING NOT FOUND - falling back to rawson city pricing");
            const rawsonSnap = await db.doc('cities/rawson').get();
            pricingConfig = rawsonSnap.data()?.pricing || null;
            if (pricingConfig) {
                console.log("PRICING SOURCE: rawson city fallback");
                cityKey = "rawson";
            }
        }
    }
    if (!pricingConfig) {
        console.error("PRICING CONFIGURATION UNAVAILABLE after all fallbacks");
        throw new https_1.HttpsError('failed-precondition', 'La configuración de tarifas no está disponible. Contacte a soporte.');
    }
    let total = 0;
    let breakdown = null;
    try {
        const argentinaHour = parseInt(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(new Date()), 10);
        const isNight = argentinaHour >= 23 || argentinaHour < 6;
        const pricingInput = { distanceKm: distKm, durationMin, waitingSeconds: 0, serviceType, isNight, isUrgent: false };
        const priceResult = (0, pricing_1.calculateRidePrice)(pricingInput, pricingConfig);
        total = priceResult.total;
        breakdown = priceResult.breakdown;
    }
    catch (error) {
        logger.error(`[createRideV1] Error calculating price:`, error);
        throw new https_1.HttpsError('internal', 'Ocurrió un error interno al calcular la tarifa.');
    }
    if (dryRun) {
        return { estimatedTotal: total, breakdown };
    }
    try {
        const result = await db.runTransaction(async (tx) => {
            const passengerSnap = await tx.get(userRef);
            const passengerData = passengerSnap.data();
            const tokenEmailVerified = request.auth?.token?.email_verified === true;
            const eligibility = (0, eligibility_1.canPassengerRequestRide)(passengerData, tokenEmailVerified);
            if (!eligibility.isEligible)
                throw new https_1.HttpsError('failed-precondition', eligibility.reason || 'No eres elegible para solicitar un viaje.');
            if (passengerData.activeRideId) {
                const activeRideSnap = await tx.get(db.doc(`rides/${passengerData.activeRideId}`));
                if (activeRideSnap.exists && !['completed', 'cancelled'].includes(activeRideSnap.data()?.status)) {
                    throw new https_1.HttpsError('failed-precondition', 'Ya tenés un viaje activo.');
                }
            }
            const newRideRef = db.collection('rides').doc();
            // Simplified for brevity, normally would include full discount logic from original index.ts
            const pricingModel = {
                estimated: { total, breakdown, configSnapshot: pricingConfig, calculatedAt: admin.firestore.FieldValue.serverTimestamp() },
                originalTotal: total,
                driverReceivesTotal: total,
                passengerPaysTotal: total,
                compensationAmount: 0
            };
            tx.set(newRideRef, {
                passengerId, origin, destination, serviceType,
                status: 'searching', city: resolvedCity,
                pricing: pricingModel,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                passengerName: passengerData.name || 'Pasajero',
            });
            tx.update(userRef, { activeRideId: newRideRef.id });
            return { rideId: newRideRef.id, resolvedCity };
        });
        findNextDriverAndCreateOffer(result.rideId).catch(e => logger.error(`Proactive matching failed`, e));
        return { success: true, rideId: result.rideId };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', 'No se pudo crear el viaje.');
    }
});
exports.ignoreRideV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = (0, firebaseAdmin_1.getDb)();
    const { rideId } = request.data;
    const driverId = request.auth.uid;
    const offersSnap = await db.collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('driverId', '==', driverId)
        .where('status', '==', 'pending')
        .limit(1).get();
    if (offersSnap.empty)
        return { success: true };
    const offerDoc = offersSnap.docs[0];
    await db.runTransaction(async (tx) => {
        tx.update(offerDoc.ref, { status: 'rejected', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.update(db.doc(`rides/${rideId}`), {
            currentOfferedDriverId: null,
            matchingExpiresAt: null,
            totalIgnores: admin.firestore.FieldValue.increment(1)
        });
    });
    findNextDriverAndCreateOffer(rideId).catch(e => logger.error(`Next match failed`, e));
    return { success: true };
});
exports.acceptRideV2 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = (0, firebaseAdmin_1.getDb)();
    const { rideId } = request.data;
    const driverId = request.auth.uid;
    const offersSnap = await db.collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('driverId', '==', driverId)
        .where('status', '==', 'pending')
        .limit(1).get();
    if (offersSnap.empty)
        throw new https_1.HttpsError('not-found', 'Oferta no encontrada o ya no está disponible.');
    const offerDoc = offersSnap.docs[0];
    try {
        await db.runTransaction(async (tx) => {
            const driverSnap = await tx.get(db.doc(`users/${driverId}`));
            const rideSnap = await tx.get(db.doc(`rides/${rideId}`));
            const offerSnap = await tx.get(offerDoc.ref);
            if (!offerSnap.exists || offerSnap.data()?.status !== 'pending') {
                logger.warn(`[MATCH_DEBUG] Offer ${offerDoc.id} is no longer pending.`);
                throw new https_1.HttpsError('failed-precondition', 'La oferta ya no está disponible.');
            }
            const ride = rideSnap.data();
            if (ride.status !== 'searching') {
                logger.warn(`[MATCH_DEBUG] Ride ${rideId} already assigned or cancelled. Status: ${ride.status}`);
                throw new https_1.HttpsError('failed-precondition', 'El viaje ya no está disponible para asignación.');
            }
            logger.info(`[MATCH_DEBUG] accepted winner: ${driverId} for ride ${rideId}`);
            tx.update(db.doc(`rides/${rideId}`), {
                status: 'driver_assigned',
                driverId: driverId,
                driverName: driverSnap.data()?.name || 'Conductor',
                driverRating: driverSnap.data()?.rating || 5.0,
                driverVehicle: driverSnap.data()?.vehicleModel || driverSnap.data()?.vehicleBrand || 'Vehículo',
                driverPlate: driverSnap.data()?.plateNumber || 'N/A',
                driverVehiclePhoto: driverSnap.data()?.vehicleFrontPhotoURL || null,
                driverPhotoUrl: driverSnap.data()?.photoURL || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            tx.update(db.doc(`users/${driverId}`), { activeRideId: rideId, driverStatus: 'in_ride' });
            tx.update(db.doc(`drivers_locations/${driverId}`), { driverStatus: 'in_ride' });
            tx.update(offerDoc.ref, {
                status: 'accepted',
                finalizedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        // Cleanup other pending offers for this ride
        const otherOffersSnap = await db.collection('rideOffers')
            .where('rideId', '==', rideId)
            .where('status', '==', 'pending')
            .get();
        if (!otherOffersSnap.empty) {
            const batch = db.batch();
            let count = 0;
            otherOffersSnap.forEach(doc => {
                if (doc.id !== offerDoc.id) {
                    batch.update(doc.ref, {
                        status: 'expired',
                        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
                        reason: 'ALREADY_ASSIGNED'
                    });
                    count++;
                }
            });
            if (count > 0) {
                await batch.commit();
                logger.info(`[MATCH_DEBUG] cleanup of sibling offers: ${count} offers expired for ride ${rideId}`);
            }
        }
        return { success: true };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        logger.error(`[MATCH_DEBUG] acceptRideV2 CRITICAL_ERROR:`, error);
        throw new https_1.HttpsError('internal', 'No se pudo aceptar el viaje.');
    }
});
exports.scheduledRideWorker = (0, scheduler_1.onSchedule)({ schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires" }, async (event) => {
    const db = (0, firebaseAdmin_1.getDb)();
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('rides').where('status', '==', 'searching').get();
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.currentOfferedDriverId && data.matchingExpiresAt && data.matchingExpiresAt > now)
            continue;
        findNextDriverAndCreateOffer(doc.id).catch(e => logger.error(`Worker matching failed`, e));
    }
});
exports.onRideOfferUpdatedV1 = (0, firestore_1.onDocumentUpdated)({ document: 'rideOffers/{offerId}', region: 'us-central1' }, async (event) => {
    const afterData = event.data?.after.data();
    if (!afterData || afterData.status === 'pending')
        return;
    if (afterData.status === 'rejected' || afterData.status === 'expired') {
        findNextDriverAndCreateOffer(afterData.rideId).catch(e => logger.error(`Triggered matching failed`, e));
    }
});
exports.expireRideOfferTaskV1 = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3 },
    rateLimits: { maxConcurrentDispatches: 100 }
}, async (request) => {
    const { offerId } = request.data;
    if (!offerId)
        return;
    const db = (0, firebaseAdmin_1.getDb)();
    const offerRef = db.doc(`rideOffers/${offerId}`);
    const snap = await offerRef.get();
    if (snap.exists && snap.data()?.status === 'pending') {
        await offerRef.update({ status: 'expired', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
});
/**
 * [VamO PRO] Robust Matching Initialization
 */
exports.onRideCreatedV1 = (0, firestore_1.onDocumentCreated)({ document: "rides/{rideId}", region: 'us-central1' }, async (event) => {
    const rideId = event.params.rideId;
    logger.info(`[Matching] Triggered for rideId: ${rideId}. Backup check.`);
    // scheduledRideWorker or proactive matching usually handles this, but we keep the trigger for robustness.
    await findNextDriverAndCreateOffer(rideId);
});
/**
 * [VamO PRO] Weekly Rewards & Points Reset
 */
exports.scheduledWeeklyResetV1 = (0, scheduler_1.onSchedule)({
    schedule: "every monday 00:00",
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    memory: "512MiB"
}, async (event) => {
    const db = (0, firebaseAdmin_1.getDb)();
    const rewardsConfigRef = db.doc('rewards/rewards');
    const rewardsSnap = await rewardsConfigRef.get();
    const config = rewardsSnap.data() || { weeklyPoolAmount: 0, minPointsToQualify: 20 };
    const minPoints = config.minPointsToQualify;
    const pointsRef = db.collection('driver_points');
    const qualifiedSnap = await pointsRef.where('weeklyPoints', '>=', minPoints).get();
    if (qualifiedSnap.size > 0) {
        const poolPerDriver = Math.floor(config.weeklyPoolAmount / qualifiedSnap.size);
        qualifiedSnap.forEach(doc => {
            logger.info(`🏆 Driver ${doc.id} qualified. Share: $${poolPerDriver}`);
        });
    }
    const allPointsSnap = await pointsRef.where('weeklyPoints', '>', 0).get();
    const usersRef = db.collection('users');
    for (let i = 0; i < allPointsSnap.size; i += 400) {
        const batch = db.batch();
        const chunk = allPointsSnap.docs.slice(i, i + 400);
        chunk.forEach(docSnap => {
            batch.update(docSnap.ref, { weeklyPoints: 0, lastResetAt: admin.firestore.FieldValue.serverTimestamp() });
            batch.update(usersRef.doc(docSnap.id), { weeklyPoints: 0, driverLevel: 'bronce', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        await batch.commit();
    }
});
/**
 * [VamO PRO] Monthly Passenger Reset
 */
exports.scheduledMonthlyResetV1 = (0, scheduler_1.onSchedule)({
    schedule: "0 0 1 * *",
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    memory: "256MiB",
}, async (event) => {
    const db = (0, firebaseAdmin_1.getDb)();
    const argTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const newMonth = `${argTime.getFullYear()}-${(argTime.getMonth() + 1).toString().padStart(2, '0')}`;
    const passengersSnap = await db.collection('users').where('role', '==', 'passenger').get();
    const batch = db.batch();
    passengersSnap.forEach(doc => {
        batch.update(doc.ref, {
            'passengerProgress.monthlyRides': 0,
            'passengerProgress.currentMonth': newMonth,
            'updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    await batch.commit();
});
/**
 * [VamO PRO] Toggle Pause/Resume Ride Status
 */
exports.togglePauseV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = (0, firebaseAdmin_1.getDb)();
    const { rideId, action } = request.data;
    const driverId = request.auth.uid;
    if (!rideId || !['pause', 'resume'].includes(action)) {
        throw new https_1.HttpsError('invalid-argument', 'Parámetros inválidos.');
    }
    const rideRef = db.doc(`rides/${rideId}`);
    await db.runTransaction(async (tx) => {
        const rideSnap = await tx.get(rideRef);
        if (!rideSnap.exists)
            throw new https_1.HttpsError('not-found', 'Viaje no encontrado');
        const ride = rideSnap.data();
        if (ride.driverId !== driverId)
            throw new https_1.HttpsError('permission-denied', 'No eres el conductor.');
        if (action === 'pause') {
            if (ride.status !== 'in_progress')
                throw new https_1.HttpsError('failed-precondition', 'El viaje no está en curso.');
            tx.update(rideRef, {
                status: 'paused',
                pauseStartedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        else {
            if (ride.status !== 'paused')
                throw new https_1.HttpsError('failed-precondition', 'El viaje no está pausado.');
            // Calculate wait diff if necessary (done in frontend but saved here for record)
            const pauseStart = ride.pauseStartedAt?.toMillis();
            let addedWait = 0;
            if (pauseStart) {
                const now = Date.now();
                addedWait = Math.floor((now - pauseStart) / 1000);
            }
            tx.update(rideRef, {
                status: 'in_progress',
                pauseStartedAt: null,
                cumulativeWaitSeconds: admin.firestore.FieldValue.increment(addedWait),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    return { success: true };
});
/**
 * [VamO PRO] Get Ride Summary Preview before final checkout
 */
exports.getRideSummaryPreviewV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = (0, firebaseAdmin_1.getDb)();
    const { rideId } = request.data;
    const driverId = request.auth.uid;
    if (!rideId)
        throw new https_1.HttpsError('invalid-argument', 'Falta rideId');
    const rideRef = db.doc(`rides/${rideId}`);
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists)
        throw new https_1.HttpsError('not-found', 'Viaje no encontrado');
    const ride = rideSnap.data();
    if (ride.driverId !== driverId)
        throw new https_1.HttpsError('permission-denied', 'No autorizado');
    // Retrieve distance and original config
    let finalDistanceKm = (ride.pricing?.estimatedDistanceMeters || 0) / 1000;
    const originalSnapshot = ride.pricing?.estimated?.configSnapshot;
    let pricingConfig = originalSnapshot;
    if (!pricingConfig) {
        // Fallback to global config if snapshot is missing
        const globalSnap = await db.doc('config/pricing').get();
        pricingConfig = globalSnap.data();
    }
    if (!pricingConfig)
        throw new https_1.HttpsError('failed-precondition', 'Configuración de tarifa no disponible');
    // Time calculations
    const startedAt = ride.startedAt?.toMillis?.();
    const now = Date.now();
    let currentDurationSeconds = 0;
    if (startedAt) {
        currentDurationSeconds = Math.floor((now - startedAt) / 1000);
    }
    let totalWaitSeconds = ride.cumulativeWaitSeconds || 0;
    if (ride.status === 'paused' && ride.currentPauseStart?.toMillis) {
        const pauseStart = ride.currentPauseStart.toMillis();
        totalWaitSeconds += Math.floor((now - pauseStart) / 1000);
    }
    const durationMin = Math.ceil(currentDurationSeconds / 60);
    // Re-run pricing algorithm
    const argentinaHour = parseInt(new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: 'numeric',
        hour12: false
    }).format(new Date()), 10);
    const isNight = argentinaHour >= 23 || argentinaHour < 6;
    const pricingInput = {
        distanceKm: finalDistanceKm,
        durationMin,
        waitingSeconds: totalWaitSeconds,
        serviceType: ride.serviceType,
        isNight,
        isUrgent: ride.isUrgent || false
    };
    const priceResult = (0, pricing_1.calculateRidePrice)(pricingInput, pricingConfig);
    return {
        success: true,
        summary: {
            distanceMeters: Math.round(finalDistanceKm * 1000),
            durationSeconds: currentDurationSeconds,
            waitingSeconds: totalWaitSeconds,
            totalFare: priceResult.total,
            breakdown: priceResult.breakdown
        }
    };
});
//# sourceMappingURL=rides.js.map