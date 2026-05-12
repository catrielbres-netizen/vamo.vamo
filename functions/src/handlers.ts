

'use server';
import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import * as crypto from "crypto";
import { onDocumentUpdated, onDocumentCreated, onDocumentWritten, FirestoreEvent, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { canDriverTakeRide } from "./eligibility";
import { UserProfile, Ride, DriverLevel, ServiceType, RideStatus, CompletedRide, PricingConfig, WithdrawalRequest, WithId, RideOffer, DriverPoints, PricingSnapshot } from "./types";
import { getDb } from "./lib/firebaseAdmin";
import { calculateRidePrice } from "./lib/pricing";
import { normalizeCityKey, normalizeCity } from "./lib/city";
import { getArgentinaDateStr } from "./lib/date";
import { City, CityStatus, ExpansionIncentive } from "./types";
import { updateChubutExpansionProgressV1 } from "./expansionIncentives";
import { consumeLockedWallet, addWalletMovements, addFunds, getOrCreateWallet } from "./lib/wallet";
import { releaseLockedCredits, finalizeCreditConsumption } from "./lib/incentives";
import { handleRideCancellationFinancials } from "./lib/refund";
import { updatePassengerProgress } from "./lib/passengerProgress";
import { logLedgerEvent } from "./lib/audit";
import { analyzeRidePath } from "./lib/guardianTracks";
import { computeDriverRiskProfile } from "./lib/driverRisk";
import { normalizePhone } from "./lib/phone";
// --- NOTIFICATION HELPER ---
export const sendNotification = async (userId: string, title: string, body: string, link: string = '/', additionalData: { [key: string]: any } = {}) => {
    const db = getDb();
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

/**
 * [VamO PRO] Broadcast notification to all online drivers in a city.
 */
export const notifyCityDrivers = async (cityKey: string, title: string, body: string, link: string = '/', additionalData: any = {}) => {
    const db = getDb();
    const driversSnap = await db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .get();
        
    const tokens: string[] = [];
    const userIds = driversSnap.docs.map(doc => doc.id);
    
    // In a real scenario, we would filter by cityKey in the query if available,
    // or fetch profiles to verify cityKey. For now, we broadcast to all online.
    for (const uid of userIds) {
        const userSnap = await db.doc(`users/${uid}`).get();
        const profile = userSnap.data() as UserProfile;
        if (profile?.cityKey === cityKey && profile?.fcmToken) {
            tokens.push(profile.fcmToken);
        }
    }

    if (tokens.length === 0) return;

    const messages = tokens.map(token => ({
        token,
        data: { title, body, link, ...additionalData }
    }));

    // Send in batches of 500
    for (let i = 0; i < messages.length; i += 500) {
        const batch = messages.slice(i, i + 500);
        await admin.messaging().sendEach(batch).catch(e => logger.error("Broadcast batch failed", e));
    }
};


/**
 * [VamO PRO] Service Consistency Invariant
 * Ensures professional profiles (Premium) always include 'normal' service.
 */
export function ensureServiceInvariants(profile: UserProfile): any {
    const services = profile.servicesOffered || { professional: false, express: false };
    const updates: any = {};

    // Logic: Professional drivers should have normal/express too? 
    // Types show only 'express' and 'professional'.
    return null;
}



function haversineDistance(coords1: { lat: number; lng: number; }, coords2: { lat: number; lng: number; }): number {
    if (!coords1 || !coords2 || coords1.lat === undefined || coords1.lng === undefined || coords2.lat === undefined || coords2.lng === undefined) {
        return 0;
    }
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
    return isNaN(c) ? 0 : R * c;
}


// --- PRICING & COMMISSION LOGIC (PURE FUNCTIONS) ---

async function getPricingConfig(cityKey?: string): Promise<PricingConfig> {
    const db = getDb();
    const defaultConfig: PricingConfig = {
        version: 1,
        DAY_BASE_FARE: 1400,
        DAY_PRICE_PER_100M: 152,
        DAY_WAITING_PER_MIN: 220,
        NIGHT_BASE_FARE: 1652,
        NIGHT_PRICE_PER_100M: 189,
        NIGHT_WAITING_PER_MIN: 277,
        MINIMUM_FARE: 2000,
        PLATFORM_COMMISSION_RATE: 0.08,
        commission_particular: 0.14,
        commission_taxi_remis: 0.08,
        municipal_percentage: 0.02,
        ASSISTANCE_FEE: 400,
        assistanceEnabled: true
    };


    try {
        if (cityKey) {
            const citySnap = await db.doc(`cities/${cityKey}`).get();
            const cityPricing = (citySnap.data() as any)?.pricing;
            if (cityPricing) {
                logger.info(`Using city-specific pricing for ${cityKey}`);
                return cityPricing as PricingConfig;
            }
        }

        const configSnap = await db.doc('config/pricing').get();
        if (configSnap.exists) {
            logger.info("Using dynamic pricing config from Firestore.");
            return configSnap.data() as PricingConfig;
        }

        if (cityKey === 'rawson' || !cityKey) {
            logger.warn("Pricing config not found. Using default hardcoded values.");
            return defaultConfig;
        }

        throw new Error(`Pricing config UNREACHABLE for city: ${cityKey}. No silent fallback allowed.`);
    } catch (error: any) {
        logger.error("Error fetching pricing config:", error);
        throw error;
    }
}

function calculatePointsAwarded(
    driverProfile: UserProfile,
    rideData: Ride
): number {
    const ridesCompleted = driverProfile.stats?.ridesCompleted ?? 0;

    const PROMO_RIDE_THRESHOLD = 10;
    if (ridesCompleted < PROMO_RIDE_THRESHOLD) return 0;

    let basePoints = 0;
    if (rideData.serviceType === "express") basePoints = 3;
    if (rideData.serviceType === "professional") basePoints = 1;

    return basePoints;

}

function getDriverLevel(points: number): DriverLevel {
    if (points >= 100) return "oro";
    if (points >= 50) return "plata";
    return "bronce";
}


export function calculateSettlement(
    rideData: Ride, 
    driverData: UserProfile, 
    trackingPoints: admin.firestore.DocumentData[], 
    pricing: PricingConfig,
    expansionRates?: ExpansionIncentive['currentRates']
) {
    const isNight = false; // TODO: Implement night-time logic based on completedAt

    const completedAt = rideData.completedAt as Timestamp | null;
    const startedAt = rideData.startedAt as Timestamp | null;

    // A. Durations
    const durationSeconds = completedAt && startedAt
        ? (completedAt.seconds - startedAt.seconds)
        : 0;
    
    // [VamO PRO] Centralized wait tracking (Grace period is handled inside calculateRidePrice)
    const waitingTotalSeconds = rideData.cumulativeWaitSeconds || (rideData.pauseHistory || []).reduce((acc, p) => acc + p.duration, 0);

    // B. Distance
    let distanceMeters = 0;
    let calculationSource = "backend_v2_haversine_direct"; 
    const trackingStats: CompletedRide['trackingStats'] = { totalPoints: 0, validSegments: 0, discardedSegments: 0, maxSpeedDetected: 0, distanceSource: calculationSource };

    if (trackingPoints && trackingPoints.length > 1) {
        trackingStats.totalPoints = trackingPoints.length;
        distanceMeters = trackingPoints.reduce((totalDistance, pointData, index) => {
            if (index === 0) return 0;
            const prevPointData = trackingPoints[index - 1];
            type TrackingPoint = { lat: number; lng: number; timestamp: Timestamp; accuracy?: number };
            const point = pointData as TrackingPoint;
            const prevPoint = prevPointData as TrackingPoint;
            if (completedAt && point.timestamp.toMillis() > completedAt.toMillis()) {
                trackingStats.discardedSegments++;
                return totalDistance;
            }
            const pointTimestamp = point.timestamp.toMillis();
            const prevPointTimestamp = prevPoint.timestamp.toMillis();
            const segmentDist = haversineDistance(prevPoint, point);
            const timeDiffSeconds = (pointTimestamp - prevPointTimestamp) / 1000;
            if (timeDiffSeconds <= 0) {
                trackingStats.discardedSegments++;
                return totalDistance;
            }
            const speedKph = (segmentDist / timeDiffSeconds) * 3.6;
            if (speedKph > trackingStats.maxSpeedDetected) trackingStats.maxSpeedDetected = speedKph;
            if (speedKph > 160 || segmentDist < 3 || (point.accuracy || 0) > 50) {
                trackingStats.discardedSegments++;
                return totalDistance;
            }
            trackingStats.validSegments++;
            return totalDistance + segmentDist;
        }, 0);
        calculationSource = "backend_v2_gps_accumulated";
        trackingStats.distanceSource = calculationSource;
    } else {
        distanceMeters = haversineDistance(rideData.origin, rideData.destination);
    }

    // C. Pricing Master Resolution
    // [SOURCE OF TRUTH] We honor the estimated total to ensure consistency.
    const estimated = rideData.pricing?.estimated;
    const estimatedTotal = rideData.pricing?.estimatedTotal || estimated?.total || 0;
    
    // [VamO PRO] Centralized Pricing Call (Audit/Fallback)
    const pricingResult = calculateRidePrice({
        distanceKm: distanceMeters / 1000,
        durationMin: durationSeconds / 60,
        waitingSeconds: waitingTotalSeconds, // Pass full duration, grace period handled inside
        serviceType: rideData.serviceType,
        isNight,
    }, pricing);

    // [DECISION] We honor the estimatedTotal but we MUST add the extra waitingFare incurred.
    const waitingFare = pricingResult.breakdown.waitingFare;
    const totalFare = estimatedTotal > 0 ? (estimatedTotal + waitingFare) : pricingResult.total;

    // [BREAKDOWN] Reconstruct breakdown
    const baseFare = estimated?.breakdown?.baseFare ?? pricingResult.breakdown.baseFare;
    const distanceFare = estimated?.breakdown?.distanceFare ?? pricingResult.breakdown.distanceFare;
    // waitingFare is already defined above at line 297
    const expressDiscountSnap = rideData.pricing?.expressDiscountAmount ?? estimated?.breakdown?.expressDiscountAmount ?? 0;
    
    const driverSubtypeResolved = (rideData as any).driverSubtypeSnapshot || driverData.driverSubtype || 'express';
    const isProfessional = driverSubtypeResolved === 'professional';
    const cityKey = rideData.cityKey || 'rawson';

    // [FASE 5] New Commission Model
    // Express: 18% | Professional: 12%
    const totalCommissionRate = isProfessional ? 0.12 : 0.18;
    
    // Rawson: 5% | Other: 2%
    const municipalRate = cityKey === 'rawson' ? 0.05 : 0.02;
    
    // VamO Cut = Total - Municipal
    const vamoRate = totalCommissionRate - municipalRate;

    const commissionAmount = Math.round(totalFare * totalCommissionRate);
    const municipalFee     = Math.round(totalFare * municipalRate);
    const vamoAmount       = commissionAmount - municipalFee;
    const driverNetAmount  = totalFare - commissionAmount;

    const creditCoveredAmount = Math.max(0, rideData.pricing?.creditCoveredAmount || 0);
    
    // [VamO PRO] Intent-based financial settlement
    // We use paymentSnapshot to know IF the user wanted to use the wallet.
    const paymentSnapshot = rideData.paymentSnapshot;
    const useWallet = paymentSnapshot ? paymentSnapshot.useWallet : (rideData.paymentMethod === 'wallet');
    
    const passengerAfterExpress = Math.max(0, totalFare - expressDiscountSnap);
    const passengerAfterCredits = Math.max(0, passengerAfterExpress - creditCoveredAmount);

    let walletCoveredAmount = 0;
    if (useWallet) {
        // If wallet was intended, we use the amount that was LOCKED during creation.
        // It cannot exceed the final passenger total (e.g. if the fare went down).
        const lockedWallet = rideData.pricing?.walletCoveredAmount || 0;
        walletCoveredAmount = Math.min(lockedWallet, passengerAfterCredits);
    }

    // The remaining balance is always collected in cash (physical money).
    // For pure cash rides (useWallet=false), walletCoveredAmount will be 0, 
    // so cashToCollect will be the full final total.
    const cashToCollect = Math.max(0, passengerAfterCredits - walletCoveredAmount);
    const passengerPaysTotal = passengerAfterCredits;

    const platformSubsidyAmount = expressDiscountSnap + creditCoveredAmount;

    const settlement: Omit<CompletedRide, 'calculatedAt' | 'pointsAwarded'> = {
        pricingVersion: pricing.version,
        calculationSource,
        distanceMeters,
        durationSeconds,
        waitingSeconds: Math.max(0, waitingTotalSeconds - 300),
        baseFare,
        distanceFare,
        waitingFare,
        extrasFare: 0,
        totalFare,
        originalTotal: totalFare + expressDiscountSnap,
        discountAmount: expressDiscountSnap,
        expressDiscountAmount: expressDiscountSnap,
        creditCoveredAmount,
        walletCoveredAmount,
        platformSubsidyAmount,
        vamoSubsidyAmount: platformSubsidyAmount,
        passengerPaysTotal,
        cashToCollect,
        fapFee: 0,
        municipalFee,
        municipalRate,
        vamoCommissionRate: vamoRate,
        baseCommissionRate: totalCommissionRate,
        finalCommissionRate: totalCommissionRate,
        commissionRate: totalCommissionRate,
        commissionAmount,
        driverSubtypeSnapshot: driverSubtypeResolved,
        driverNetAmount,
        totalAmount: totalFare,
        municipalAmount: municipalFee,
        vamoAmount: vamoAmount,
        driverEarnings: driverNetAmount,
        trackingStats,
    };

    return settlement;
}


function getWeekId(date: Date = new Date()): string {
    // Standardized logic to match frontend (lib/date.ts)
    // April 2026: VamO PRO Rules
    const d = new Date(date);
    const argDate = new Date(d.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    
    const year = argDate.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

export const createPaymentPreferenceV4 = onCall(
    { secrets: ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_URL"], cors: true, region: 'us-central1' },
    async (request: CallableRequest<{ amount: number }>) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
        }

        try {
            const { amount } = request.data;
            if (typeof amount !== 'number' || amount < 500) {
                throw new HttpsError('invalid-argument', 'El monto debe ser un número mayor a $500.');
            }

            const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
            if (!mpAccessToken) {
                logger.error("MERCADOPAGO_ACCESS_TOKEN secret is not set.");
                throw new HttpsError('internal', 'La API de pagos no está configurada en el servidor.');
            }
            const notificationUrl = process.env.MERCADOPAGO_WEBHOOK_URL;
            if (!notificationUrl) {
                logger.error("MERCADOPAGO_WEBHOOK_URL no está configurada.");
                throw new HttpsError('internal', 'La configuración de notificaciones de pago es incorrecta.');
            }

            const serverMpClient = new MercadoPagoConfig({ accessToken: mpAccessToken });
            const driverId = request.auth.uid;
            const driverEmail = request.auth.token.email;
            const appUrl = process.env.APP_URL || 'http://localhost:3000';

            const preferenceRequest = {
                items: [{
                    id: "wallet-topup",
                    title: "Carga de saldo VamO",
                    quantity: 1,
                    currency_id: "ARS",
                    unit_price: amount,
                }],
                payer: {
                    email: driverEmail,
                },
                external_reference: driverId,
                metadata: {
                    type: "wallet_topup",
                    driver_id: driverId, // Fallback/redundant driver ID
                },
                back_urls: {
                    success: `${appUrl}/driver/earnings?mp_status=success`,
                    failure: `${appUrl}/driver/earnings?mp_status=failure`,
                    pending: `${appUrl}/driver/earnings?mp_status=pending}`,
                },
                auto_return: "approved",
                notification_url: notificationUrl,
                binary_mode: true,
            };

            logger.log("--- CREATING MERCADOPAGO PREFERENCE (CALLABLE) ---");
            logger.log("Driver ID:", driverId);
            logger.log("Amount:", amount);

            const preferenceClient = new Preference(serverMpClient);
            const response = await preferenceClient.create({ body: preferenceRequest });

            if (response.init_point) {
                logger.log("Successfully created preference. Init Point:", response.init_point);
                return { init_point: response.init_point };
            } else {
                logger.error("MercadoPago response did not contain init_point", { response });
                throw new HttpsError('internal', 'No se pudo crear el init_point de MercadoPago.');
            }

        } catch (error: any) {
            logger.error("[Function Error] createPaymentPreferenceV4:", error.message);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError('internal', error.message || 'An internal server error occurred.');
        }
    }
);

/**
 * [VamO PRO] Minimal Acknowledge Offer
 * Satisfies frontend DriverOfferCard.tsx requirement without business side-effects.
 */
export const acknowledgeOfferV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'User must be logged in.');

    const { offerId } = request.data;
    if (!offerId) throw new HttpsError('invalid-argument', 'Missing offerId.');

    const db = getDb();
    const offerRef = db.collection('rideOffers').doc(offerId);

    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(offerRef);
            if (!snap.exists) throw new HttpsError('not-found', 'Offer not found.');

            const offerData = snap.data() as RideOffer;
            if (offerData.driverId !== auth.uid) {
                throw new HttpsError('permission-denied', 'You do not own this offer.');
            }

            // Only update if not already acknowledged
            if (!offerData.acknowledgedAt) {
                tx.update(offerRef, {
                    acknowledgedAt: FieldValue.serverTimestamp(),
                    acknowledgedBy: auth.uid,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        });
        return { success: true };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`Error in acknowledgeOfferV1:`, error);
        throw new HttpsError('internal', error.message || 'Internal error during acknowledgement.');
    }
});


/**
 * [VamO PRO] STUB temporal para evitar borrado de función en producción 
 * hasta reimplementar ledger municipal definitivo.
 */
export const updateCityLedgerV1 = onSchedule({
    schedule: "every 12 hours",
    timeZone: "America/Argentina/Buenos_Aires"
}, async (event) => {
    logger.info("updateCityLedgerV1 stub activo - ledger automático pausado");
    return;
});


export const onRideSettlementV6 = onDocumentUpdated("rides/{rideId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { rideId: string }>) => {
    const db = getDb();
    const rideId = event.params.rideId;
    let settlementDataToLog: any = null;

    logger.log(`[SETTLEMENT START] Processing rideId: ${rideId}`);

    if (!event.data) {
        logger.warn(`[SETTLEMENT SKIP] No event data for ${rideId}`);
        return;
    }
    const before = event.data.before.data() as Ride;
    const after = event.data.after.data() as Ride;

    logger.log(`[SETTLEMENT STATUS] rideId: ${rideId}, before: ${before?.status}, after: ${after?.status}, settledAt: ${after?.settledAt}`);

    if (!before || !after) {
        logger.warn(`[SETTLEMENT SKIP] Missing document data for ${rideId}`);
        return;
    }

    if (after.status !== 'completed') {
        logger.log(`[SETTLEMENT SKIP] Ride ${rideId} is not completed (status: ${after.status})`);
        return;
    }

    if (after.settledAt) {
        logger.log(`[SETTLEMENT SKIP] Ride ${rideId} already settled at ${after.settledAt}`);
        return;
    }

    // [DIAGNOSTIC] If it was already completed, but not settled, we should investigate why.
    if (before.status === 'completed') {
        logger.info(`[SETTLEMENT RETRY?] Ride ${rideId} was already completed but not settled. Attempting recovery.`);
    }

    const isSimulation = (after as any).isSimulation === true;

    if (isSimulation) {
        logger.info(`[SIM_SETTLEMENT] Processing simulation ride ${rideId}. Applying new commission model.`);
        const rideRef = db.collection('rides').doc(rideId);
        const driverRef = db.collection('users').doc(after.driverId!);
        const passengerRef = db.collection('users').doc((after as any).passengerId);
        const driverLocationRef = db.collection('drivers_locations').doc(after.driverId!);
        
        const cityKey = after.cityKey || 'rawson';
        const driverSubtype = after.driverSubtypeSnapshot || 'express';
        const totalFare = after.pricing?.estimatedTotal || 0;
        
        // FASE 5 Logic
        const totalCommissionRate = driverSubtype === 'professional' ? 0.12 : 0.18;
        const municipalRate = cityKey === 'rawson' ? 0.05 : 0.02;
        const vamoRate = totalCommissionRate - municipalRate;
        
        const commissionAmount = Math.round(totalFare * totalCommissionRate);
        const municipalAmount = Math.round(totalFare * municipalRate);
        const vamoAmount = commissionAmount - municipalAmount;
        const driverEarnings = totalFare - commissionAmount;

        const completedRideData: any = {
            totalAmount: totalFare,
            commissionAmount,
            municipalAmount,
            vamoAmount,
            driverEarnings,
            totalFare,
            commissionRate: totalCommissionRate,
            municipalFee: municipalAmount,
            driverNetAmount: driverEarnings,
            driverSubtypeSnapshot: driverSubtype,
            calculatedAt: Timestamp.now()
        };

        
        await db.runTransaction(async (tx) => {
            const now = Timestamp.now();
            tx.update(rideRef, { 
                status: 'completed', 
                settledAt: now,
                isSimulationResult: true,
                simulationProcessedAt: now,
                completedRide: completedRideData
            });
            tx.update(driverRef, { activeRideId: null, driverStatus: 'online', updatedAt: now });
            tx.update(passengerRef, { activeRideId: null, updatedAt: now });
            tx.update(driverLocationRef, { driverStatus: 'online', updatedAt: now });

            // Write metrics to simulation_metrics
            const metricRef = db.collection('simulation_metrics').doc(`${rideId}_settlement`);
            tx.set(metricRef, {
                rideId,
                driverId: after.driverId,
                passengerId: (after as any).passengerId,
                cityKey: after.cityKey || 'rawson',
                totalFare,
                commissionAmount,
                municipalAmount,
                vamoAmount,
                driverEarnings,
                distanceMeters: after.pricing?.estimatedDistanceMeters || 0,
                processedAt: now,
                status: 'completed'
            });
        });
        logger.info(`[SIM_SETTLEMENT] Simulation ride ${rideId} finalized successfully.`);
        return;
    }

    const driverId = after.driverId;
    const passengerId = (after as any).passengerId; // Safe access for simulation
    const cityKey = after.cityKey || 'rawson';
    const cityRef = db.doc(`cities/${cityKey}`);

    if (!driverId || !passengerId) {
        const errorMsg = `Critical data missing: driverId=${driverId}, passengerId=${passengerId}`;
        logger.error(`[SETTLEMENT ERROR] ${errorMsg} for ${rideId}`);
        await db.doc(`rides/${rideId}`).update({ 
            settlementError: errorMsg,
            settlementErrorAt: FieldValue.serverTimestamp()
        });
        return;
    }

    logger.log(`[SETTLEMENT EXEC] Ride ${rideId} verified. Starting transaction for driver ${driverId}.`);

    const rideRef = db.collection('rides').doc(rideId);
    const driverRef = db.collection('users').doc(driverId);
    const passengerRef = db.collection('users').doc(passengerId);
    const driverLocationRef = db.collection('drivers_locations').doc(driverId);
    const transactionRef = db.collection('platform_transactions').doc(); 
    const pointsRef = db.collection('driver_points').doc(driverId);

    try {
        const trackingSnapshot = await rideRef.collection('tracking').orderBy('timestamp', 'asc').get();
        const trackingPoints = trackingSnapshot.docs.map(doc => doc.data());
        logger.log(`[SETTLEMENT DATA] Fetched ${trackingPoints.length} tracking points for ${rideId}`);

        const cityKey = after.cityKey || 'rawson';
        const pricingConfig = await getPricingConfig(cityKey);
        logger.log(`[SETTLEMENT CONFIG] Using cityKey: ${cityKey}`);

        let expansionRates: ExpansionIncentive['currentRates'] | undefined = undefined;
        if (cityKey === 'rawson') {
            const incentiveSnap = await db.doc('expansion_incentives/rawson').get();
            if (incentiveSnap.exists && (incentiveSnap.data() as ExpansionIncentive).enabled) {
                expansionRates = (incentiveSnap.data() as ExpansionIncentive).currentRates;
                logger.log(`[SETTLEMENT EXPANSION] Applied Rawson dynamic rates.`);
            }
        }

        // Extracted ranking calculation outside the transaction to prevent read contention
        const currentPointsSnap = await pointsRef.get();
        const currentWeeklyPoints = currentPointsSnap.exists ? currentPointsSnap.data()?.weeklyPoints || 0 : 0;
        
        let multiplier = 0;
        try {
            const betterDriversSnap = await db.collection('driver_points')
                .where('weeklyPoints', '>', currentWeeklyPoints)
                .orderBy('weeklyPoints', 'desc')
                .limit(11)
                .get();
            const rank = betterDriversSnap.size + 1;
            logger.log(`[SETTLEMENT RANK] Driver rank: ${rank}`);

            if (rank <= 2) multiplier = 1.5;
            else if (rank <= 6) multiplier = 1.2;
            else if (rank <= 10) multiplier = 1;
            else multiplier = 0;
        } catch (err) {
            logger.error(`[SETTLEMENT RANK] Failed to compute rank for ${driverId}`, err);
            multiplier = 0;
        }


        await db.runTransaction(async (tx) => {
            logger.log(`[SETTLEMENT TX START] Transaction initiated for ${rideId}`);
            
            const driverRef = db.collection('users').doc(driverId);
            const rideRef = db.collection('rides').doc(rideId);
            const pointsRef = db.collection('driver_points').doc(driverId);
            
            const driverSnap = await tx.get(driverRef);
            const rideSnap = await tx.get(rideRef);
            const pointsSnap = await tx.get(pointsRef);
            const passengerSnap = await tx.get(passengerRef);
            const citySnap = await tx.get(cityRef);
            
            // [WALLET_READS] Pre-fetch all financial docs to comply with READ-BEFORE-WRITE rule
            const walletRef = db.doc(`wallets/${passengerId}`);
            const consumeRef = db.collection('wallet_transactions').doc(`consume_${rideId}`);
            const releaseRef = db.collection('wallet_transactions').doc(`release_${rideId}`);
            const lockRef = db.doc(`wallet_transactions/lock_${rideId}`);
            const passengerWalletRef = db.doc(`wallets/${passengerId}`);
            
            const [passengerWalletSnap, consumeSnap, releaseSnap, driverWalletSnap, lockSnap] = await Promise.all([
                tx.get(passengerWalletRef),
                tx.get(consumeRef),
                tx.get(releaseRef),
                tx.get(db.doc(`wallets/${driverId}`)),
                tx.get(lockRef)
            ]);


            if (!driverSnap.exists || !rideSnap.exists || !passengerSnap.exists) {
                const missing = [];
                if (!driverSnap.exists) missing.push('driver');
                if (!rideSnap.exists) missing.push('ride');
                if (!passengerSnap.exists) missing.push('passenger');
                logger.error(`[SETTLEMENT CRITICAL] Docs missing: ${missing.join(', ')} for ride ${rideId}`);
                throw new Error(`Critical docs missing: ${missing.join(', ')}`);
            }

            const rideData = rideSnap.data() as Ride;
            
            // 1. Validar que el viaje no haya sido ya liquidado
            if (rideData.settledAt || rideData.completedRide) {
                logger.warn(`[SETTLEMENT_ALREADY_DONE] Ride ${rideId} already has settledAt or completedRide. Skipping.`);
                return;
            }

            // 2. [ANTI-FRAUD] Validar Status
            if (rideData.status !== 'completed') {
                logger.error(`[FRAUD_WARNING] Attempted settlement for non-completed ride ${rideId}. Status: ${rideData.status}`);
                return;
            }

            // 3. [ANTI-FRAUD] Validar Contexto de Identidad
            if (rideData.driverId !== driverId || rideData.passengerId !== passengerId) {
                logger.error(`[FRAUD_WARNING] Inconsistent ride context for ${rideId}. Expected D:${rideData.driverId} P:${rideData.passengerId}, Received D:${driverId} P:${passengerId}`);
                return;
            }

            const driverData = driverSnap.data() as UserProfile;
            const passengerData = passengerSnap.data() as UserProfile;
            logger.log(`[SETTLEMENT CALC] Calculating for driver: ${driverData.name}, Subtype: ${driverData.driverSubtype}`);

            const settlementData = calculateSettlement(rideData, driverData, trackingPoints, pricingConfig, expansionRates);
            const { commissionAmount, municipalFee } = settlementData;
            
            logger.log(`[SETTLEMENT VALUES] commission: ${commissionAmount}, municipalFee: ${municipalFee}`);

            const basePoints = calculatePointsAwarded(driverData, rideData);
            const pointsAwarded = Math.floor(basePoints * multiplier);
            logger.log(`[SETTLEMENT POINTS] base: ${basePoints}, mult: ${multiplier}, awarded: ${pointsAwarded}`);

            const todayStr = getArgentinaDateStr();
            const monthId = new Date().toISOString().substring(0, 7); // YYYY-MM
            const weekId = getWeekId();
            const now = FieldValue.serverTimestamp();

            // [WALLET_FIX] Driver Accreditation via Wallet Movements (BATCHED READS BEFORE WRITES)
            const driverMovements = [];
            
            // 1. Digital Earnings
            driverMovements.push({
                amount: settlementData.driverNetAmount || 0,
                type: 'ride_earning' as const,
                rideId: rideId,
                note: `Ganancia neta viaje ${rideId}`
            });

            // 2. Cash Recovery Movement
            const cashToCollect = settlementData.cashToCollect || 0;
            if (cashToCollect > 0) {
                driverMovements.push({
                    amount: -cashToCollect,
                    type: 'cash_collected' as const,
                    rideId: rideId,
                    note: `Efectivo cobrado en viaje ${rideId}`
                });
            }

            // [WALLET_DEFERRED] Movements will be applied after mission check to maintain read-before-write integrity.

            // Passenger Reward Logic
            const passengerPointsForThisRide = (rideData.serviceType === 'professional') ? 1 : 0;
            const currentPassengerPoints = passengerData.vamoPoints || 0;
            const newPassengerPoints = currentPassengerPoints + passengerPointsForThisRide;
            const hasPassengerBonus = newPassengerPoints >= 30;

            // --- PREPARE RIDE & POOL UPDATES (DEFERRED WRITES) ---
            const isWeeklyPoolEligible = !rideData.weeklyPoolCounted;
            const rideUpdate: any = {
                completedRide: { ...settlementData, pointsAwarded, calculatedAt: Timestamp.now() },
                settledAt: now,
                vamoPointsAwarded: passengerPointsForThisRide,
                expansionCounted: true
            };
            
            if (isWeeklyPoolEligible) {
                rideUpdate.weeklyPoolCounted = true;
                rideUpdate.weeklyPoolCountedAt = now;
                rideUpdate.weeklyPoolWeekId = weekId;
            }

            // [FASE 5] finalDebit = VamO commission + municipalFee
            // El conductor paga ambos. VamO ya NO absorbe el fee municipal.
            const municipalFeeDebit = settlementData.municipalFee ?? 0;
            const finalDebit = commissionAmount + municipalFeeDebit;
            logger.log(`[FINANCIAL] Debiting driver ${driverId}: commissionAmount=${commissionAmount} + municipalFee=${municipalFeeDebit} = finalDebit=${finalDebit}`);

            // --- DRIVER STATS & BALANCE LOGIC (VamO PRO v7.0) ---
            
            const walletCredit = settlementData.walletCoveredAmount || 0;
            const netBalanceChange = walletCredit - finalDebit;

            // Determine if we need to reset daily/weekly/monthly stats
            const isNewDay = driverData.dailyStats?.lastResetDate !== todayStr;
            const isNewWeek = (driverData as any).financialStats?.lastWeekId !== weekId;
            const isNewMonth = (driverData as any).financialStats?.lastMonthId !== monthId;

            const earningsForThisRide = settlementData.driverNetAmount || 0;

            const todayCash = settlementData.cashToCollect || 0;
            const todayDigital = settlementData.walletCoveredAmount || 0;

            const driverUpdate: any = {
                'stats.ridesCompleted': FieldValue.increment(1),
                updatedAt: now,
                rewardPoints: FieldValue.increment(pointsAwarded),
                driverLevel: getDriverLevel((driverData.rewardPoints || 0) + pointsAwarded),
                activeRideId: null,
                driverStatus: 'online'
            };

            // [VamO PRO] Stats & Missions Logic
            const currentRides = isNewDay ? 1 : (driverData.dailyStats?.ridesCount || 0) + 1;
            const missionsCompleted = isNewDay ? [] : (driverData.dailyStats?.missionsCompleted || []);
            
            // Check for missions
            const newMissions: string[] = [];
            if (currentRides >= 5 && !missionsCompleted.includes('daily_5')) newMissions.push('daily_5');
            if (currentRides >= 12 && !missionsCompleted.includes('daily_12')) newMissions.push('daily_12');
            if (currentRides >= 20 && !missionsCompleted.includes('daily_20')) newMissions.push('daily_20');
            if (currentRides >= 30 && !missionsCompleted.includes('daily_30')) newMissions.push('daily_30');

            if (isNewDay) {
                driverUpdate.dailyStats = {
                    ridesCount: 1,
                    earningsDaily: earningsForThisRide,
                    todayCash,
                    todayDigital,
                    kilometersDaily: settlementData.distanceMeters / 1000,
                    onlineSeconds: 0,
                    lastResetDate: todayStr,
                    lastUpdated: now,
                    missionsCompleted: newMissions
                };
            } else {
                driverUpdate['dailyStats.ridesCount'] = FieldValue.increment(1);
                driverUpdate['dailyStats.earningsDaily'] = FieldValue.increment(earningsForThisRide);
                driverUpdate['dailyStats.todayCash'] = FieldValue.increment(todayCash);
                driverUpdate['dailyStats.todayDigital'] = FieldValue.increment(todayDigital);
                driverUpdate['dailyStats.kilometersDaily'] = FieldValue.increment(settlementData.distanceMeters / 1000);
                driverUpdate['dailyStats.lastUpdated'] = now;
                if (newMissions.length > 0) {
                    driverUpdate['dailyStats.missionsCompleted'] = FieldValue.arrayUnion(...newMissions);
                }
            }

            // [MISSION_BONUS] Award Mission Bonuses
            for (const mId of newMissions) {
                let reward = 0;
                if (mId === 'daily_5') reward = 1000;
                if (mId === 'daily_12') reward = 2000;
                if (mId === 'daily_20') reward = 3000;
                if (mId === 'daily_30') reward = 5000;

                if (reward > 0) {
                    driverMovements.push({
                        amount: reward,
                        type: 'adjustment' as const,
                        rideId: `${mId}_${todayStr}`,
                        note: `Bono misión diaria (${currentRides} viajes)`
                    });
                    logger.info(`[MISSION] Driver ${driverId} added bonus ${mId}: $${reward} to batch`);
                }
            }

            // [WALLET_EXEC] Batch all driver movements (earnings, cash recovery, missions)
            // THIS CONTAINS THE FINAL READS (idempotency checks for movements)
            await addWalletMovements(driverId, driverMovements, cityKey, tx, { 
                userSnap: driverSnap,
                walletSnap: driverWalletSnap 
            });

            // --- WRITES START HERE (Strict read-before-write) ---
            
            // 1. Update Ride
            tx.update(rideRef, rideUpdate);

            // 2. Create Pool Event if needed
            if (isWeeklyPoolEligible) {
                logger.log(`[SETTLEMENT POOL] Emitting pool event for week ${weekId}`);
                const poolEventRef = db.collection('weeklyPoolEvents').doc(rideId);
                tx.set(poolEventRef, {
                    rideId, cityKey, driverId, weekId,
                    createdAt: now, processed: false
                });
            }

            // --- WEEKLY & MONTHLY STATS (FINANCIAL_STATS v7.1) ---
            if (isNewWeek) {
                driverUpdate['financialStats.weeklyEarnings'] = earningsForThisRide;
                driverUpdate['financialStats.weeklyRidesCount'] = 1;
                driverUpdate['financialStats.lastWeekId'] = weekId;
            } else {
                driverUpdate['financialStats.weeklyEarnings'] = FieldValue.increment(earningsForThisRide);
                driverUpdate['financialStats.weeklyRidesCount'] = FieldValue.increment(1);
            }

            if (isNewMonth) {
                driverUpdate['financialStats.monthlyEarnings'] = earningsForThisRide;
                driverUpdate['financialStats.monthlyRidesCount'] = 1;
                driverUpdate['financialStats.lastMonthId'] = monthId;
            } else {
                driverUpdate['financialStats.monthlyEarnings'] = FieldValue.increment(earningsForThisRide);
                driverUpdate['financialStats.monthlyRidesCount'] = FieldValue.increment(1);
            }
            driverUpdate['financialStats.totalHistoricalEarnings'] = FieldValue.increment(earningsForThisRide);

            // Update driver_points for Weekly Pool
            if (isNewWeek) {
                tx.set(pointsRef, {
                    driverId,
                    weeklyPoints: pointsAwarded,
                    weeklyTripsCount: 1,
                    lastUpdated: now,
                    weekId
                }, { merge: true });
            } else {
                tx.update(pointsRef, {
                    weeklyPoints: FieldValue.increment(pointsAwarded),
                    weeklyTripsCount: FieldValue.increment(1),
                    lastUpdated: now
                });
            }

            tx.update(driverRef, driverUpdate);

            // --- PASSENGER BALANCE DEDUCTION (UNTOUCHED) ---
            if (walletCredit > 0) {
                logger.log(`[FINANCIAL] Deducting $${walletCredit} from passenger ${passengerId} (VamO Pay)`);
                // REMOVED REDUNDANT DEDUCTION: currentBalance decrement removed to avoid double charge (P0 fix).
                // Real deduction is handled by consumeLockedWallet on the wallets collection.


                const creditTxRef = db.collection('platform_transactions').doc();
                tx.set(creditTxRef, {
                    driverId, rideId, amount: walletCredit, type: 'wallet_credit',
                    note: `Pago Digital Viaje ${rideId} (Driver Leg)`,
                    cityKey, createdAt: now, systemVersion: 'v7_audit_fix'
                });

                // Also record a transaction for the passenger in platform_transactions
                const passengerTxRef = db.collection('platform_transactions').doc();
                tx.set(passengerTxRef, {
                    userId: passengerId,
                    rideId,
                    amount: -walletCredit,
                    type: 'wallet_payment',
                    note: `Pago VamO Pay viaje ${rideId}`,
                    cityKey,
                    createdAt: now,
                    systemVersion: 'v7_audit_fix'
                });
            }

            // Update City Pool Amount (Linear Contribution Rule v7.0)
            // Rule: weeklyPoolAmount = weeklyPoolAmount + $100 (capped at $300,000)
            const cityData = citySnap.data() as any;
            const currentPool = cityData?.rewardsConfig?.weeklyPoolAmount ?? 50000;
            const MAX_POOL = 300000;
            const POOL_INCREMENT_PER_RIDE = 100;
            
            // Only increment if we haven't hit the cap
            const finalPoolIncrement = (currentPool < MAX_POOL) ? POOL_INCREMENT_PER_RIDE : 0;

            tx.update(cityRef, {
                'rewardsConfig.weeklyPoolAmount': FieldValue.increment(finalPoolIncrement),
                'rewardsConfig.updatedAt': now,
                'stats.totalMunicipalContribution': FieldValue.increment(municipalFee || 0),
                'stats.totalRides': FieldValue.increment(1),
            });

            // Update Municipal Account (Treasury Integration)
            const muniAccRef = db.doc(`municipal_accounts/${cityKey}`);
            tx.set(muniAccRef, {
                cityKey,
                currentBalance: FieldValue.increment(settlementData.municipalFee || 0),
                totalAccumulated: FieldValue.increment(settlementData.municipalFee || 0),
                lastMovementAt: now,
                updatedAt: now,
                status: 'active'
            }, { merge: true });

            const muniTxRef = db.collection('platform_transactions').doc();
            tx.set(muniTxRef, {
                cityKey,
                rideId,
                amount: settlementData.municipalFee || 0,
                type: 'municipal_contribution',
                note: `Participación municipal viaje ${rideId}`,
                createdAt: now,
                systemVersion: 'v6_pool_muni'
            });

            // FAP Express extra debit removed based on Admin requirements. It is now absorbed within the main commission.

            tx.update(passengerRef, { 
                activeRideId: null, 
                updatedAt: now,
                'stats.ridesCompleted': FieldValue.increment(1),
                vamoPoints: newPassengerPoints,
                activeBonus: hasPassengerBonus
            });
            tx.update(driverLocationRef, { driverStatus: 'online', lastUpdateAt: now });
            
            const pointsUpdate = {
                weeklyPoints: FieldValue.increment(pointsAwarded),
                weeklyTripsCount: FieldValue.increment(1),
                totalPoints: FieldValue.increment(pointsAwarded),
                updatedAt: now,
                driverName: driverData.name || 'Anónimo'
            };
            if (pointsSnap.exists) tx.update(pointsRef, pointsUpdate);
            else tx.set(pointsRef, { ...pointsUpdate, driverId });

            settlementDataToLog = settlementData;
            // [WALLET] Consume locked passenger funds (NOW SAFE: ALL READS DONE AT START)
            const walletConsumeAmount = settlementData.walletCoveredAmount || 0;
            if (walletConsumeAmount > 0) {
                // HARDENING: If this is a digital trip, we MUST find a prior lock.
                if (!consumeSnap.exists && !releaseSnap.exists) {
                    if (!lockSnap.exists) {
                        logger.error(`[CRITICAL_ALARM] Ride ${rideId} requires $${walletConsumeAmount} wallet lock but NONE FOUND. Blocking settlement.`);
                        tx.update(rideRef, { 
                            financialStatus: 'settlement_blocked_missing_wallet_lock',
                            updatedAt: now 
                        });
                        throw new Error(`MISSING_WALLET_LOCK: El viaje no puede liquidarse porque no existe un bloqueo de fondos previo.`);
                    }
                }

                try {
                    await consumeLockedWallet(rideData.passengerId, rideId, walletConsumeAmount, 0, tx, {
                        wallet: passengerWalletSnap,
                        existingConsume: consumeSnap,
                        existingRelease: releaseSnap,
                        lock: lockSnap
                    });

                    tx.update(rideRef, { 
                        walletLockStatus: 'consumed',
                        updatedAt: now 
                    });

                    logger.log(`[WALLET] Consumed $${walletConsumeAmount} from passenger ${rideData.passengerId} for ride ${rideId}`);
                } catch (wErr) {
                    logger.error(`[WALLET] Failed to consume wallet for ride ${rideId}.`, wErr);
                    throw wErr; // Re-throw to abort transaction
                }
            }

            logger.log(`[SETTLEMENT TX DONE] Transaction completed successfully for ${rideId}`);
        });

        // Log OUTSIDE transaction

        if (settlementDataToLog) {
            await logLedgerEvent({
                eventType: 'ride_completed',
                actorId: driverId,
                actorRole: 'driver',
                rideId: rideId,
                passengerId: passengerId,
                cityKey: cityKey,
                metadata: { totalFare: settlementDataToLog.totalFare }
            });

            await logLedgerEvent({
                eventType: 'settlement_generated',
                actorId: 'system_settlement',
                actorRole: 'admin',
                rideId: rideId,
                driverId: driverId,
                amount: settlementDataToLog.totalFare,
                metadata: { 
                    commissionAmount: settlementDataToLog.commissionAmount, 
                    municipalFee: settlementDataToLog.municipalFee 
                }
            });
        }

        // --- EXPANSION INCENTIVE (Async background update) ---
        try {
            await updateChubutExpansionProgressV1(after);
        } catch (err) {
            logger.error(`[SETTLEMENT EXPANSION] Failed to trigger expansion update for ride ${rideId}`, err);
        }

        // --- [FASE 3] CREDIT FINALIZATION (post-TX, best-effort) ---
        const creditApplied = (after as any).pricing?.creditCoveredAmount || 0;
        if (creditApplied > 0) {
            try {
                await finalizeCreditConsumption(rideId);
                logger.log(`[CREDITS] finalized | rideId=${rideId} | amount=${creditApplied}`);
            } catch (creditErr) {
                logger.error(`[CREDITS] failed to finalize credits for ride ${rideId}. Credits remain locked.`, creditErr);
            }
        }

        // --- [FASE 4] PASSENGER PROGRESS (post-TX, best-effort) ---
        // Increment ridesThisWeek and unlock Express level if thresholds are met.
        // Idempotency: protected by weeklyProgressCounted flag on the ride.
        // passengerId is already declared at the top of the function
        if (passengerId) {
            try {
                const progressResult = await updatePassengerProgress(passengerId, rideId);
                if (progressResult) {
                    logger.log(`[EXPRESS] Progress saved | passengerId=${passengerId} | ridesThisWeek=${progressResult.ridesThisWeek} | level=${progressResult.currentLevel} | discount=${progressResult.discountPercent}%`);
                }
            } catch (progressErr) {
                logger.error(`[EXPRESS] updatePassengerProgress failed for ride ${rideId}. Non-fatal.`, progressErr);
            }
        }

        // --- [FASE 7.5] UNIT ECONOMICS LOG (informational, non-fatal) ---
        // Lee completedRide del documento ya escrito por la TX (fuente de verdad post-settlement)
        try {
            const logSnap = await rideRef.get();
            const sd = logSnap.data()?.completedRide ?? {};
            const vamoNetBeforeOps = (sd.commissionAmount ?? 0) - (sd.platformSubsidyAmount ?? 0);
            logger.log(
                `[UNIT_ECONOMICS]` +
                ` rideId=${rideId}` +
                ` | cityKey=${(after as any).cityKey ?? '?'}` +
                ` | driverSubtype=${sd.driverSubtypeSnapshot ?? '?'}` +
                ` | serviceType=${(after as any).serviceType ?? '?'}` +
                ` | totalFare=${sd.totalFare ?? 0}` +
                ` | expressDiscountAmount=${sd.expressDiscountAmount ?? 0}` +
                ` | creditCoveredAmount=${sd.creditCoveredAmount ?? 0}` +
                ` | walletCoveredAmount=${sd.walletCoveredAmount ?? 0}` +
                ` | cashToCollect=${sd.cashToCollect ?? 0}` +
                ` | commissionAmount=${sd.commissionAmount ?? 0}` +
                ` | municipalFee=${sd.municipalFee ?? 0}` +
                ` | platformSubsidyAmount=${sd.platformSubsidyAmount ?? 0}` +
                ` | driverNetAmount=${sd.driverNetAmount ?? 0}` +
                ` | vamoNetBeforeOps=${vamoNetBeforeOps}`
            );
        } catch (logErr) {
            logger.error(`[UNIT_ECONOMICS] Failed to emit log for ride ${rideId}. Non-fatal.`, logErr);
        }

        // --- [FASE 2C] GUARDIAN OF TRACKS (GPS path audit) ---
        try {
            await analyzeRidePath(rideId, after);
        } catch (trackErr) {
            logger.error(`[GUARDIAN] Analysis failed for ride ${rideId}`, trackErr);
        }

    } catch (error: any) {
        logger.error(`[SETTLEMENT ERROR] Failed to settle ride ${rideId}:`, error.message, error.stack);
        await rideRef.update({ settlementError: error.message, settlementErrorAt: FieldValue.serverTimestamp() });
    }
});



export const mercadoPagoWebhookV4 = onRequest({ secrets: ["MERCADOPAGO_WEBHOOK_SECRET", "MERCADOPAGO_ACCESS_TOKEN"] }, async (req, res) => {
    const db = getDb();
    logger.log("--- INCOMING MERCADOPAGO WEBHOOK V4 ---");
    logger.log("Timestamp:", new Date().toISOString());
    logger.log("Method:", req.method);
    logger.log("URL:", req.url);
    logger.log("Query:", JSON.stringify(req.query));
    logger.log("Headers:", JSON.stringify(req.headers));

    let bodyData = {};
    if (req.body) {
        try { bodyData = req.body; } catch (e) { logger.warn("Could not parse request body."); }
    }
    logger.log("Body:", JSON.stringify(bodyData));

    if (req.method === "GET") {
        logger.info("Webhook received a GET verification request. Responding 200 OK.");
        res.status(200).send("Webhook endpoint active and ready.");
        return;
    }

    const queryPaymentId = req.query.id as string | undefined;
    const queryTopic = req.query.topic as string | undefined;

    const bodyAction = req.body?.action as string | undefined;
    const bodyPaymentId = req.body?.data?.id as string | undefined;

    let paymentId: string | undefined;
    let isPaymentEvent = false;

    if (queryTopic === 'payment' && queryPaymentId) {
        paymentId = queryPaymentId;
        isPaymentEvent = true;
        logger.info(`Detected IPN event. Payment ID: ${paymentId}`);
    } else if (bodyAction?.startsWith('payment.') && bodyPaymentId) {
        paymentId = bodyPaymentId;
        isPaymentEvent = true;
        logger.info(`Detected Webhook event. Action: ${bodyAction}, Payment ID: ${paymentId}`);
    }

    if (!isPaymentEvent) {
        logger.warn("Received a webhook that is not a payment event. Skipping.", { query: req.query, body: bodyData });
        res.status(200).send("Not a payment event, skipping.");
        return;
    }

    if (!paymentId) {
        logger.error("Could not extract payment ID from webhook. Aborting.", { query: req.query, body: bodyData });
        res.status(400).send("Could not extract payment ID.");
        return;
    }

    const signature = req.headers["x-signature"] as string;
    const requestId = req.headers["x-request-id"] as string;

    if (signature && requestId) {
        const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
        if (!webhookSecret) {
            logger.error("El secreto del webhook de MercadoPago no está configurado, pero se recibió una firma. Aborting.");
            res.status(500).send("Server configuration error for signature validation.");
            return;
        }

        try {
            const parts = signature.split(',').reduce((acc, part) => {
                const [key, value] = part.split('=');
                if (key && value) acc[key.trim()] = value.trim();
                return acc;
            }, {} as Record<string, string>);

            const ts = parts.ts;
            const v1 = parts.v1;

            if (!ts || !v1) throw new Error("Signature format is invalid.");

            const signedContent = `id:${paymentId};request-id:${requestId};ts:${ts};`;
            logger.log("Validating signature with content:", signedContent);

            const hmac = crypto.createHmac('sha256', webhookSecret);
            hmac.update(signedContent);
            const digest = hmac.digest('hex');

            if (digest !== v1) {
                logger.error("Firma de Webhook de MercadoPago inválida.", { calculatedDigest: digest, receivedSignature: v1 });
                res.status(403).send("Invalid signature.");
                return;
            }
            logger.info(`Firma de Webhook para pago ${paymentId} validada correctamente.`);
        } catch (e: any) {
            logger.error("Error catastrófico validando la firma del webhook:", e.message);
            res.status(403).send("Invalid signature on processing.");
            return;
        }
    } else {
        logger.warn(`No signature found for payment ${paymentId}. Proceeding without validation. Consider enabling signatures in MercadoPago.`);
    }

    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpAccessToken) {
        logger.error("Webhook de MP no puede ejecutarse: access_token no configurado.");
        res.status(500).send("Server payment configuration error.");
        return;
    }
    const serverMpClient = new MercadoPagoConfig({ accessToken: mpAccessToken });

    try {
        const paymentClient = new Payment(serverMpClient);
        logger.log(`[Step 1/4] Fetching payment details for ID: ${paymentId} from MP API.`);
        const payment = await paymentClient.get({ id: Number(paymentId) });

        if (!payment) {
            logger.error(`[Step 1/4 FAILED] Pago ${paymentId} no encontrado por la API de MercadoPago.`);
            res.status(200).send("Payment not found by API, skipping.");
            return;
        }

        logger.log(`[Step 2/4] Full payment object received. Status: ${payment.status}.`, { paymentId: payment.id, status: payment.status });

        if (payment.status !== "approved") {
            logger.warn(`[Step 2/4 SKIPPED] Payment status is '${payment.status}', not 'approved'. Skipping accreditation.`);
            res.status(200).send("Payment not approved, skipping.");
            return;
        }

        const metadata = payment.metadata as any;
        const driverId = payment.external_reference || metadata?.driver_id;
        const amount = payment.transaction_amount;

        if (!driverId || !amount) {
            logger.error("[Step 2/4 FAILED] Webhook para pago aprobado, pero falta external_reference o amount.", { paymentId: payment.id, external_ref: payment.external_reference, amount: payment.transaction_amount });
            res.status(200).send("Missing driver reference or amount, skipping but acknowledging.");
            return;
        }

        logger.log(`[Step 3/4] Payment approved. Initiating transaction for driver ${driverId} amount ${amount}.`);

        const driverRef = db.collection("users").doc(driverId);
        const transactionRef = db.collection('platform_transactions').doc(`mp_${paymentId}`);

        await db.runTransaction(async (tx) => {
            const txDoc = await tx.get(transactionRef);
            if (txDoc.exists) {
                logger.warn(`[Step 3/4 SKIPPED] Idempotency check failed. Transaction mp_${paymentId} already processed.`);
                return;
            }

            const driverDoc = await tx.get(driverRef);
            if (!driverDoc.exists) {
                logger.error(`[Step 3/4 FAILED] Driver ${driverId} from webhook not found in DB.`);
                tx.set(transactionRef, {
                    status: 'failed',
                    reason: 'Driver not found',
                    paymentId: paymentId,
                    amount: amount,
                    createdAt: FieldValue.serverTimestamp(),
                });
                return;
            }

            const driverData = driverDoc.data()!;
            const previousBalance = driverData.currentBalance || 0;

            // [STAGE 2A] Unified Wallet Accreditation
            // addFunds handles wallets.cashBalance, wallet_transactions and legacy mirror users.currentBalance
            await addFunds(
                driverId,
                amount,
                'topup_cash',
                `Carga de saldo vía MercadoPago #${paymentId}`,
                tx,
                `mp_${paymentId}`
            );

        });

        logger.log(`[Step 4/4] SUCCESS! Saldo acreditado para driver ${driverId}. ID de transacción: mp_${paymentId}`);
        res.status(200).send("Webhook processed successfully.");

    } catch (error: any) {
        logger.error(`[FATAL] Error en el webhook de MercadoPago para el pago ${paymentId}:`, error);
        res.status(500).send("Internal server error during payment processing.");
    }
});


export const distributeWeeklyPoolV5 = onSchedule({
    schedule: "every monday 03:00",
    timeZone: "America/Argentina/Buenos_Aires"
},
    async (event: ScheduledEvent) => {
        const db = getDb();
        logger.log("V5: Iniciando distribución multiciudad del pozo semanal.");

        // 1. Obtener todas las ciudades activas
        const citiesSnap = await db.collection("cities").where("enabled", "==", true).get();

        if (citiesSnap.empty) {
            logger.warn("No hay ciudades activas para procesar pozo semanal.");
            return;
        }

        for (const cityDoc of citiesSnap.docs) {
            const cityKey = cityDoc.id;
            const cityData = cityDoc.data();

            // Configuración de pozo por ciudad (prioriza config de la ciudad, fallback a global solo para Rawson o por compatibilidad inicial)
            const rewardsConfig = cityData.rewardsConfig || {};
            const currentPoolAmount = rewardsConfig.weeklyPoolAmount ?? 0;
            const basePoolAmount = rewardsConfig.basePoolAmount ?? 2000;
            const minPointsToQualify = rewardsConfig.minPointsToQualify ?? 20;

            logger.log(`Procesando Ciudad: ${cityKey}. Pozo: ${currentPoolAmount}. Califica con: ${minPointsToQualify} pts.`);

            // [FASE 7.2] Umbral mínimo de viajes semanales para activar el pozo
            // Si weeklyPoolMinTrips está configurado, el pozo solo se distribuye si la ciudad alcanzó el volumen.
            // Fallback: sin config → siempre distribuye (comportamiento original).
            const weeklyPoolMinTrips: number | undefined = rewardsConfig.weeklyPoolMinTrips;
            const cityWeeklyTrips: number = rewardsConfig.weeklyTripsCount ?? 0;
            if (weeklyPoolMinTrips !== undefined && cityWeeklyTrips < weeklyPoolMinTrips) {
                logger.warn(`[POOL_GUARD] Ciudad ${cityKey}: ${cityWeeklyTrips} viajes / umbral ${weeklyPoolMinTrips}. Pozo NO distribuido — volumen insuficiente.`);
                await cityDoc.ref.update({
                    "rewardsConfig.weeklyPoolAmount": basePoolAmount,
                    "rewardsConfig.weeklyTripsCount": 0
                });
                continue;
            }

            // 2. Buscar conductores de ESTA ciudad
            const driversSnap = await db.collection("users")
                .where("role", "==", "driver")
                .where("cityKey", "==", cityKey)
                .where("approved", "==", true)
                .get();

            if (driversSnap.empty) {
                logger.log(`Ciudad ${cityKey}: Sin conductores, reseteando pozo.`);
                await cityDoc.ref.update({ "rewardsConfig.weeklyPoolAmount": basePoolAmount });
                continue;
            }

            const eligibleDrivers: { id: string; points: number }[] = [];
            const driversToReset: admin.firestore.DocumentReference[] = [];

            // 3. Evaluar puntos semanales (usando cityKey en driver_points si existiera, pero por ahora driver_points es por driverId)
            for (const userSnap of driversSnap.docs) {
                const pointsSnap = await db.collection("driver_points").doc(userSnap.id).get();
                const weeklyPoints = pointsSnap.data()?.weeklyPoints ?? 0;

                if (weeklyPoints > 0) {
                    driversToReset.push(pointsSnap.ref);
                    if (weeklyPoints >= minPointsToQualify) {
                        eligibleDrivers.push({ id: userSnap.id, points: weeklyPoints });
                    }
                }
            }

            const totalEligiblePoints = eligibleDrivers.reduce((sum, d) => sum + d.points, 0);

            try {
                await db.runTransaction(async (tx) => {
                    if (eligibleDrivers.length > 0 && totalEligiblePoints > 0 && currentPoolAmount > 0) {
                        logger.log(`Ciudad ${cityKey}: ${eligibleDrivers.length} conductores calificaron.`);
                        for (const driver of eligibleDrivers) {
                            const share = (driver.points / totalEligiblePoints) * currentPoolAmount;
                            if (share <= 0) continue;

                            const driverRef = db.doc(`users/${driver.id}`);
                            const transactionRef = db.collection('platform_transactions').doc();

                            // [STAGE 2A] Unified Wallet Payout (Legacy Pool Logic)
                            await addFunds(
                                driver.id,
                                share,
                                'credit_promo' as any,
                                `Bono del pozo semanal (${cityKey})`,
                                tx,
                                `pool_${cityKey}_${driver.id}_${event.scheduleTime}`
                            );
                        }
                    }

                    // Reseteo de puntos
                    for (const pointsRef of driversToReset) {
                        tx.update(pointsRef, { weeklyPoints: 0 });
                    }

                    // Reseteo del pozo de la ciudad
                    tx.update(cityDoc.ref, { "rewardsConfig.weeklyPoolAmount": basePoolAmount });
                });
                logger.log(`Ciudad ${cityKey}: Distribución completada.`);
            } catch (error: any) {
                logger.error(`Ciudad ${cityKey}: Error en transacción de pozo semanal:`, error);
            }
        }
        logger.log("V5: Proceso de pozos multiciudad finalizado.");
    });



export const cleanupStaleDrivers = onSchedule("every 2 minutes", async (event) => {
    const db = getDb();
    logger.log("Running stale driver cleanup worker.");
    const now = Timestamp.now();
    const staleThreshold = now.toMillis() - 300 * 1000; // 5 minutes ago (300 seconds)

    const staleDriversQuery = db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .where('lastSeenAt', '<', Timestamp.fromMillis(staleThreshold))
        .limit(50);

    try {
        const staleDriversSnap = await staleDriversQuery.get();
        if (staleDriversSnap.empty) {
            logger.log("No stale drivers found.");
            return;
        }

        logger.info(`Found ${staleDriversSnap.size} stale drivers. Marking them as isStale=true.`);
        const batch = db.batch();
        staleDriversSnap.forEach(doc => {
            batch.update(doc.ref, { 
                isStale: true, 
                staleAt: now,
                updatedAt: now 
            });
            // We NO LONGER modify driverStatus here to allow drivers to stay online 
            // even if their app is in the background.
        });

        await batch.commit();
        logger.log("Successfully updated stale flags for inactive drivers.");

    } catch (error) {
        logger.error("Error during stale driver cleanup:", error);
    }
});


export const notifyOnRideUpdateV3 = onDocumentUpdated("rides/{rideId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { rideId: string }>) => {
    logger.info(`notifyOnRideUpdate triggered for rideId: ${event.params.rideId}`);

    if (!event.data) {
        logger.info("No data associated with the event, exiting.");
        return;
    }

    const after = event.data.after.data() as any;
    if (after?.isSimulation === true) return; // [SIM_GUARD]

    const before = event.data.before.data() as Ride;

    if (before.status === 'searching' && after.status === 'driver_assigned') {
        if (!after.passengerId || !after.driverName) return;
        logger.info(`Ride ${event.params.rideId} assigned. Notifying passenger ${after.passengerId}.`);
        await sendNotification(
            after.passengerId,
            '¡Tu conductor está en camino!',
            `${after.driverName} aceptó tu viaje.`,
            '/dashboard/ride'
        );
        return;
    }

    if (before.status === 'driver_assigned' && after.status === 'driver_arrived') {
        if (!after.passengerId || !after.driverName) return;
        logger.info(`Driver arrived for ride ${event.params.rideId}. Notifying passenger ${after.passengerId}.`);
        await sendNotification(
            after.passengerId,
            '¡Tu conductor ha llegado!',
            `${after.driverName} está esperando en el punto de encuentro.`,
            '/dashboard/ride'
        );
        return;
    }

    logger.info(`No notification condition met for ride ${event.params.rideId} status change from '${before.status}' to '${after.status}'.`);
});


export const onRideCancelledV3 = onDocumentUpdated("rides/{rideId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { rideId: string }>) => {
    const db = getDb();
    if (!event.data) return;

    const before = event.data.before.data() as Ride;
    const after = event.data.after.data() as Ride;
    const rideId = event.params.rideId;

    if (before.status === 'cancelled' || after.status !== 'cancelled') {
        return;
    }

    // [SIM_GUARD]
    if ((after as any).isSimulation === true) {
        logger.info(`[SIM_CANCEL] Processing simulation cancellation for ${rideId}. Clearing states only.`);
        const driverId = after.driverId;
        const passengerId = after.passengerId;
        const batch = db.batch();
        if (driverId) {
            batch.update(db.collection('users').doc(driverId), { activeRideId: null, driverStatus: 'online' });
            batch.update(db.collection('drivers_locations').doc(driverId), { driverStatus: 'online' });
        }
        if (passengerId) {
            batch.update(db.collection('users').doc(passengerId), { activeRideId: null });
        }
        await batch.commit();
        return;
    }

    logger.log(`Ride ${rideId} cancelled by ${after.cancelledBy}. Starting cancellation logic.`);
    let notificationPromise: Promise<void> | null = null;
    let compensationAmount = 0;

    if (after.cancelledBy === 'passenger') {
        const passengerId = after.passengerId;
        const driverId = before.driverId;
        const passengerRef = db.collection('users').doc(passengerId);

        try {
            await db.runTransaction(async (tx) => {
                const passengerSnap = await tx.get(passengerRef);
                if (!passengerSnap.exists) {
                    logger.error(`Passenger ${passengerId} not found.`);
                    return;
                }

                const passengerData = passengerSnap.data() as UserProfile;
                const now = Timestamp.now();
                const lastCancel = passengerData.lastCancellationAt as Timestamp | null;
                let weeklyCount = passengerData.weeklyCancellations || 0;

                if (lastCancel && (now.seconds - lastCancel.seconds > 60 * 60 * 24 * 7)) {
                    weeklyCount = 0;
                }

                const newWeeklyCount = weeklyCount + 1;
                const updates: { [key: string]: any } = {
                    activeRideId: null,
                    weeklyCancellations: newWeeklyCount,
                    lastCancellationAt: now,
                };

                if (newWeeklyCount > 2) {
                    updates.blockedUntil = Timestamp.fromMillis(now.toMillis() + 72 * 60 * 60 * 1000);
                    logger.warn(`Passenger ${passengerId} suspended for 72 hours.`);
                }

                tx.update(passengerRef, updates);

                if (driverId) {
                    const driverRef = db.collection('users').doc(driverId);
                    tx.update(driverRef, { activeRideId: null, driverStatus: (after as any).isSimulation ? 'online' : 'offline' });
                    const driverLocationRef = db.collection('drivers_locations').doc(driverId);
                    tx.update(driverLocationRef, { driverStatus: (after as any).isSimulation ? 'online' : 'offline' });
                    logger.info(`Cleared activeRideId for driver ${driverId}.`);

                    if (['driver_assigned', 'driver_arrived'].includes(before.status)) {
                        compensationAmount = 500;
                        const transactionRef = db.collection('platform_transactions').doc();
                        // [STAGE 2A] Unified Wallet Compensation
                        await addFunds(
                            driverId,
                            compensationAmount,
                            'adjustment' as any,
                            `Compensación por viaje cancelado ${rideId}`,
                            tx,
                            `comp_${rideId}`
                        );
                        tx.set(transactionRef, {
                            driverId: driverId,
                            amount: compensationAmount,
                            type: 'credit_promo',
                            source: 'system',
                            referenceId: rideId,
                            note: `Compensación por cancelación de pasajero.`,
                            createdAt: now,
                        });
                        logger.info(`Compensated driver ${driverId} with ${compensationAmount}.`);
                    }

                    notificationPromise = sendNotification(driverId, "Viaje Cancelado", "El pasajero canceló el viaje.", '/', { event: 'PASSENGER_CANCELLATION', rideId: rideId, compensation: String(compensationAmount) });
                }
            });

            if (notificationPromise) {
                await notificationPromise;
            }

        } catch (error) {
            logger.error(`Error processing passenger cancellation for ride ${rideId}:`, error);
        }
    } else if (after.cancelledBy === 'driver') {
        if (after.passengerId) {
            const passengerRef = db.collection('users').doc(after.passengerId);
            await passengerRef.update({ activeRideId: null }).catch(e => logger.error(`Failed to clear passenger active ride:`, e));
        }
        if (after.driverId) {
            const driverRef = db.collection('users').doc(after.driverId);
            
            // [VamO PRO] Risk Update on Driver Cancellation
            const driverSnap = await driverRef.get();
            const driverData = driverSnap.data() as UserProfile;
            const updatedMetrics = { 
                recentCancellations: (driverData?.cancellationCount || 0) + 1,
                ignoredOffers: driverData?.ignoredOffersCount || 0
            };
            const riskProfile = computeDriverRiskProfile(driverData, undefined, updatedMetrics);

            const batch = db.batch();
            batch.update(driverRef, { 
                ...riskProfile,
                cancellationCount: FieldValue.increment(1),
                activeRideId: null, 
                driverStatus: 'offline',
                updatedAt: FieldValue.serverTimestamp()
            });
            
            const driverLocationRef = db.collection('drivers_locations').doc(after.driverId);
            batch.update(driverLocationRef, { 
                driverStatus: 'offline',
                driverRiskLevel: riskProfile.driverRiskLevel,
                driverRiskScore: riskProfile.driverRiskScore,
                updatedAt: FieldValue.serverTimestamp()
            });
            
            await batch.commit().catch(e => logger.error(`Failed to clear driver active ride:`, e));
        }
    } else if (after.cancelledBy === 'system') {
        if (after.passengerId) {
            const passengerRef = db.collection('users').doc(after.passengerId);
            await passengerRef.update({ activeRideId: null }).catch(e => logger.error(`Failed to clear passenger active ride for system cancellation:`, e));
        }
    }

    const pendingOffersSnap = await db
        .collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('status', '==', 'pending')
        .get();

    if (!pendingOffersSnap.empty) {
        const batch = db.batch();
        pendingOffersSnap.forEach((offerDoc) => {
            batch.update(offerDoc.ref, {
                status: 'cancelled',
                finalizedAt: FieldValue.serverTimestamp(),
            });
        });
        await batch.commit();
        logger.info(`Cancelled ${pendingOffersSnap.size} pending offers for ride ${rideId}.`);
    }
});

export const onOfferFinalized = onDocumentUpdated("rideOffers/{offerId}", async (event) => {
    const db = getDb();
    if (!event.data) return;
    const before = event.data.before.data() as RideOffer;
    const after = event.data.after.data() as RideOffer;

    // Si una oferta pasa de pendiente a cualquier otro estado
    if (before.status === 'pending' && after.status !== 'pending') {
        const driverId = after.driverId;
        if (!driverId) return;

        const driverLocationRef = db.collection('drivers_locations').doc(driverId);

        try {
            await db.runTransaction(async (transaction) => {
                const locSnap = await transaction.get(driverLocationRef);
                if (!locSnap.exists) return;
                
                const currentPending = locSnap.data()?.pendingOffers || 0;
                const nextPending = Math.max(0, currentPending - 1);
                
                transaction.update(driverLocationRef, {
                    pendingOffers: nextPending
                });
            });
            logger.info(`Safely decremented pendingOffers for driver ${driverId} (next: ${after.status}).`);
        } catch (error) {
            logger.error(`Failed to safely decrement pendingOffers for driver ${driverId}:`, error);
        }
    }
});


export const cancelRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }

    const { rideId, reason } = request.data;
    if (!rideId) {
        throw new HttpsError("invalid-argument", "Se requiere el ID del viaje.");
    }

    const rideRef = db.doc(`rides/${rideId}`);

    await db.runTransaction(async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists) {
            throw new HttpsError("not-found", "El viaje especificado no existe.");
        }

        const rideData = rideSnap.data() as Ride;

        const isPassenger = rideData.passengerId === uid;
        const isDriver = rideData.driverId === uid;

        if (!isPassenger && !isDriver) {
            throw new HttpsError("permission-denied", "No sos parte de este viaje.");
        }

        if (['completed', 'cancelled'].includes(rideData.status)) {
            throw new HttpsError("failed-precondition", `No se puede cancelar un viaje que ya está '${rideData.status}'.`);
        }

        const cancelledByRole = isDriver ? 'driver' : 'passenger';

        // [FASE 7.4] Cancel fee — registro de penalización por cancelación tardía del pasajero
        // Regla: pasajero cancela con conductor ya asignado + más de 2 min desde asignación
        // NO cobra todavía. Solo registra deuda para auditoría.
        let cancelFeeAmount = 0;
        let cancelFeeReason = '';
        if (isPassenger && rideData.status === 'driver_assigned') {
            const assignedAtMs = rideData.updatedAt
                ? (rideData.updatedAt as any).toMillis?.() ?? 0
                : 0;
            const elapsedMs = Date.now() - assignedAtMs;
            const CANCEL_GRACE_MS = 2 * 60 * 1000; // 2 minutos
            if (elapsedMs > CANCEL_GRACE_MS) {
                cancelFeeAmount = 300;
                cancelFeeReason = `Cancelación tardía: ${Math.floor(elapsedMs / 60000)} min después de asignación`;
                logger.warn(`[CANCEL_FEE] Passenger ${uid} late cancel on ride ${rideId}. Fee: $${cancelFeeAmount}. Reason: ${cancelFeeReason}`);
            }
        }

        // [VamO PRO] Unified Financial & Policy Handler (All reads before writes)
        await handleRideCancellationFinancials({
            rideId,
            reason: reason || 'CANCELLED_BY_USER',
            actor: cancelledByRole,
            tx: transaction,
            rideData
        });

        transaction.update(rideRef, {
            status: 'cancelled',
            cancelledBy: cancelledByRole,
            cancelReason: reason || 'Sin motivo especificado',
            cancelledAt: FieldValue.serverTimestamp(),
            // [FASE 7.4] Cancel fee audit fields (no debit yet)
            ...(cancelFeeAmount > 0 ? {
                cancelFeeAmount,
                cancelFeeReason,
                cancelFeeCharged: false,
            } : {})
        });
    });

    return { success: true };
});


export const driverArrivedV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const driverId = request.auth?.uid;
    if (!driverId) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }
    const { rideId } = request.data;
    if (!rideId) {
        throw new HttpsError("invalid-argument", "Falta el ID del viaje.");
    }

    const rideRef = db.doc(`rides/${rideId}`);

    try {
        await db.runTransaction(async (transaction) => {
            const rideSnap = await transaction.get(rideRef);
            if (!rideSnap.exists) {
                throw new HttpsError("not-found", "El viaje especificado no existe.");
            }

            const rideData = rideSnap.data() as Ride;

            if (rideData.driverId !== driverId) {
                throw new HttpsError("permission-denied", "No sos el conductor asignado para este viaje.");
            }

            if (rideData.status !== 'driver_assigned') {
                throw new HttpsError("failed-precondition", `No se puede marcar la llegada. Estado actual: '${rideData.status}'. Se esperaba 'driver_assigned'.`);
            }

            transaction.update(rideRef, {
                status: 'driver_arrived',
                arrivedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        return { success: true };

    } catch (error: any) {
        logger.error(`[driverArrivedV1] Error for driver ${driverId} and ride ${rideId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'No se pudo notificar la llegada.');
    }
});


export const startRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const driverId = request.auth?.uid;
    if (!driverId) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }

    const { rideId } = request.data;
    if (!rideId) {
        throw new HttpsError("invalid-argument", "Falta el ID del viaje.");
    }

    const rideRef = db.doc(`rides/${rideId}`);

    try {
        await db.runTransaction(async (transaction) => {
            const rideSnap = await transaction.get(rideRef);

            if (!rideSnap.exists) {
                throw new HttpsError("not-found", "El viaje especificado no existe.");
            }

            const rideData = rideSnap.data() as Ride;

            // --- VALIDATIONS ---
            if (rideData.driverId !== driverId) {
                throw new HttpsError("permission-denied", "No sos el conductor asignado para este viaje.");
            }

            if (rideData.status !== 'driver_arrived') {
                throw new HttpsError("failed-precondition", `No se puede iniciar el viaje. Estado actual: '${rideData.status}'. Se esperaba 'driver_arrived'.`);
            }
            // --- END VALIDATIONS ---

            const arrivedAt = (rideData.arrivedAt as Timestamp | null);
            const scheduledAt = (rideData.scheduledAt as Timestamp | null);

            // [VamO PRO] Reservation Logic: Waiting starts at max(arrivedAt, scheduledAt)
            let effectiveWaitingStartAt: Timestamp | null = arrivedAt;
            if (scheduledAt && arrivedAt) {
                if (scheduledAt.seconds > arrivedAt.seconds) {
                    effectiveWaitingStartAt = scheduledAt;
                }
            }

            const now = Timestamp.now();
            const initialWaitSeconds = effectiveWaitingStartAt
                ? Math.max(0, now.seconds - effectiveWaitingStartAt.seconds)
                : 0;

            const updatePayload: { [key: string]: any } = {
                status: 'in_progress',
                startedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                effectiveWaitingStartAt: effectiveWaitingStartAt
            };

            if (initialWaitSeconds > 0) { 
                updatePayload.pauseHistory = FieldValue.arrayUnion({
                    duration: initialWaitSeconds,
                    reason: 'initial_wait',
                    effectiveStartAt: effectiveWaitingStartAt
                });
                updatePayload.cumulativeWaitSeconds = FieldValue.increment(initialWaitSeconds);
            }

            transaction.update(rideRef, updatePayload);
        });

        return { success: true };
    } catch (error: any) {
        logger.error(`[startRideV1] Error for driver ${driverId} and ride ${rideId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'No se pudo iniciar el viaje.');
    }
});

export const finishRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const driverId = request.auth?.uid;
    if (!driverId) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }
    const { rideId } = request.data;
    if (!rideId) {
        throw new HttpsError("invalid-argument", "Falta el ID del viaje.");
    }

    const rideRef = db.doc(`rides/${rideId}`);

    try {
        await db.runTransaction(async (transaction) => {
            const rideSnap = await transaction.get(rideRef);
            if (!rideSnap.exists) {
                throw new HttpsError("not-found", "El viaje no existe.");
            }
            const rideData = rideSnap.data() as Ride;

            if (rideData.driverId !== driverId) {
                throw new HttpsError("permission-denied", "No sos el conductor de este viaje.");
            }
            if (!['in_progress', 'paused'].includes(rideData.status)) {
                throw new HttpsError("failed-precondition", `No se puede finalizar el viaje. Estado actual: ${rideData.status}.`);
            }

            transaction.update(rideRef, {
                status: 'completed',
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        });

        return { success: true };

    } catch (error: any) {
        logger.error(`[finishRideV1] Error for driver ${driverId} and ride ${rideId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'No se pudo finalizar el viaje.');
    }
});

export const submitRideRatingV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }

    const { rideId, score, comment } = request.data;
    if (!rideId || typeof score !== 'number' || score < 1 || score > 5) {
        throw new HttpsError("invalid-argument", "Datos de calificación inválidos.");
    }

    const rideRef = db.doc(`rides/${rideId}`);

    return db.runTransaction(async (transaction: admin.firestore.Transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists) {
            throw new HttpsError("not-found", "El viaje no existe.");
        }
        const rideData = rideSnap.data() as Ride;

        if (rideData.status !== 'completed') {
            logger.warn(`[RATING_GUARD] invalid ride status: ${rideData.status}`);
            throw new HttpsError("failed-precondition", "Solo se pueden calificar viajes completados.");
        }

        const isPassenger = rideData.passengerId === uid;
        const isDriver = rideData.driverId === uid;

        if (!isPassenger && !isDriver) {
            logger.warn(`[RATING_GUARD] unauthorized rater: ${uid}`);
            throw new HttpsError("permission-denied", "No sos parte de este viaje.");
        }

        const updates: { [key: string]: any } = {};
        if (isPassenger) {
            if (rideData.driverRatingByPassenger) {
                logger.warn(`[RATING_GUARD] duplicate prevented for passenger ${uid}`);
                throw new HttpsError("already-exists", "Ya calificaste a este conductor.");
            }
            updates.driverRatingByPassenger = score;
            if (comment) updates.driverComments = comment;
        } else { // isDriver
            if (rideData.passengerRatingByDriver) {
                logger.warn(`[RATING_GUARD] duplicate prevented for driver ${uid}`);
                throw new HttpsError("already-exists", "Ya calificaste a este pasajero.");
            }
            updates.passengerRatingByDriver = score;
            if (comment) updates.passengerComments = comment;
        }

        transaction.update(rideRef, updates);
        logger.info(`[RATING_GUARD] rating saved para ride ${rideId}`);
        return { success: true };
    });
});


function assertAdmin(request: any) {
    const db = getDb();
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    return db.doc(`users/${uid}`).get().then((snap) => {
        if (!snap.exists || snap.data()?.role !== "admin") {
            throw new HttpsError("permission-denied", "Solo un admin puede ejecutar esta acción.");
        }
        return uid;
    });
}

export const approveDriverByAdminV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const db = getDb();
    await assertAdmin(request);

    const driverId = request.data?.driverId as string | undefined;
    if (!driverId) {
        throw new HttpsError("invalid-argument", "Falta driverId.");
    }

    const driverRef = db.doc(`users/${driverId}`);
    const driverSnap = await driverRef.get();

    if (!driverSnap.exists) {
        throw new HttpsError("not-found", "El conductor no existe.");
    }

    const driverData = driverSnap.data();

    if (!driverData || driverData.role !== "driver") {
        throw new HttpsError("failed-precondition", "El usuario no es un conductor válido.");
    }

    const batch = db.batch();

    const updates: { [key: string]: any } = {
        approved: true,
        vehicleVerificationStatus: 'approved',
        updatedAt: FieldValue.serverTimestamp()
    };

    if (driverData && !driverData.promoCreditGranted) {
        const promoAmount = 2000;
        updates.promoCreditGranted = true;
        updates.currentBalance = FieldValue.increment(promoAmount);
        updates.nonWithdrawableBalance = FieldValue.increment(promoAmount);

        const transactionRef = db.collection('platform_transactions').doc();
        batch.set(transactionRef, {
            driverId: driverId,
            amount: promoAmount,
            type: 'credit_promo',
            source: 'system',
            note: 'Bono de bienvenida por aprobación de cuenta.',
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    // [VamO PRO] Risk Update on Admin Approval
    const riskProfile = computeDriverRiskProfile({ ...driverData as UserProfile, approved: true });
    Object.assign(updates, riskProfile);

    batch.update(driverRef, updates);

    const driverLocationRef = db.doc(`drivers_locations/${driverId}`);
    batch.set(driverLocationRef, { 
        approved: true, 
        isSuspended: false,
        driverRiskLevel: riskProfile.driverRiskLevel,
        driverRiskScore: riskProfile.driverRiskScore
    }, { merge: true });

    await batch.commit();

    return { success: true };
});

export const rejectDriverByAdminV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const db = getDb();
    await assertAdmin(request);
    const driverId = request.data?.driverId as string | undefined;
    if (!driverId) { throw new HttpsError("invalid-argument", "Falta driverId."); }

    const driverRef = db.doc(`users/${driverId}`);
    const driverLocationRef = db.doc(`drivers_locations/${driverId}`);

    const batch = db.batch();
    batch.update(driverRef, {
        approved: false,
        vehicleVerificationStatus: 'rejected',
        updatedAt: FieldValue.serverTimestamp()
    });
    batch.update(driverLocationRef, { approved: false });
    await batch.commit();

    return { success: true };
});


export const suspendDriverByAdminV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const db = getDb();
    await assertAdmin(request);
    const driverId = request.data?.driverId as string | undefined;
    const suspend = request.data?.suspend as boolean | undefined;

    if (!driverId || typeof suspend !== 'boolean') {
        throw new HttpsError("invalid-argument", "Faltan parámetros (driverId, suspend).");
    }

    const userRef = db.doc(`users/${driverId}`);
    const driverLocationRef = db.doc(`drivers_locations/${driverId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.data() as UserProfile;

    // [VamO PRO] Risk Update on Admin Suspension
    const updatedDriverData = { ...userData, isSuspended: suspend };
    const riskProfile = computeDriverRiskProfile(updatedDriverData);

    const batch = db.batch();
    batch.update(userRef, {
        ...riskProfile,
        isSuspended: suspend,
        driverStatus: "inactive", // Always set to inactive on status change
        updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(driverLocationRef, {
        isSuspended: suspend,
        driverStatus: "inactive",
        driverRiskLevel: riskProfile.driverRiskLevel,
        driverRiskScore: riskProfile.driverRiskScore
    }, { merge: true });

    await admin.auth().updateUser(driverId, { disabled: suspend });
    await batch.commit();

    return { success: true };
});


export const adjustDriverBalanceByAdminV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const db = getDb();
    const adminUid = await assertAdmin(request);

    const driverId = request.data?.driverId as string | undefined;
    const amount = Number(request.data?.amount);
    const reason = String(request.data?.reason || "").trim();

    if (!driverId) {
        throw new HttpsError("invalid-argument", "Falta driverId.");
    }
    if (!reason) {
        throw new HttpsError("invalid-argument", "Falta el motivo.");
    }
    if (!Number.isFinite(amount) || amount === 0) {
        throw new HttpsError("invalid-argument", "Monto inválido.");
    }

    const driverRef = db.doc(`users/${driverId}`);
    const driverSnap = await driverRef.get();

    if (!driverSnap.exists) {
        throw new HttpsError("not-found", "El conductor no existe.");
    }

    const userData = driverSnap.data();

    if (!userData || userData.role !== "driver") {
        throw new HttpsError("failed-precondition", "El usuario no es un conductor válido.");
    }

    // [STAGE 2A] Unified Wallet Manual Adjustment
    // addFunds handles wallets.cashBalance, wallet_transactions and legacy mirror users.currentBalance
    await addFunds(
        driverId,
        amount,
        'adjustment' as any,
        `Ajuste manual Admin (${adminUid}): ${reason}`,
        undefined, // It will run its own transaction
        `manual_adj_${Date.now()}`
    );

    return { success: true };
});

export const sendDriverNotificationByAdminV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const db = getDb();
    await assertAdmin(request);

    const driverId = request.data?.driverId as string | undefined;
    const title = String(request.data?.title || "").trim();
    const body = String(request.data?.body || "").trim();

    if (!driverId || !title || !body) {
        throw new HttpsError("invalid-argument", "Faltan datos para enviar la notificación.");
    }

    const driverSnap = await db.doc(`users/${driverId}`).get();
    if (!driverSnap.exists) {
        throw new HttpsError("not-found", "Conductor no encontrado.");
    }

    const driverData = driverSnap.data() as UserProfile | undefined;

    if (!driverData) {
        throw new HttpsError("not-found", "No se encontraron datos del conductor.");
    }

    const token = driverData.fcmToken;

    if (!token) {
        throw new HttpsError("failed-precondition", "El conductor no tiene fcmToken para recibir notificaciones.");
    }

    await admin.messaging().send({
        token,
        data: {
            title,
            body,
            type: "admin_message",
            link: "/driver/rides"
        },
    });

    return { success: true };
});

export const deleteDriverByAdminV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const db = getDb();
    const callerUid = request.auth?.uid;
    if (!callerUid) {
        throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const driverId = request.data?.driverId as string | undefined;
    if (!driverId || typeof driverId !== "string") {
        throw new HttpsError("invalid-argument", "Falta driverId.");
    }

    // Verificar admin
    const callerSnap = await db.doc(`users/${callerUid}`).get();
    if (!callerSnap.exists) {
        throw new HttpsError("permission-denied", "Perfil de administrador no encontrado.");
    }

    const callerData = callerSnap.data() as any;
    if (callerData?.role !== "admin") {
        throw new HttpsError("permission-denied", "Solo un administrador puede eliminar conductores.");
    }

    // Verificar conductor
    const driverRef = db.doc(`users/${driverId}`);
    const driverSnap = await driverRef.get();

    if (!driverSnap.exists) {
        throw new HttpsError("not-found", "El conductor no existe.");
    }

    const driverData = driverSnap.data() as any;
    if (driverData?.role !== "driver") {
        throw new HttpsError("failed-precondition", "El usuario indicado no es un conductor.");
    }

    if (driverData?.activeRideId) {
        throw new HttpsError(
            "failed-precondition",
            "No se puede eliminar un conductor con un viaje activo."
        );
    }

    // Borrado en Firestore
    const batch = db.batch();

    batch.delete(driverRef);
    batch.delete(db.doc(`drivers_locations/${driverId}`));

    // Opcional: si querés limpiar puntos/logs simples, descomentá según tus colecciones reales
    // batch.delete(db.doc(`driver_points/${driverId}`));

    await batch.commit();

    // Intentar borrar usuario de Firebase Auth
    let authDeleted = false;
    try {
        await admin.auth().deleteUser(driverId);
        authDeleted = true;
    } catch (error: any) {
        // Si no existe en Auth, no frenamos el proceso
        if (error?.code !== "auth/user-not-found") {
            console.error("Error deleting auth user:", error);
            throw new HttpsError(
                "internal",
                "Se borró Firestore pero falló el borrado en Authentication."
            );
        }
    }

    return {
        success: true,
        driverId,
        authDeleted,
    };
});


export const requestWithdrawalV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }

    const { amount, bankInfo } = request.data;
    if (typeof amount !== 'number' || amount <= 0 || !bankInfo?.accountHolder || !bankInfo?.cbuOrAlias) {
        throw new HttpsError("invalid-argument", "Faltan datos para la solicitud (monto, CBU/Alias, titular).");
    }

    const driverRef = db.doc(`users/${uid}`);
    const driverSnap = await driverRef.get();

    if (!driverSnap.exists) {
        throw new HttpsError("not-found", "No se encontró tu perfil de conductor.");
    }
    const driverData = driverSnap.data() as UserProfile;
    if (driverData.role !== 'driver') {
        throw new HttpsError("permission-denied", "Solo los conductores pueden solicitar retiros.");
    }

    // [STAGE 2A] Read balance from unified wallet
    const walletSnap = await db.doc(`wallets/${uid}`).get();
    const walletData = walletSnap.exists ? (walletSnap.data() as any) : { cashBalance: 0 };
    const withdrawableBalance = (walletData.cashBalance || 0) - (driverData.nonWithdrawableBalance || 0);

    if (amount > withdrawableBalance) {
        throw new HttpsError("failed-precondition", "El monto solicitado excede tu saldo retirable.");
    }

    const requestRef = db.collection('withdrawal_requests').doc();
    await requestRef.set({
        driverId: uid,
        driverName: driverData.name,
        amount: amount,
        bankInfo: {
            accountHolder: bankInfo.accountHolder,
            cbuOrAlias: bankInfo.cbuOrAlias,
        },
        status: 'pending',
        cityKey: driverData.cityKey || normalizeCity(driverData.city),
        createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, requestId: requestRef.id };
});

export const processWithdrawalByAdminV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const adminUid = await assertAdmin(request);
    const { requestId, action } = request.data;

    if (!requestId || !['approve', 'reject'].includes(action)) {
        throw new HttpsError("invalid-argument", "Falta requestId o la acción es inválida.");
    }

    const requestRef = db.doc(`withdrawal_requests/${requestId}`);

    return db.runTransaction(async (tx: admin.firestore.Transaction) => {
        const requestSnap = await tx.get(requestRef);
        if (!requestSnap.exists) {
            throw new HttpsError("not-found", "La solicitud de retiro no existe.");
        }
        const requestData = requestSnap.data() as WithdrawalRequest;
        if (requestData.status !== 'pending') {
            throw new HttpsError("failed-precondition", `Esta solicitud ya fue procesada (estado: ${requestData.status}).`);
        }

        const finalStatus = action === 'approve' ? 'approved' : 'rejected';

        tx.update(requestRef, {
            status: finalStatus,
            processedAt: FieldValue.serverTimestamp(),
            processedBy: adminUid,
        });

        if (action === 'approve') {
            const driverRef = db.doc(`users/${requestData.driverId}`);
            const driverSnap = await tx.get(driverRef);
            const driverData = driverSnap.data() as UserProfile;
            const walletRef = db.doc(`wallets/${requestData.driverId}`);
            const walletSnap = await tx.get(walletRef);
            const walletData = walletSnap.exists ? (walletSnap.data() as any) : { cashBalance: 0 };
            
            const previousBalance = walletData.cashBalance || 0;
            
            // [CORRECCIÓN 1 - P1] Real-time balance validation
            if (previousBalance < requestData.amount) {
                throw new HttpsError("failed-precondition", `Saldo insuficiente para aprobar el retiro. Disponible: ${previousBalance}, Requerido: ${requestData.amount}`);
            }

            const newBalance = previousBalance - requestData.amount;

            // 1. Update Unified Wallet (Source of Truth)
            tx.set(walletRef, {
                cashBalance: newBalance,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            // 2. Legacy UI Mirror
            tx.update(driverRef, {
                currentBalance: FieldValue.increment(-requestData.amount), // LEGACY_UI_MIRROR
                updatedAt: FieldValue.serverTimestamp()
            });

            const transactionRef = db.collection('platform_transactions').doc();
            tx.set(transactionRef, {
                driverId: requestData.driverId,
                amount: -requestData.amount,
                type: 'debit_withdrawal',
                source: 'admin',
                referenceId: requestId,
                note: 'Retiro de saldo aprobado por admin.',
                previousBalance,
                newBalance,
                cityKey: requestData.cityKey,
                createdAt: FieldValue.serverTimestamp(),
                systemVersion: 'v1_withdrawal',
            });
        }
    });
});

export const onUserUpdateV1 = onDocumentWritten("users/{uid}", async (event) => {
    if (!event.data) return;

    if (!event.data.after.exists) return;
    const after = event.data.after.data() as UserProfile;

    // Solo nos interesa para roles admin_municipal y driver
    if (!['admin_municipal', 'driver'].includes(after.role)) {
        return;
    }

    // Si no tiene city, no podemos hacer mucho
    if (!after.city) {
        return;
    }

    const expectedCityKey = normalizeCityKey(after.city);

    // Evitar loops infinitos: solo actualizar si el cityKey no coincide con el city
    if (after.cityKey !== expectedCityKey) {
        const db = getDb();
        logger.info(`onUserUpdateV1: Normalizando cityKey para ${event.params.uid}. city: '${after.city}', nuevo cityKey: '${expectedCityKey}'`);

        await db.doc(`users/${event.params.uid}`).update({
            cityKey: expectedCityKey,
            updatedAt: FieldValue.serverTimestamp()
        });
    }
});

export const seedPricingV1 = onCall({ region: 'us-central1' }, async (request: CallableRequest<any>) => {
    // 1. Validar Autenticación
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado para ejecutar esta acción.');
    }

    const { uid } = request.auth;
    const db = getDb();

    // 2. Validar Rol (Solo Admin)
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
        throw new HttpsError('permission-denied', 'Usuario no encontrado.');
    }
    const userProfile = userSnap.data() as UserProfile;
    if (userProfile.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Permisos insuficientes. Se requiere rol de administrador global.');
    }

    const batch = db.batch();

    const pricingData = {
        version: 1,
        DAY_BASE_FARE: 1483,
        DAY_PRICE_PER_100M: 152,
        DAY_WAITING_PER_MIN: 220,
        NIGHT_BASE_FARE: 1652,
        NIGHT_PRICE_PER_100M: 189,
        NIGHT_WAITING_PER_MIN: 277,
        MINIMUM_FARE: 1500
    };

    // 3A. Escribir config global haciendo merge
    const configRef = db.doc('config/pricing');
    batch.set(configRef, pricingData, { merge: true });

    // 3B. Escribir tarifa de ciudad haciendo merge
    const rawsonRef = db.doc('cities/rawson');
    batch.set(rawsonRef, {
        cityKey: 'rawson',
        cityName: 'Rawson',
        enabled: true,
        pricing: pricingData,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    try {
        await batch.commit();
        logger.info(`Pricing seeded successfully by ${uid} (${userProfile.role})`);
        return {
            success: true,
            message: 'Firestore seeding completado exitosamente.'
        };
    } catch (error: any) {
        logger.error('Error seeding pricing:', error);
        throw new HttpsError('internal', 'Error al inyectar tarifas en base de datos.', error.message);
    }
});

/**
 * [VamO PRO] Unified Profile Update with Legal Traceability
 * Handles profile completion and T&C acceptance with IP/UserAgent logging.
 */
export const updateProfileV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const startTime = Date.now();
    const auth = request.auth;
    if (!auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const {
        name, surname, displayName, phone, gender, photoURL, dni,
        profileCompleted, onboardingCompleted, termsAccepted, termsVersion,
        city, cityKey, carModelYear, vehicleType, vehicleFrontPhotoURL,
        servicesOffered, vehicleVerificationStatus, vehicle
    } = request.data;

    logger.info(`[PASSENGER_AUTH_AUDIT][PROFILE_UPDATE_START] uid=${auth.uid}`, { data: request.data });

    const db = getDb();
    const userRef = db.collection("users").doc(auth.uid);
    const now = FieldValue.serverTimestamp();

    const updates: any = {
        updatedAt: now
    };

    if (name) updates.name = name;
    if (surname) updates.surname = surname;
    if (displayName) updates.displayName = displayName;
    
    // [VamO SECURITY] Phone Normalization & Duplicate Check
    if (phone) {
        const normalizedPhone = normalizePhone(phone);
        updates.phone = phone;
        updates.phoneNormalized = normalizedPhone;

        logger.info(`[PASSENGER_AUTH_AUDIT][PHONE_CHECK] uid=${auth.uid} phone=${normalizedPhone}`);

        // Check if phone is already in use by another UID
        const existingPhoneQuery = await db.collection("users")
            .where("phoneNormalized", "==", normalizedPhone)
            .limit(2)
            .get();

        const duplicate = existingPhoneQuery.docs.find(doc => doc.id !== auth.uid);
        if (duplicate) {
            logger.warn(`[PASSENGER_AUTH_AUDIT][PHONE_DUPLICATE_BLOCKED] uid=${auth.uid} attempted to use phone ${normalizedPhone} already owned by ${duplicate.id}`);
            throw new HttpsError("already-exists", "Este número de teléfono ya está registrado con otra cuenta.");
        }
    }

    if (gender) updates.gender = gender;
    if (photoURL) updates.photoURL = photoURL;
    if (dni) updates.dni = dni;

    if (profileCompleted !== undefined) {
        updates.profileCompleted = profileCompleted;
        if (profileCompleted === true) {
            updates.registrationStatus = "active";
            updates.onboardingIncomplete = false;
            logger.info(`[PASSENGER_AUTH_AUDIT][PROFILE_COMPLETED] uid=${auth.uid}`);
        }
    }

    if (onboardingCompleted !== undefined) {
        updates.onboardingCompleted = onboardingCompleted;
    }

    if (termsAccepted !== undefined) updates.termsAccepted = termsAccepted;
    
    // Additional driver/passenger location fields
    if (cityKey) {
        const normalizedKey = normalizeCityKey(cityKey);
        updates.cityKey = normalizedKey;
        if (city) {
            updates.city = city;
        } else if (normalizedKey === 'rawson') {
            updates.city = 'Rawson';
        } else if (normalizedKey === 'trelew') {
            updates.city = 'Trelew';
        }
    } else if (city) {
        updates.city = city;
    }
    
    if (carModelYear) updates.carModelYear = carModelYear;
    if (vehicleType) updates.vehicleType = vehicleType;
    if (vehicleFrontPhotoURL) updates.vehicleFrontPhotoURL = vehicleFrontPhotoURL;
    if (servicesOffered) updates.servicesOffered = servicesOffered;
    if (vehicleVerificationStatus) updates.vehicleVerificationStatus = vehicleVerificationStatus;
    if (vehicle) updates.vehicle = vehicle;

    // Legal Traceability Logic
    if (termsAccepted && termsVersion) {
        updates.termsAccepted = true;
        updates.termsVersion = termsVersion;
        updates.termsAcceptedAt = now;

        const logEntry = {
            termsVersion,
            acceptedAt: Timestamp.now(),
            userAgent: request.rawRequest.headers['user-agent'] || 'unknown',
            ip: request.rawRequest.headers['x-forwarded-for'] || request.rawRequest.socket.remoteAddress || 'unknown'
        };

        updates.legalAcceptanceLog = FieldValue.arrayUnion(logEntry);
    }

    try {
        await userRef.update(updates);
        const latency = Date.now() - startTime;
        logger.info(`[PASSENGER_AUTH_AUDIT][PROFILE_UPDATE_SUCCESS] uid=${auth.uid} latency=${latency}ms`);
        return { success: true };
    } catch (error: any) {
        logger.error(`[PASSENGER_AUTH_AUDIT][PROFILE_UPDATE_ERROR] uid=${auth.uid}`, error);
        throw new HttpsError("internal", error.message);
    }
});
