

'use server';
import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import * as crypto from "crypto";
import { onDocumentUpdated, onDocumentCreated, onDocumentWritten, FirestoreEvent, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { canDriverTakeRide } from "./eligibility";
import { UserProfile, Ride, DriverLevel, ServiceType, RideStatus, CompletedRide, PricingConfig, WithdrawalRequest, WithId, RideOffer, DriverPoints } from "./types";
import { getDb } from "./lib/firebaseAdmin";
import { normalizeCityKey, normalizeCity } from "./lib/city";
import { City, CityStatus } from "./types";
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
 * [VamO PRO] Service Consistency Invariant
 * Ensures professional profiles (Premium) always include 'normal' service.
 */
export function ensureServiceInvariants(profile: UserProfile): any {
    const services = profile.servicesOffered || { premium: false, express: false, normal: false };
    const updates: any = {};

    if (services.premium && !services.normal) {
        updates['servicesOffered.normal'] = true;
    }

    return Object.keys(updates).length > 0 ? updates : null;
}


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
    if (rideData.serviceType === "premium") basePoints = 1;

    return basePoints;
}

function getDriverLevel(points: number): DriverLevel {
    if (points >= 100) return "oro";
    if (points >= 50) return "plata";
    return "bronce";
}


function calculateSettlement(rideData: Ride, driverData: UserProfile, trackingPoints: admin.firestore.DocumentData[], pricing: PricingConfig) {
    const isNight = false; // TODO: Implement night-time logic based on completedAt

    const completedAt = rideData.completedAt as admin.firestore.Timestamp | null;
    const startedAt = rideData.startedAt as admin.firestore.Timestamp | null;

    // A. Durations
    const durationSeconds = completedAt && startedAt
        ? (completedAt.seconds - startedAt.seconds)
        : 0;
    const waitingSeconds = (rideData.pauseHistory || []).reduce((acc, p) => acc + p.duration, 0);

    // B. Distance (NEW: Use real tracking if available)
    let distanceMeters = 0;
    let calculationSource = "backend_v2_haversine_direct"; // Default fallback
    const trackingStats: CompletedRide['trackingStats'] = { totalPoints: 0, validSegments: 0, discardedSegments: 0, maxSpeedDetected: 0, distanceSource: calculationSource };

    if (trackingPoints && trackingPoints.length > 1) {
        trackingStats.totalPoints = trackingPoints.length;

        distanceMeters = trackingPoints.reduce((totalDistance, pointData, index) => {
            if (index === 0) return 0;
            const prevPointData = trackingPoints[index - 1];

            type TrackingPoint = { lat: number; lng: number; timestamp: admin.firestore.Timestamp; accuracy?: number };
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

            if (speedKph > 160) {
                trackingStats.discardedSegments++;
                return totalDistance;
            }
            if (segmentDist < 3) {
                trackingStats.discardedSegments++;
                return totalDistance;
            }
            if ((point.accuracy || 0) > 50) {
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

    // C. Fare Calculation
    const baseFare = isNight ? pricing.NIGHT_BASE_FARE : pricing.DAY_BASE_FARE;
    const pricePer100m = isNight ? pricing.NIGHT_PRICE_PER_100M : pricing.DAY_PRICE_PER_100M;
    const waitingPerMin = isNight ? pricing.NIGHT_WAITING_PER_MIN : pricing.DAY_WAITING_PER_MIN;

    const distanceFare = Math.ceil(distanceMeters / 100) * pricePer100m;
    const waitingFare = Math.ceil(waitingSeconds / 60) * waitingPerMin;
    const subtotal = baseFare + distanceFare + waitingFare;

    let serviceAdjustedSubtotal = subtotal;
    if (rideData.serviceType === 'express') {
        serviceAdjustedSubtotal *= 0.90; // 10% discount for Express
    }

    const totalFare = Math.ceil(serviceAdjustedSubtotal / 50) * 50;

    // D. Commission Calculation (SIMPLIFIED)
    // We calculate commission BEFORE adding the F.A.P. fee to be fair to the driver.
    const finalCommissionRate = 0.08; // Flat 8% commission for all rides.
    const commissionAmount = totalFare * finalCommissionRate;

    // --- BLOQUE 6: F.A.P. FEE (+400 for Express) ---
    let finalTotalFare = totalFare;
    let fapFee = 0;
    if (rideData.serviceType === 'express') {
        finalTotalFare += 400;
        fapFee = 400;
    }

    const settlement: Omit<CompletedRide, 'calculatedAt' | 'pointsAwarded'> = {
        pricingVersion: pricing.version,
        calculationSource,
        distanceMeters,
        durationSeconds,
        waitingSeconds,
        baseFare,
        distanceFare,
        waitingFare,
        totalFare: finalTotalFare,
        fapFee,
        baseCommissionRate: finalCommissionRate,
        finalCommissionRate,
        commissionAmount,
        trackingStats,
    };
    return settlement;
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


export const onRideSettlementV6 = onDocumentUpdated("rides/{rideId}", async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { rideId: string }>) => {
    const db = getDb();
    const rideId = event.params.rideId;

    if (!event.data) {
        logger.info(`onRideSettlementV6 for ${rideId}: no event data found.`);
        return;
    }

    const before = event.data.before.data() as Ride;
    const after = event.data.after.data() as Ride;

    if (!before || !after) {
        logger.info(`onRideSettlementV6 for ${rideId}: no before/after data found.`);
        return;
    }

    if (before.status === 'completed' || after.status !== 'completed') {
        return;
    }

    if (after.settledAt) {
        logger.info(`[SETTLEMENT_GUARD] already settled. Ride ${rideId}. Skipping.`);
        return;
    }

    const driverId = after.driverId;
    const passengerId = after.passengerId;

    if (!driverId || !passengerId) {
        logger.error(`Ride ${rideId} completed without a driverId or passengerId. Cannot process settlement.`);
        return;
    }

    logger.log(`Ride ${rideId} completed. Starting settlement process for driver ${driverId} and passenger ${passengerId}.`);

    const rideRef = db.collection('rides').doc(rideId);
    const driverRef = db.collection('users').doc(driverId);
    const passengerRef = db.collection('users').doc(passengerId);
    const driverLocationRef = db.collection('drivers_locations').doc(driverId);
    const transactionRef = db.collection('platform_transactions').doc(); // Ledger record
    const pointsRef = db.collection('driver_points').doc(driverId);

    try {
        const trackingSnapshot = await rideRef.collection('tracking').orderBy('timestamp', 'asc').get();
        const trackingPoints = trackingSnapshot.docs.map(doc => doc.data());

        const cityKey = after.cityKey;
        if (!cityKey) {
            logger.error(`Ride ${rideId} missing cityKey. Settlement ABORTED.`);
            return;
        }

        const pricingConfig = await getPricingConfig(cityKey);

        await db.runTransaction(async (tx) => {
            const driverSnap = await tx.get(driverRef);
            const rideSnap = await tx.get(rideRef);
            const pointsSnap = await tx.get(pointsRef);

            if (!driverSnap.exists) throw new Error(`Driver ${driverId} not found.`);
            if (!rideSnap.exists) throw new Error(`Ride ${rideId} not found.`);

            const rideData = rideSnap.data() as Ride;

            if (rideData.settledAt) {
                logger.info(`[SETTLEMENT_GUARD] already settled in tx. Ride ${rideId} was settled by another process. Skipping.`);
                return;
            }

            const driverData = driverSnap.data() as UserProfile;
            if (!driverData) throw new Error(`Driver data for ${driverId} is missing.`);

            const previousBalance = driverData.currentBalance || 0;

            const settlementData = calculateSettlement(rideData, driverData, trackingPoints, pricingConfig);
            const { commissionAmount } = settlementData;
            const pointsAwarded = calculatePointsAwarded(driverData, rideData);

            const completedRideObject: CompletedRide = {
                ...settlementData,
                pointsAwarded,
                calculatedAt: admin.firestore.Timestamp.now(),
            };

            const newBalance = previousBalance - commissionAmount;

            tx.update(rideRef, {
                completedRide: completedRideObject,
                settledAt: admin.firestore.FieldValue.serverTimestamp()
            });

            tx.set(transactionRef, {
                driverId: driverId,
                rideId: rideId,
                amount: -commissionAmount, // NEGATIVE because it's a debit.
                type: 'commission_debit',
                note: `Comisión por viaje a ${rideData.destination.address}`,
                previousBalance: previousBalance,
                newBalance: newBalance,
                cityKey: cityKey,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                systemVersion: 'v5_simple_commission',
            });

            // --- BLOQUE 6: F.A.P. ASSISTANCE CONTRIBUTION ---
            if (rideData.serviceType === 'express') {
                const fapTransactionRef = db.collection('platform_transactions').doc();
                const fapAmount = 400;
                tx.set(fapTransactionRef, {
                    rideId,
                    driverId,
                    passengerId,
                    amount: -fapAmount,
                    type: 'assistance_contribution',
                    reason: 'assistance_contribution',
                    note: 'Aporte al Fondo de Asistencia VamO (F.A.P.) por viaje Express',
                    previousBalance: newBalance,
                    newBalance: newBalance - fapAmount,
                    cityKey: cityKey,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    systemVersion: 'v5_fap_integration',
                });
                tx.update(driverRef, { currentBalance: newBalance - fapAmount });
            }

            // --- REWARD POINTS & LEVEL UP LOGIC ---
            const currentPoints = driverData.rewardPoints || 0;
            const newPoints = currentPoints + pointsAwarded;
            const newLevel = getDriverLevel(newPoints);

            const now = admin.firestore.FieldValue.serverTimestamp();

            logger.info(`[SETTLEMENT_GUARD] keeping driver online. Finalizing settlement.`);
            tx.update(driverRef, {
                activeRideId: null, // CLEAR ACTIVE RIDE
                currentBalance: newBalance,
                'stats.ridesCompleted': admin.firestore.FieldValue.increment(1),
                driverStatus: 'online',
                updatedAt: now,
                lastRideCompletedAt: now,
                rewardPoints: newPoints,
                driverLevel: newLevel,
            });

            tx.update(passengerRef, {
                activeRideId: null, // CLEAR ACTIVE RIDE
                updatedAt: now,
            });

            tx.update(driverLocationRef, {
                driverStatus: 'online',
                updatedAt: now,
            });

            // --- WEEKLY POINTS LOGIC ---
            if (pointsAwarded > 0) {
                if (pointsSnap.exists) {
                    tx.update(pointsRef, {
                        weeklyPoints: admin.firestore.FieldValue.increment(pointsAwarded),
                        totalPoints: admin.firestore.FieldValue.increment(pointsAwarded),
                        updatedAt: now
                    });
                } else {
                    tx.set(pointsRef, {
                        weeklyPoints: pointsAwarded,
                        totalPoints: pointsAwarded,
                        updatedAt: now
                    });
                }
            }
        });

        logger.info(`[SETTLEMENT_GUARD] final driver state committed for driver ${driverId}`);
        logger.log(`Successfully settled ride ${rideId}.`);

        // --- NEW: Increment the weekly rewards pool ---
        try {
            const settledRideData = (await rideRef.get()).data() as Ride;
            const totalFare = settledRideData.completedRide?.totalFare;
            if (totalFare && totalFare > 0) {
                const poolContribution = totalFare * 0.01; // 1% contribution
                const rewardsRef = db.doc('rewards/rewards');
                await rewardsRef.update({
                    weeklyPoolAmount: admin.firestore.FieldValue.increment(poolContribution)
                });
                logger.info(`Incremented weekly pool by ${poolContribution} from ride ${rideId}.`);
            }
        } catch (poolError: any) {
            logger.error(`Failed to increment weekly pool for ride ${rideId}. Error:`, poolError);
            // This failure is non-critical to the ride settlement, so we just log it.
        }
        // --- END NEW LOGIC ---

    } catch (error: any) {
        logger.error(`Failed to settle ride ${rideId}. Error:`, error);
        await rideRef.update({
            settlementError: error.message || "Unknown settlement error",
        });
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
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }

            const driverData = driverDoc.data()!;
            const previousBalance = driverData.currentBalance || 0;

            tx.update(driverRef, {
                currentBalance: admin.firestore.FieldValue.increment(amount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            tx.set(transactionRef, {
                driverId: driverId,
                amount: amount,
                type: 'credit_payment',
                source: 'mp_topup',
                referenceId: paymentId,
                note: `Carga de saldo vía MercadoPago #${paymentId}`,
                previousBalance: previousBalance,
                newBalance: previousBalance + amount,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                systemVersion: 'v3_webhook_robust',
            });
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

                            tx.update(driverRef, {
                                currentBalance: admin.firestore.FieldValue.increment(share)
                            });

                            tx.set(transactionRef, {
                                driverId: driver.id,
                                amount: share,
                                cityKey: cityKey,
                                type: 'credit_promo',
                                source: 'system',
                                referenceId: `pool_${cityKey}_${event.scheduleTime}`,
                                note: `Bono del pozo semanal (${cityKey}) por ${driver.points} puntos.`,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                systemVersion: 'v5_multicity_pool',
                            });
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
    const now = admin.firestore.Timestamp.now();
    const staleThreshold = now.toMillis() - 90 * 1000; // 90 seconds ago

    const staleDriversQuery = db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .where('lastSeenAt', '<', admin.firestore.Timestamp.fromMillis(staleThreshold))
        .limit(50);

    try {
        const staleDriversSnap = await staleDriversQuery.get();
        if (staleDriversSnap.empty) {
            logger.log("No stale drivers found.");
            return;
        }

        logger.warn(`Found ${staleDriversSnap.size} stale drivers. Setting them to offline.`);

        const batch = db.batch();
        staleDriversSnap.forEach(doc => {
            const driverId = doc.id;
            const userRef = db.collection('users').doc(driverId);
            batch.update(doc.ref, { driverStatus: 'offline', updatedAt: now });
            batch.update(userRef, { driverStatus: 'offline', updatedAt: now });
        });

        await batch.commit();
        logger.log("Successfully cleaned up stale drivers.");

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

    const before = event.data.before.data() as Ride;
    const after = event.data.after.data() as Ride;

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
                const now = admin.firestore.Timestamp.now();
                const lastCancel = passengerData.lastCancellationAt as admin.firestore.Timestamp | null;
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
                    updates.blockedUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + 72 * 60 * 60 * 1000);
                    logger.warn(`Passenger ${passengerId} suspended for 72 hours.`);
                }

                tx.update(passengerRef, updates);

                if (driverId) {
                    const driverRef = db.collection('users').doc(driverId);
                    tx.update(driverRef, { activeRideId: null, driverStatus: 'inactive' });
                    const driverLocationRef = db.collection('drivers_locations').doc(driverId);
                    tx.update(driverLocationRef, { driverStatus: 'inactive' });
                    logger.info(`Cleared activeRideId for driver ${driverId}.`);

                    if (['driver_assigned', 'driver_arrived'].includes(before.status)) {
                        compensationAmount = 500;
                        const transactionRef = db.collection('platform_transactions').doc();
                        tx.update(driverRef, { currentBalance: admin.firestore.FieldValue.increment(compensationAmount) });
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
            await driverRef.update({ activeRideId: null, driverStatus: 'inactive' }).catch(e => logger.error(`Failed to clear driver active ride:`, e));
            const driverLocationRef = db.collection('drivers_locations').doc(after.driverId);
            await driverLocationRef.update({ driverStatus: 'inactive' }).catch(e => logger.error(`Failed to clear driver active ride in locations:`, e));
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
                finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
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
            await driverLocationRef.update({
                pendingOffers: admin.firestore.FieldValue.increment(-1)
            });
            logger.info(`Decremented pendingOffers for driver ${driverId} due to offer ${event.params.offerId} status change to ${after.status}.`);
        } catch (error) {
            logger.error(`Failed to decrement pendingOffers for driver ${driverId}:`, error);
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

        transaction.update(rideRef, {
            status: 'cancelled',
            cancelledBy: cancelledByRole,
            cancelReason: reason || 'Sin motivo especificado',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
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
                arrivedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

            const arrivedAt = rideData.arrivedAt as admin.firestore.Timestamp | null;
            const initialWaitSeconds = arrivedAt
                ? (admin.firestore.Timestamp.now().seconds - arrivedAt.seconds)
                : 0;

            const updatePayload: { [key: string]: any } = {
                status: 'in_progress',
                startedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (initialWaitSeconds > 10) { // Only log significant waits
                updatePayload.pauseHistory = admin.firestore.FieldValue.arrayUnion({
                    duration: initialWaitSeconds,
                    reason: 'initial_wait'
                });
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
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        licenseVerified: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (driverData && !driverData.promoCreditGranted) {
        const promoAmount = 2000;
        updates.promoCreditGranted = true;
        updates.currentBalance = admin.firestore.FieldValue.increment(promoAmount);
        updates.nonWithdrawableBalance = admin.firestore.FieldValue.increment(promoAmount);

        const transactionRef = db.collection('platform_transactions').doc();
        batch.set(transactionRef, {
            driverId: driverId,
            amount: promoAmount,
            type: 'credit_promo',
            source: 'system',
            note: 'Bono de bienvenida por aprobación de cuenta.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    batch.update(driverRef, updates);

    const driverLocationRef = db.doc(`drivers_locations/${driverId}`);
    batch.set(driverLocationRef, { approved: true, isSuspended: false }, { merge: true });

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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

    const batch = db.batch();
    batch.update(userRef, {
        isSuspended: suspend,
        driverStatus: "inactive", // Always set to inactive on status change
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(driverLocationRef, {
        isSuspended: suspend,
        driverStatus: "inactive",
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

    const batch = db.batch();

    const previousBalance = userData.currentBalance || 0;
    const newBalance = previousBalance + amount;

    batch.update(driverRef, {
        currentBalance: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const txRef = db.collection("platform_transactions").doc();
    batch.set(txRef, {
        type: 'admin_balance_adjustment',
        driverId: driverId,
        amount,
        reason,
        previousBalance,
        newBalance,
        createdBy: adminUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

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

    const withdrawableBalance = (driverData.currentBalance || 0) - (driverData.nonWithdrawableBalance || 0);

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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            processedBy: adminUid,
        });

        if (action === 'approve') {
            const driverRef = db.doc(`users/${requestData.driverId}`);
            const driverSnap = await tx.get(driverRef);
            const driverData = driverSnap.data() as UserProfile;
            const previousBalance = driverData.currentBalance || 0;
            const newBalance = previousBalance - requestData.amount;

            tx.update(driverRef, {
                currentBalance: admin.firestore.FieldValue.increment(-requestData.amount),
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
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
    const auth = request.auth;
    if (!auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const {
        name, surname, displayName, phone, gender, photoURL,
        profileCompleted, termsAccepted, termsVersion
    } = request.data;

    const db = getDb();
    const userRef = db.collection("users").doc(auth.uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const updates: any = {
        updatedAt: now
    };

    if (name) updates.name = name;
    if (surname) updates.surname = surname;
    if (displayName) updates.displayName = displayName;
    if (phone) updates.phone = phone;
    if (gender) updates.gender = gender;
    if (photoURL) updates.photoURL = photoURL;
    if (profileCompleted !== undefined) updates.profileCompleted = profileCompleted;
    if (termsAccepted !== undefined) updates.termsAccepted = termsAccepted;

    // Legal Traceability Logic
    if (termsAccepted && termsVersion) {
        updates.termsAccepted = true;
        updates.termsVersion = termsVersion;
        updates.termsAcceptedAt = now;

        const logEntry = {
            termsVersion,
            acceptedAt: admin.firestore.Timestamp.now(), // Real-time client timestamp for the log
            userAgent: request.rawRequest.headers['user-agent'] || 'unknown',
            ip: request.rawRequest.headers['x-forwarded-for'] || request.rawRequest.socket.remoteAddress || 'unknown'
        };

        // Push to audit log
        updates.legalAcceptanceLog = admin.firestore.FieldValue.arrayUnion(logEntry);
    }

    try {
        await userRef.update(updates);
        logger.info(`Profile updated for user ${auth.uid} with legal acceptance ${termsVersion}`);
        return { success: true };
    } catch (error: any) {
        logger.error(`Error updating profile for ${auth.uid}:`, error);
        throw new HttpsError("internal", error.message);
    }
});
