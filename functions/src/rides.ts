import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";
import * as geofire from "geofire-common";
import { getDb, getFunctions } from "./lib/firebaseAdmin";
import { normalizeCity } from "./lib/city";
import { resolvePricingMunicipality } from "./lib/territoryResolver";
import { canDriverReceiveOffers, canPassengerRequestRide } from "./eligibility";
import { calculateRidePrice, PricingInput } from "./lib/pricing";
import { calculateExpressDiscount } from "./lib/express";
import { checkPromotionEligibility } from "./promotions";
import { ensureServiceInvariants, sendNotification } from "./handlers";
import {
    UserProfile, Ride, RideOffer, ServiceType, ExpressConfig,
    ExpressBudget, SystemConfig, Promotion, Place, PricingConfig,
    CityConfig, Referral, UserReward
} from "./types";

const OFFER_DURATION_SECONDS = 20;
const MAX_MATCHING_ATTEMPTS = 10;
const MAX_BROADCAST_DRIVERS = 5;

function normalizeCityKey(input?: string | null): string | null {
    if (!input) return null;
    return input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

async function isRawsonBroadcastEnabled(
    db: FirebaseFirestore.Firestore
): Promise<boolean> {
    try {
        const snap = await db.doc("config/matching").get();
        return snap.exists && snap.data()?.rawsonBroadcastEnabled === true;
    } catch (err) {
        console.error("MATCHING_CONFIG_READ_ERROR", err);
        return false;
    }
}

async function hasPendingOffersInRound(
    db: FirebaseFirestore.Firestore,
    rideId: string,
    round: number
): Promise<boolean> {
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
async function getSystemConfig(): Promise<SystemConfig> {
    const db = getDb();
    const snap = await db.doc('config/system').get();
    if (!snap.exists) {
        return { matchingEnabled: true, expressEnabled: true, globalMaintenance: false };
    }
    return snap.data() as SystemConfig;
}

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

/**
 * [VamO PRO] Centralized radius logic for progressive matching.
 * @param attempt 1-indexed attempt number
 */
function getMatchingRadiusByAttempt(attempt: number): number {
    if (attempt <= 1) return 1500;
    if (attempt === 2) return 3000;
    if (attempt === 3) return 5000;
    return 10000;
}

export async function findNextDriverAndCreateOffer(rideId: string) {
    logger.info(`[MATCH_DEBUG] START (GEOHASH_V1) for ride ${rideId}`);
    const db = getDb();
    const rideRef = db.doc(`rides/${rideId}`);
    logger.info(`[MATCH_DEBUG] START matching for ride: ${rideId}`);

    try {
        const rideSnap = await rideRef.get();
        if (!rideSnap.exists) return;
        const rideData = rideSnap.data() as Ride;

        if (rideData.status !== 'searching') {
            logger.info(`[MATCH_DEBUG] Ride ${rideId} is not in 'searching' status. Current: ${rideData.status}`);
            return;
        }

        const systemConfig = await getSystemConfig();
        if (!systemConfig.matchingEnabled) {
            logger.warn(`[MATCH_DEBUG] Matching system is DISABLED globally. Stopping search.`);
            return;
        }

        const { pricingMunicipalityKey, method } = resolvePricingMunicipality({
          cityKey: rideData.cityKey,
          city: rideData.city,
          lat: rideData.origin?.lat,
          lng: rideData.origin?.lng,
        });
        logger.info(`[MATCH_DEBUG] City resolution method: ${method}`);
        if (!pricingMunicipalityKey) {
            logger.error(`[MATCH_DEBUG] CRITICAL: Ride ${rideId} unable to resolve pricing municipality. Cannot match.`);
            return;
        }

        const isRawsonBroadcast = (await isRawsonBroadcastEnabled(db)) || pricingMunicipalityKey === "rawson";

        if (isRawsonBroadcast) {
            const hasPending = await hasPendingOffersInRound(db, rideId, (rideData.matchingAttempts || 0) + 1);
            if (hasPending) {
                logger.info(`[MATCH_DEBUG] Rawson Broadcast: Ongoing pending round for ride ${rideId}. Skipping.`);
                return;
            }
        }

        const center = [rideData.origin.lat, rideData.origin.lng] as geofire.Geopoint; // origin location

        // Progressive radii based on matching attempts
        const currentAttempts = (rideData.matchingAttempts || 0);
        const radiusInM = getMatchingRadiusByAttempt(currentAttempts + 1);

        const bounds = geofire.geohashQueryBounds(center, radiusInM);
        logger.info(`[MATCH_DEBUG] Geohash query: attempt=${currentAttempts + 1}, center=[${center}], radius=${radiusInM}m, boundsCount=${bounds.length}`);

        const snapshots = await Promise.all(bounds.map(b => {
            return db.collection('drivers_locations')
                .where('geohash', '>=', b[0])
                .where('geohash', '<=', b[1])
                .get();
        }));
        const geoCandidates: any[] = [];

        snapshots.forEach((snap, index) => {
            snap.forEach(doc => {
                const data = doc.data();
                if (!data.currentLocation) return;

                // [VamO PRO] Move cityKey isolation to memory to avoid Index requirements
                if (data.cityKey !== pricingMunicipalityKey) {
                    logger.info(`[MATCH_DEBUG] Candidate ${doc.id} discarded: City mismatch (${data.cityKey} vs ${pricingMunicipalityKey})`);
                    return;
                }

                const distanceKm = geofire.distanceBetween([data.currentLocation.lat, data.currentLocation.lng], center);

                if (distanceKm <= radiusInM / 1000) {
                    if (data.driverStatus === 'online' && data.approved === true && data.isSuspended === false) {
                        geoCandidates.push({ id: doc.id, distanceKm });
                    } else {
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
            } else {
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
            const profile = userSnap.exists ? (userSnap.data() as UserProfile) : null;
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
            const hasService = (p.servicesOffered as any)?.[service];
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
            const pA = a.profile!;
            const pB = b.profile!;
            if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
            if ((pB.acceptanceRate || 0) !== (pA.acceptanceRate || 0)) return (pB.acceptanceRate || 0) - (pA.acceptanceRate || 0);
            const levelValues = { oro: 3, plata: 2, bronce: 1 };
            const lvlA = levelValues[(pA.driverLevel || 'bronce').toLowerCase() as keyof typeof levelValues] || 0;
            const lvlB = levelValues[(pB.driverLevel || 'bronce').toLowerCase() as keyof typeof levelValues] || 0;
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
                const offerData: RideOffer = {
                    rideId,
                    driverId: winner.id,
                    passengerId: rideData.passengerId,
                    status: 'pending',
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt,
                    round,
                    origin: rideData.origin,
                    destination: rideData.destination,
                    serviceType: rideData.serviceType,
                    estimatedTotal: rideData.pricing?.estimated?.total ?? 0,
                    passengerName,
                    cityKey: pricingMunicipalityKey
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
                getFunctions().taskQueue('expireRideOfferTaskV1').enqueue(
                    { offerId, rideId },
                    { scheduleDelaySeconds: OFFER_DURATION_SECONDS }
                ).catch(e => logger.error(`Task queue failed for ${offerId}`, e));
            }
        } else {
            const winner = finalCandidates[0];
            const nextDriverId = winner.id;
            logger.info(`[MATCH_DEBUG] Sequential WINNER chosen: ${nextDriverId} at distance ${winner.distanceKm.toFixed(2)}km`);

            await db.runTransaction(async (tx) => {
                const currentRideSnap = await tx.get(rideRef);
                if (currentRideSnap.data()?.status !== 'searching') return;

                const passengerSnap = await tx.get(db.doc(`users/${rideData.passengerId}`));
                const passengerName = passengerSnap.data()?.name || "Pasajero";

                const offerId = `${rideId}_${nextDriverId}_round_${round}`;
                const offerData: RideOffer = {
                    rideId,
                    driverId: nextDriverId,
                    passengerId: rideData.passengerId,
                    status: 'pending',
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt,
                    round,
                    origin: rideData.origin,
                    destination: rideData.destination,
                    serviceType: rideData.serviceType,
                    estimatedTotal: rideData.pricing?.estimated?.total ?? 0,
                    passengerName,
                    cityKey: pricingMunicipalityKey
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
            await getFunctions().taskQueue('expireRideOfferTaskV1').enqueue(
                { offerId, rideId },
                { scheduleDelaySeconds: OFFER_DURATION_SECONDS }
            ).catch(e => logger.error(`Task queue failed`, e));
        }

    } catch (e) {
        logger.error(`[MATCH_DEBUG] CRITICAL_ERROR:`, e);
    }
}

export const createRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { origin, destination, serviceType, dryRun, promotionId, preferredDriverGender, clientRequestId } = request.data;
    const passengerId = request.auth.uid;
    // Log request receipt and payload
    logger.info(`[createRideV1] Request received from passenger ${passengerId}`);
    logger.debug('[RIDE_REQUEST] payload', { origin, destination, serviceType, clientRequestId });
    // Generate fallback clientRequestId if not provided by frontend
    const effectiveClientRequestId = clientRequestId || uuidv4();
    const userRef = db.doc(`users/${passengerId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Perfil de usuario no encontrado.');
    const passengerProfile = userSnap.data() as UserProfile;

    const CURRENT_TERMS_V = 'v1.3';
    if (!dryRun && (!passengerProfile.termsAccepted || passengerProfile.termsVersion !== CURRENT_TERMS_V)) {
        throw new HttpsError('failed-precondition', 'Debes aceptar los Términos y Condiciones actualizados.');
    }

    if (!origin || !destination || !serviceType) throw new HttpsError('invalid-argument', 'Faltan parámetros.');

    const systemConfig = await getSystemConfig();
    if (systemConfig.globalMaintenance) throw new HttpsError('unavailable', 'Sistema en mantenimiento.');

    // Validate coordinates
    const isValidCoord = (v: any) => typeof v === 'number' && !isNaN(v) && v >= -90 && v <= 90;
    if (!isValidCoord(origin.lat) || !isValidCoord(origin.lng) || !isValidCoord(destination.lat) || !isValidCoord(destination.lng)) {
      console.error('[ERROR][createRideV1] Invalid coordinates');
      throw new HttpsError('invalid-argument', 'Coordenadas inválidas');
    }
    const distKm = distanceInKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const MAX_DISTANCE_KM = 200;
    const effectiveDistKm = Math.min(distKm, MAX_DISTANCE_KM);
    if (distKm > MAX_DISTANCE_KM) {
      console.warn('[WARN][createRideV1] Distance capped from', distKm, 'to', MAX_DISTANCE_KM);
    }
    const durationMin = (effectiveDistKm / 30) * 60;
    // Resolve pricing municipality using territorial resolver
    const { pricingMunicipalityKey, method } = resolvePricingMunicipality({
      cityKey: origin.cityKey,
      city: origin.city,
      lat: origin.lat,
      lng: origin.lng,
    });
    logger.info(`[createRideV1] Pricing resolution method: ${method}, key: ${pricingMunicipalityKey}`);
    if (!pricingMunicipalityKey) {
      logger.error(`[createRideV1] Unable to resolve pricing municipality for origin`);
      throw new HttpsError('failed-precondition', 'Ciudad no reconocida. Verifique su ubicación.');
    }
    const pricingSnap = await db.doc(`municipal_pricing/${pricingMunicipalityKey}`).get();
    if (!pricingSnap.exists) {
      logger.error(`[createRideV1] Pricing config missing for municipality ${pricingMunicipalityKey}`);
      throw new HttpsError('failed-precondition', 'Tarifa municipal no encontrada para la localidad solicitada.');
    }
    const pricingConfig = pricingSnap.data() as PricingConfig;
    // Removed duplicate pricePerKmFactor declaration; using cityPricingConfig later

    // Use pricingMunicipalityKey as the city identifier
    const finalCity = pricingMunicipalityKey;

    const cityKey = normalizeCity(finalCity);
    logger.info(`[createRideV1] Resolved cityKey: ${cityKey}`);
    const citySnap = await db.doc(`cities/${cityKey}`).get();
    if (!citySnap.exists || !citySnap.data()?.enabled) {
        logger.error(`[createRideV1] City ${cityKey} is not active or not found.`);
        throw new HttpsError('failed-precondition', `VamO aún no está disponible en ${finalCity}.`);
    }

    const cityConfig = citySnap.data() as CityConfig;
    const cityPricingConfig = cityConfig.pricing;
    
    const pricePerKmFactor = (cityPricingConfig as any).NIGHT_PRICE_PER_100M > 1000 ? 1 : 10;
    (cityPricingConfig as any)._pricePerKmFactor = pricePerKmFactor;

    if (!pricingConfig) {
        logger.error(`[createRideV1] Pricing config missing for city ${cityKey}`);
        throw new HttpsError('failed-precondition', 'La configuración de tarifas para esta ciudad no está disponible.');
    }

    // Fixed municipal pricing: base fare + distance * price per 100m (no dynamic factors)
    let total = 0;
    let breakdown: any = null;
    // Use DAY pricing regardless of time
    const baseFare = pricingConfig.DAY_BASE_FARE;
    const pricePer100m = pricingConfig.DAY_PRICE_PER_100M;
    // Convert km to number of 100m units (1 km = 10 * 100m)
    const distanceUnits = Math.round(effectiveDistKm * 10);
    total = baseFare + distanceUnits * pricePer100m;
    // Simple breakdown object for consistency
    breakdown = { baseFare, distanceUnits, pricePer100m, total };
    // Express rides have a fixed extra fee
    if (serviceType === 'express') {
        total += 400;
        breakdown.fapFee = 400;
    }

    // DEBUG: Log estimation details before proceeding
    console.log('[DEBUG][createRideV1][dryRun] origin:', origin, 'destination:', destination, 'distKm:', distKm, 'effectiveDistKm:', effectiveDistKm, 'pricePerKmFactor:', (cityPricingConfig as any)._pricePerKmFactor, 'estimatedTotal:', total);
    
    const userAgent = request.rawRequest.headers['user-agent'] || 'unknown';
    const ip = request.rawRequest.ip || request.rawRequest.headers['x-forwarded-for'] || '0.0.0.0';

    // Idempotency: check if a ride with the same clientRequestId already exists for this passenger
    const existingSnap = await db.collection('rides')
      .where('passengerId', '==', passengerId)
      .where('clientRequestId', '==', effectiveClientRequestId)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      const existingRide = existingSnap.docs[0];
      logger.info(`[createRideV1] Idempotent ride found: ${existingRide.id}`);
      return { rideId: existingRide.id, resolvedCity: finalCity };
    }

    try {
        const result = await db.runTransaction(async (tx) => {
            const passengerSnap = await tx.get(userRef);
            const passengerData = passengerSnap.data() as UserProfile;
            const tokenEmailVerified = request.auth?.token?.email_verified === true;

            const eligibility = canPassengerRequestRide(passengerData, tokenEmailVerified);
            if (!eligibility.isEligible) throw new HttpsError('failed-precondition', eligibility.reason || 'No eres elegible para solicitar un viaje.');

            if (passengerData.activeRideId) {
                const activeRideSnap = await tx.get(db.doc(`rides/${passengerData.activeRideId}`));
                if (activeRideSnap.exists && !['completed', 'cancelled'].includes(activeRideSnap.data()?.status)) {
                    throw new HttpsError('failed-precondition', 'Ya tenés un viaje activo.');
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
                status: 'searching', city: finalCity,
                cityKey, // mandatory field
                clientRequestId: effectiveClientRequestId,
                pricing: pricingModel,
                legalAcceptance: {
                    termsVersion: passengerProfile.termsVersion || 'v1.2',
                    acceptedAt: admin.firestore.Timestamp.now(),
                    userAgent,
                    ip: typeof ip === 'string' ? ip : ip[0]
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                passengerName: passengerData.name || 'Pasajero',
            });

            tx.update(userRef, { activeRideId: newRideRef.id });
            logger.info(`[createRideV1] Ride created with ID ${newRideRef.id}`);
            return { rideId: newRideRef.id, resolvedCity: finalCity };
        });

        findNextDriverAndCreateOffer(result.rideId).catch(e => logger.error(`Proactive matching failed`, e));
        logger.info(`[createRideV1] Success response sent for ride ${result.rideId}`);
        return { success: true, rideId: result.rideId };
    } catch (error: any) {
        logger.error(`[createRideV1] Fatal error creating ride`, error);
        throw new HttpsError('internal', 'No se pudo crear el viaje.');
    }
});

export const ignoreRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { rideId } = request.data;
    const driverId = request.auth.uid;

    const offersSnap = await db.collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('driverId', '==', driverId)
        .where('status', '==', 'pending')
        .limit(1).get();

    if (offersSnap.empty) return { success: true };

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

export const acceptRideV2 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { rideId } = request.data;
    const driverId = request.auth.uid;

    const offersSnap = await db.collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('driverId', '==', driverId)
        .where('status', '==', 'pending')
        .limit(1).get();

    if (offersSnap.empty) throw new HttpsError('not-found', 'Oferta no encontrada o ya no está disponible.');
    const offerDoc = offersSnap.docs[0];

    try {
        await db.runTransaction(async (tx) => {
            const driverSnap = await tx.get(db.doc(`users/${driverId}`));
            const rideSnap = await tx.get(db.doc(`rides/${rideId}`));
            const offerSnap = await tx.get(offerDoc.ref);

            if (!offerSnap.exists || offerSnap.data()?.status !== 'pending') {
                logger.warn(`[MATCH_DEBUG] Offer ${offerDoc.id} is no longer pending.`);
                throw new HttpsError('failed-precondition', 'La oferta ya no está disponible.');
            }

            const ride = rideSnap.data() as Ride;
            if (ride.status !== 'searching') {
                logger.warn(`[MATCH_DEBUG] Ride ${rideId} already assigned or cancelled. Status: ${ride.status}`);
                throw new HttpsError('failed-precondition', 'El viaje ya no está disponible para asignación.');
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
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[MATCH_DEBUG] acceptRideV2 CRITICAL_ERROR:`, error);
        throw new HttpsError('internal', 'No se pudo aceptar el viaje.');
    }
});

export const scheduledRideWorker = onSchedule({ schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires" }, async (event) => {
    const db = getDb();
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('rides').where('status', '==', 'searching').get();

    for (const doc of snap.docs) {
        const data = doc.data() as Ride;
        if (data.currentOfferedDriverId && data.matchingExpiresAt && data.matchingExpiresAt > now) continue;
        findNextDriverAndCreateOffer(doc.id).catch(e => logger.error(`Worker matching failed`, e));
    }
});

export const onRideOfferUpdatedV1 = onDocumentUpdated({ document: 'rideOffers/{offerId}', region: 'us-central1' }, async (event) => {
    const afterData = event.data?.after.data() as RideOffer;
    if (!afterData || afterData.status === 'pending') return;

    if (afterData.status === 'rejected' || afterData.status === 'expired' || afterData.status === 'cancelled') {
        findNextDriverAndCreateOffer(afterData.rideId).catch(e => logger.error(`Triggered matching failed for ride ${afterData.rideId}`, e));
    }
});

export const expireRideOfferTaskV1 = onTaskDispatched({
    retryConfig: { maxAttempts: 3 },
    rateLimits: { maxConcurrentDispatches: 100 }
}, async (request) => {
    const { offerId } = request.data;
    if (!offerId) return;
    const db = getDb();
    const offerRef = db.doc(`rideOffers/${offerId}`);
    const snap = await offerRef.get();
    if (snap.exists && snap.data()?.status === 'pending') {
        await offerRef.update({ status: 'expired', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
});

/**
 * [VamO PRO] Robust Matching Initialization
 */
export const onRideCreatedV1 = onDocumentCreated({ document: "rides/{rideId}", region: 'us-central1' }, async (event: any) => {
    const rideId = event.params.rideId;
    logger.info(`[Matching] Triggered for rideId: ${rideId}. Backup check.`);
    // scheduledRideWorker or proactive matching usually handles this, but we keep the trigger for robustness.
    await findNextDriverAndCreateOffer(rideId);
});

/**
 * [VamO PRO] Weekly Rewards & Points Reset
 */
export const scheduledWeeklyResetV1 = onSchedule({
    schedule: "every monday 00:00",
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    memory: "512MiB"
}, async (event) => {
    const db = getDb();
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
export const scheduledMonthlyResetV1 = onSchedule({
    schedule: "0 0 1 * *",
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1",
    memory: "256MiB",
}, async (event) => {
    const db = getDb();
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
export const togglePauseV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { rideId, action } = request.data;
    const driverId = request.auth.uid;

    if (!rideId || !['pause', 'resume'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Parámetros inválidos.');
    }

    const rideRef = db.doc(`rides/${rideId}`);

    await db.runTransaction(async (tx) => {
        const rideSnap = await tx.get(rideRef);
        if (!rideSnap.exists) throw new HttpsError('not-found', 'Viaje no encontrado');

        const ride = rideSnap.data() as Ride;
        if (ride.driverId !== driverId) throw new HttpsError('permission-denied', 'No eres el conductor.');

        if (action === 'pause') {
            if (ride.status !== 'in_progress') throw new HttpsError('failed-precondition', 'El viaje no está en curso.');
            tx.update(rideRef, {
                status: 'paused',
                pauseStartedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            if (ride.status !== 'paused') throw new HttpsError('failed-precondition', 'El viaje no está pausado.');

            // Calculate wait diff if necessary (done in frontend but saved here for record)
            const pauseStart = (ride as any).pauseStartedAt?.toMillis();
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
export const getRideSummaryPreviewV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { rideId } = request.data;
    const driverId = request.auth.uid;

    if (!rideId) throw new HttpsError('invalid-argument', 'Falta rideId');

    const rideRef = db.doc(`rides/${rideId}`);
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists) throw new HttpsError('not-found', 'Viaje no encontrado');

    const ride = rideSnap.data() as Ride;
    if (ride.driverId !== driverId) throw new HttpsError('permission-denied', 'No autorizado');

    // Retrieve distance and original config
    let finalDistanceKm = (ride.pricing?.estimatedDistanceMeters || 0) / 1000;

    const originalSnapshot = ride.pricing?.estimated?.configSnapshot;
    let pricingConfig = originalSnapshot;

    if (!pricingConfig) {
        // Fallback to global config if snapshot is missing
        const globalSnap = await db.doc('config/pricing').get();
        pricingConfig = globalSnap.data();
    }

    if (!pricingConfig) throw new HttpsError('failed-precondition', 'Configuración de tarifa no disponible');

    // Time calculations
    const startedAt = (ride.startedAt as any)?.toMillis?.();
    const now = Date.now();
    let currentDurationSeconds = 0;
    if (startedAt) {
        currentDurationSeconds = Math.floor((now - startedAt) / 1000);
    }

    let totalWaitSeconds = (ride as any).cumulativeWaitSeconds || 0;
    if (ride.status === 'paused' && (ride as any).currentPauseStart?.toMillis) {
        const pauseStart = (ride as any).currentPauseStart.toMillis();
        totalWaitSeconds += Math.floor((now - pauseStart) / 1000);
    }

    const durationMin = Math.ceil(currentDurationSeconds / 60);

    // Re-run pricing algorithm
    const argentinaHour = parseInt(
        new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: 'numeric',
            hour12: false
        }).format(new Date()),
        10
    );
    const isNight = argentinaHour >= 23 || argentinaHour < 6;

    const pricingInput: PricingInput = {
        distanceKm: finalDistanceKm,
        durationMin,
        waitingSeconds: totalWaitSeconds,
        serviceType: ride.serviceType,
        isNight,
        isUrgent: (ride as any).isUrgent || false
    };

    const priceResult = calculateRidePrice(pricingInput, pricingConfig as any);

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
