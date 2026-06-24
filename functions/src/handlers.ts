

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
import { incrementPassengerPoints } from "./passengerWeeklyPool";
import { getDb } from "./lib/firebaseAdmin";
import { calculateRidePrice } from "./lib/pricing";
import { normalizeCityKey, normalizeCity, canonicalCityKey } from "./lib/city";
import { getArgentinaDateStr } from "./lib/date";
import { City, CityStatus, ExpansionIncentive } from "./types";
import { updateChubutExpansionProgressV1 } from "./expansionIncentives";
import { consumeLockedWallet, addWalletMovements, addFunds, getOrCreateWallet, reverseFunds } from "./lib/wallet";
import { releaseLockedCredits, finalizeCreditConsumption } from "./lib/incentives";
import { handleRideCancellationFinancials } from "./lib/refund";
import { updatePassengerProgress } from "./lib/passengerProgress";
import { emitLedgerEvent } from "./lib/ledger";
import { logLedgerEvent } from "./lib/audit";
import { analyzeRidePath } from "./lib/guardianTracks";
import { computeDriverRiskProfile } from "./lib/driverRisk";
import { normalizePhone } from "./lib/phone";
import { settleSharedRideFinancialsV1 } from "./sharedRides";
import { calculateNewScore, getReputationLevel, DRIVER_SCORE_RULES, PASSENGER_SCORE_RULES } from "./lib/scoring";
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
    const fcmTokens = (userProfile as any)?.fcmTokens || [];

    // Collect and de-duplicate all tokens
    const uniqueTokens = new Set<string>();
    if (fcmToken) uniqueTokens.add(fcmToken);
    fcmTokens.forEach((t: string) => {
        if (t) uniqueTokens.add(t);
    });

    const tokensToSend = Array.from(uniqueTokens);

    if (tokensToSend.length > 0) {
        // Ensure complex data is stringified for transport and sanitize sensitive fields
        const processedData: { [key: string]: string } = {};
        for (const key in additionalData) {
            const lowerKey = key.toLowerCase();
            const sensitiveKeys = ['email', 'phone', 'telefono', 'celular', 'password', 'token', 'secret', 'wallet', 'balance', 'monto', 'price', 'amount', 'cvv', 'card'];
            if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
                processedData[key] = '[REDACTED]';
                continue;
            }

            if (typeof additionalData[key] === 'object') {
                processedData[key] = JSON.stringify(additionalData[key]);
            } else {
                processedData[key] = String(additionalData[key]);
            }
        }

        // Sanitizar emails y teléfonos en el título y el cuerpo del mensaje por seguridad
        const cleanTitle = title.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
        const cleanBody = body.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

        const sendPromises = tokensToSend.map(async (token) => {
            const message = {
                token,
                data: {
                    title: cleanTitle,
                    body: cleanBody,
                    link,
                    ...processedData
                },
            };

            try {
                await admin.messaging().send(message);
                logger.info(`Successfully sent data-only notification to token of user ${userId}.`);
            } catch (error: any) {
                logger.error(`Error sending notification to token of user ${userId}:`, error);
                
                // Clean up stale token if the error indicates it's invalid
                const isInvalid = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code) ||
                                  error.message?.includes('not-registered') ||
                                  error.message?.includes('invalid-registration-token');

                if (isInvalid) {
                    logger.info(`FCM token for user ${userId} is stale/invalid. Removing token: ${token.substring(0, 8)}...`);
                    const updates: { [key: string]: any } = {
                        fcmTokens: FieldValue.arrayRemove(token)
                    };
                    if (fcmToken === token) {
                        updates.fcmToken = null;
                    }
                    await userSnap.ref.update(updates).catch(e => logger.warn(`Failed to clean token for ${userId}`, e));
                }
            }
        });

        await Promise.all(sendPromises);
    } else {
        logger.info(`User ${userId} does not have any FCM tokens. Skipping notification.`);
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

export async function getPricingConfig(cityKey?: string): Promise<PricingConfig> {
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

/**
 * Devuelve los puntos base por viaje según tipo de conductor.
 * Para professional/taxi-remis: bonus adicional si el viaje tiene Tarifa Dinámica.
 * Para express: tarifa dinámica es OBLIGATORIA — no recibe bonus voluntario.
 *
 * Regla:
 *   normal (professional)       → +10 pts
 *   dinámica 1-10% professional → +12 pts totales (no +10+12)
 *   dinámica 11-20%             → +15 pts totales
 *   dinámica 21-30%             → +18 pts totales
 *   express (cualquier caso)    → +3 pts (sin bonus dinámico)
 */
function calculatePointsAwarded(
    driverProfile: UserProfile,
    rideData: Ride
): number {
    const ridesCompleted = driverProfile.stats?.ridesCompleted ?? 0;

    if (rideData.serviceType === 'express') return 3;

    // Professional / taxi-remis
    if (rideData.serviceType === 'professional') {
        const dynamic = (rideData as any).pricing?.dynamic;
        const dynamicApplied: boolean = dynamic?.applied === true;
        const discountPct: number = dynamicApplied
            ? (dynamic?.appliedDiscountPercent ?? dynamic?.configuredDiscountPercent ?? 0)
            : 0;

        if (!dynamicApplied || discountPct <= 0) return 10;   // viaje normal
        if (discountPct <= 10)                    return 12;   // dinámica leve
        if (discountPct <= 20)                    return 15;   // dinámica media
        return 18;                                             // dinámica alta (21-30%)
    }

    return 0;
}

/**
 * Devuelve cuántos viajes dinámicos suman para el multiplicador voluntario.
 * Solo aplica a professional. Express = 0 (dinámica obligatoria).
 */
function getDynamicTripIncrement(rideData: Ride): number {
    if (rideData.serviceType !== 'professional') return 0;
    const dynamic = (rideData as any).pricing?.dynamic;
    if (dynamic?.applied === true) return 1;
    return 0;
}

/**
 * Calcula el multiplicador de Pozo Semanal por Tarifa Dinámica voluntaria.
 * Solo professional/taxi-remis. Express queda excluido.
 * Se aplica a driver_points para lectura posterior del hook.
 */
export function getDynamicPoolMultiplier(weeklyDynamicTripsCount: number): number {
    if (weeklyDynamicTripsCount >= 20) return 1.35;
    if (weeklyDynamicTripsCount >= 10) return 1.20;
    return 1.00;
}


function getDriverLevel(points: number): DriverLevel {
    if (points >= 100) return "oro";
    if (points >= 50) return "plata";
    return "bronce";
}


/**
 * Evalúa dinámicamente si corresponde tarifa nocturna según la configuración de la ciudad.
 */
function evaluateIsNightForCity(date: Date, cityKey: string, pricing: PricingConfig): boolean {
    if (pricing.nightSurchargeEnabled === false) {
        return false;
    }

    const startHour = pricing.nightStartHour !== undefined ? pricing.nightStartHour : 22;
    const endHour = pricing.nightEndHour !== undefined ? pricing.nightEndHour : 6;
    const timezone = pricing.timezone || 'America/Argentina/Buenos_Aires';

    let localHour = date.getHours();
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            hour12: false,
            timeZone: timezone
        });
        const parts = formatter.formatToParts(date);
        const hourPart = parts.find(p => p.type === 'hour');
        if (hourPart) {
            localHour = parseInt(hourPart.value, 10);
        }
    } catch (error) {
        logger.error(`[NIGHT_EVAL_ERROR] Error formatting timezone ${timezone} for city ${cityKey}. Using system local hour.`, error);
        localHour = date.getHours();
    }

    let isNightResult = false;
    if (startHour > endHour) {
        isNightResult = localHour >= startHour || localHour < endHour;
    } else {
        isNightResult = localHour >= startHour && localHour < endHour;
    }

    logger.log(`[DYNAMIC_NIGHT_EVAL] City: ${cityKey}, LocalHour: ${localHour}, Range: ${startHour}-${endHour}, Result: ${isNightResult}`);
    return isNightResult;
}


export function calculateSettlement(
    rideData: Ride, 
    driverData: UserProfile, 
    trackingPoints: admin.firestore.DocumentData[], 
    pricing: PricingConfig,
    expansionRates?: ExpansionIncentive['currentRates'],
    passengerData?: UserProfile,
    cityConfig?: any
) {
    // 1. Prioritize pricing snapshot tariffMode if available
    let isNight = false;
    if (rideData.pricing && rideData.pricing.tariffMode) {
        isNight = rideData.pricing.tariffMode === 'night';
        logger.info(`[SETTLEMENT_NIGHT_MODE] Resolved from pricing.tariffMode snapshot: ${isNight} for ride ${rideData.id || 'unknown'}`);
    } else {
        // 2. Dynamic evaluation fallback (using completedAt, startedAt, or current time)
        const completedAt = rideData.completedAt as Timestamp | null;
        const startedAt = rideData.startedAt as Timestamp | null;
        const baseTimestamp = completedAt || startedAt || Timestamp.now();
        const baseDate = baseTimestamp.toDate ? baseTimestamp.toDate() : new Date(baseTimestamp.seconds * 1000);
        
        isNight = evaluateIsNightForCity(baseDate, rideData.cityKey || 'rawson', pricing);
        logger.warn(`[SETTLEMENT_NIGHT_MODE] Missing tariffMode snapshot. Evaluated dynamically: ${isNight} for ride ${rideData.id || 'unknown'}`);
    }

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
        isSpecialVerified: !!passengerData?.isSpecialVerified,
    }, pricing);

    const waitingFare = pricingResult.breakdown.waitingFare;

    // totalFare is what the passenger pays BEFORE any discounts (it is the TRUE GROSS FARE)
    const totalFare = estimatedTotal > 0 ? (estimatedTotal + waitingFare) : pricingResult.total;

    // [BREAKDOWN] Reconstruct breakdown
    const baseFare = estimated?.breakdown?.baseFare ?? pricingResult.breakdown.baseFare;
    const distanceFare = estimated?.breakdown?.distanceFare ?? pricingResult.breakdown.distanceFare;
    const expressDiscountSnap = rideData.pricing?.expressDiscountAmount ?? estimated?.breakdown?.expressDiscountAmount ?? 0;
    
    // As 'totalFare' is now strictly GROSS, we no longer need to reverse-add the discount
    const originalFare = rideData.pricing?.originalTotal ?? totalFare;
    const vamoExpressCoverageAmount = expressDiscountSnap;
    
    // [SETTLEMENT_FIX] Multi-step safe fallback — never silently fall to 'express'.
    // Priority: ride.driverSubtypeSnapshot > ride.driverSubtype > ride.serviceType > driver profile > 'professional'
    let driverSubtypeResolved: string = (rideData as any).driverSubtypeSnapshot
        || (rideData as any).driverSubtype
        || (rideData.serviceType === 'professional' ? 'professional' : null)
        || driverData.driverSubtype
        || 'professional'; // Safe institutional default — 12% commission
    if (!(rideData as any).driverSubtypeSnapshot) {
        logger.warn(`[SETTLEMENT_FALLBACK] driverSubtypeSnapshot missing on ride ${(rideData as any).id || 'unknown'}. Resolved via fallback: '${driverSubtypeResolved}'. Source fields: driverSubtype=${(rideData as any).driverSubtype}, serviceType=${rideData.serviceType}, driverData.driverSubtype=${driverData.driverSubtype}`);
    }
    const isProfessional = driverSubtypeResolved === 'professional';

    const cityKey = rideData.cityKey || 'rawson';

    // Dynamic Commission Model based on Municipal Config
    const vamoRate = (cityConfig?.commissions?.vamoPercentage !== undefined ? cityConfig.commissions.vamoPercentage : 6) / 100;
    const muniRate = (cityConfig?.commissions?.municipalPercentage || 0) / 100;
    const taxiRate = (cityConfig?.commissions?.taxiUnionPercentage || 0) / 100;
    const remisRate = (cityConfig?.commissions?.remisUnionPercentage || 0) / 100;
    const grossReceiptsTaxRate = (cityConfig?.grossReceiptsTaxRate || 0) / 100;
    
    const totalCommissionRate = vamoRate + muniRate + taxiRate + remisRate;

    // Driver calculations use totalFare (Single Source of Truth for Gross Fare)
    const driverFareRef = totalFare;
    
    const commissionAmount = Math.round(driverFareRef * totalCommissionRate);
    const vamoAmount = Math.round(driverFareRef * vamoRate);
    const municipalAmount = Math.round(driverFareRef * muniRate);
    const taxiAssociationAmount = Math.round(driverFareRef * taxiRate);
    const remisAssociationAmount = Math.round(driverFareRef * remisRate);
    const totalAssociationsAmount = taxiAssociationAmount + remisAssociationAmount;
    
    const driverNetAmount  = driverFareRef - commissionAmount;
    
    // Ingresos Brutos se calcula sobre el totalFare
    const grossReceiptsAmount = Math.round(driverFareRef * grossReceiptsTaxRate);

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
    const passengerPaysTotal = passengerAfterExpress; // This is the final amount the passenger owes in total (cash + wallet + credits)

    const baseFareBeforeExpressDiscount = originalFare;
    const socialSubsidyAmount = Math.max(0, driverFareRef - baseFareBeforeExpressDiscount);
    const platformSubsidyAmount = expressDiscountSnap + creditCoveredAmount + socialSubsidyAmount;

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
        originalTotal: originalFare,
        discountAmount: expressDiscountSnap,
        expressDiscountAmount: expressDiscountSnap,
        creditCoveredAmount,
        walletCoveredAmount,
        platformSubsidyAmount,
        socialSubsidyAmount,
        vamoSubsidyAmount: platformSubsidyAmount,
        vamoExpressCoverageAmount,
        passengerPaysTotal,
        cashToCollect,
        fapFee: 0,
        commissionRate: totalCommissionRate,
        commissionAmount,
        driverSubtypeSnapshot: driverSubtypeResolved,
        driverNetAmount,
        totalAmount: totalFare,
        vamoAmount,
        municipalAmount,
        taxiAssociationAmount,
        remisAssociationAmount,
        totalAssociationsAmount,
        driverEarnings: driverNetAmount,
        trackingStats,
        // Rentability audit fields
        grossFare: baseFareBeforeExpressDiscount,
        passengerPays: passengerPaysTotal,
        driverGrossAmount: driverFareRef,
        platformCommissionAmount: vamoAmount,
        municipalShareAmount: municipalAmount,
        grossReceiptsAmount,
        netVamoRevenue: vamoAmount - platformSubsidyAmount,
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

    // [SHARED_SETTLEMENT_GUARD] Prevent standard settlement for shared rides
    // --- GUARD: VamO Compartido V4 ---
    // Si el viaje es compartido, derivamos a la lógica especializada de Fase 4.
    if (after.rideType === 'shared' || (after as any).isSharedRide === true) {
        if ((after as any).isSharedChildRide === true) {
            logger.info(`[CHILD_SETTLEMENT] Processing child ride ${rideId} for history and weekly pool. Skipping master financial settlement.`);
        } else {
            logger.info(`[SHARED_SETTLEMENT_ROUTED_TO_V4] Ride ${rideId}. Routing to specialized settlement.`);
            await settleSharedRideFinancialsV1(rideId);
            return;
        }
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
        
        const cityKey = normalizeCityKey(after.cityKey || 'rawson');
        const driverSubtype = after.driverSubtypeSnapshot || 'express';
        const totalFare = after.pricing?.estimatedTotal || 0;
        
        // Fetch City Config for exact rates if available
        let cityConfig: any = null;
        try {
            const cSnap = await db.collection('cities').doc(after.cityKey || 'rawson').get();
            if (cSnap.exists) cityConfig = cSnap.data()?.config;
        } catch (e) {
            logger.warn(`Could not fetch cityConfig for simulation ${rideId}`, e);
        }

        // Dynamic Commission Model
        const vamoRate = 0.06;
        const muniRate = (cityConfig?.commissions?.municipalPercentage || 0) / 100;
        const taxiRate = (cityConfig?.commissions?.taxiUnionPercentage || 0) / 100;
        const remisRate = (cityConfig?.commissions?.remisUnionPercentage || 0) / 100;
        
        const totalCommissionRate = vamoRate + muniRate + taxiRate + remisRate;
        const commissionAmount = Math.round(totalFare * totalCommissionRate);

        const vamoAmount = Math.round(totalFare * vamoRate);
        const municipalAmount = Math.round(totalFare * muniRate);
        const taxiAssociationAmount = Math.round(totalFare * taxiRate);
        const remisAssociationAmount = Math.round(totalFare * remisRate);
        
        const totalAssociationsAmount = taxiAssociationAmount + remisAssociationAmount;
        const driverEarnings = totalFare - commissionAmount;

        const completedRideData: any = {
            totalAmount: totalFare,
            commissionAmount,
            vamoAmount,
            municipalAmount,
            taxiAssociationAmount,
            remisAssociationAmount,
            totalAssociationsAmount,
            driverEarnings,
            totalFare,
            commissionRate: totalCommissionRate,
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

            // Increment the city stats atomically!
            const cityRef = db.collection('cities').doc(cityKey);
            tx.set(cityRef, {
                stats: {
                    totalRidesToday: admin.firestore.FieldValue.increment(1),
                    totalCityRevenue: admin.firestore.FieldValue.increment(totalFare),
                    totalPlatformCommission: admin.firestore.FieldValue.increment(vamoAmount),
                    totalMunicipalCommission: admin.firestore.FieldValue.increment(municipalAmount)
                }
            }, { merge: true });

            // Write metrics to simulation_metrics
            const metricRef = db.collection('simulation_metrics').doc(`${rideId}_settlement`);
            tx.set(metricRef, {
                rideId,
                driverId: after.driverId,
                passengerId: (after as any).passengerId,
                cityKey: after.cityKey || 'rawson',
                totalFare,
                commissionAmount,
                vamoAmount,
                municipalAmount,
                taxiAssociationAmount,
                remisAssociationAmount,
                totalAssociationsAmount,
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
    const cityKey = normalizeCityKey(after.cityKey || 'rawson');
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

        // cityKey is already normalized above
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

            if (!driverSnap.exists || !rideSnap.exists || !passengerSnap.exists) {
                const missing = [];
                if (!driverSnap.exists) missing.push('driver');
                if (!rideSnap.exists) missing.push('ride');
                if (!passengerSnap.exists) missing.push('passenger');
                logger.error(`[SETTLEMENT CRITICAL] Docs missing: ${missing.join(', ')} for ride ${rideId}`);
                throw new Error(`Critical docs missing: ${missing.join(', ')}`);
            }

            const rideData = rideSnap.data() as Ride;
            const settlementOwnerId = rideData.settlementOwnerId || driverId;
            
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
                tx.get(db.doc(`wallets/${settlementOwnerId}`)),
                tx.get(lockRef)
            ]);
            
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

            const cityDocData = citySnap.exists ? citySnap.data() : null;
            const settlementData = calculateSettlement(rideData, driverData, trackingPoints, pricingConfig, expansionRates, passengerData, cityDocData?.config);
            const { commissionAmount } = settlementData;
            
            logger.log(`[SETTLEMENT VALUES] commission: ${commissionAmount}`);

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

            // 3. Gross Receipts Withheld
            const grossReceiptsAmount = settlementData.grossReceiptsAmount || 0;
            if (grossReceiptsAmount > 0) {
                // Deduct from regular balance (negative adjustment)
                driverMovements.push({
                    amount: -grossReceiptsAmount,
                    type: 'adjustment' as const,
                    rideId: `gr_${rideId}`,
                    note: `Retención Ingresos Brutos viaje ${rideId}`
                });
                
                // Add to gross receipts balance (positive)
                driverMovements.push({
                    amount: grossReceiptsAmount,
                    type: 'gross_receipts_withheld' as const,
                    rideId: rideId,
                    note: `Apartado Ingresos Brutos viaje ${rideId}`
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
            // [RECEIPT] Generate a deterministic receipt number for auditability
            const receiptNumber = `VamO-${cityKey.toUpperCase()}-${weekId}-${rideId.substring(0, 8).toUpperCase()}`;
            const rideUpdate: any = {
                completedRide: { ...settlementData, pointsAwarded, calculatedAt: Timestamp.now() },
                settledAt: now,
                receiptNumber,
                vamoPointsAwarded: passengerPointsForThisRide,
                expansionCounted: true
            };

            
            if (isWeeklyPoolEligible) {
                rideUpdate.weeklyPoolCounted = true;
                rideUpdate.weeklyPoolCountedAt = now;
                rideUpdate.weeklyPoolWeekId = weekId;
            }

            // [FASE 1] finalDebit = VamO commission + gross receipts
            const isSharedChild = (after as any).isSharedChildRide === true;
            const finalDebit = isSharedChild ? 0 : commissionAmount;
            logger.log(`[FINANCIAL] Debiting owner ${settlementOwnerId} (Driver: ${driverId}): commissionAmount=${commissionAmount} = finalDebit=${finalDebit}`);

            // --- DRIVER STATS & BALANCE LOGIC (VamO PRO v7.0) ---
            
            const walletCredit = (settlementData.walletCoveredAmount || 0) + (settlementData as any).vamoExpressCoverageAmount;
            const netBalanceChange = isSharedChild ? 0 : (walletCredit - finalDebit - (settlementData.grossReceiptsAmount || 0));

            // Determine if we need to reset daily/weekly/monthly stats
            const isNewDay = driverData.dailyStats?.lastResetDate !== todayStr;
            const isNewWeek = (driverData as any).financialStats?.lastWeekId !== weekId;
            const isNewMonth = (driverData as any).financialStats?.lastMonthId !== monthId;

            const earningsForThisRide = isSharedChild ? 0 : (settlementData.driverNetAmount || 0);

            const todayCash = isSharedChild ? 0 : (settlementData.cashToCollect || 0);
            const todayDigital = isSharedChild ? 0 : (settlementData.walletCoveredAmount || 0);

            const currentVamoScore = (driverData as any).vamoScore ?? 100;
            const newVamoScore = calculateNewScore(currentVamoScore, DRIVER_SCORE_RULES.RIDE_COMPLETED);
            const newVamoLevel = getReputationLevel(newVamoScore);

            const driverUpdate: any = {
                'stats.ridesCompleted': FieldValue.increment(1),
                updatedAt: now,
                rewardPoints: FieldValue.increment(pointsAwarded),
                driverLevel: getDriverLevel((driverData.rewardPoints || 0) + pointsAwarded),
                vamoScore: newVamoScore,
                vamoLevel: newVamoLevel,
                activeRideId: null,
                driverStatus: 'online'
            };

            // --- Update city weekly pool ---
            const cityPoolRef = db.collection('cities').doc(cityKey).collection('weekly_pools').doc(weekId);
            const poolSnap = await tx.get(cityPoolRef);
            let poolDataToSet: any = null;
            let poolDataToUpdate: any = null;

            if (!poolSnap.exists) {
                // Create with V2 schema
                const nowTs = FieldValue.serverTimestamp();
                poolDataToSet = {
                    cityKey,
                    weekId,
                    baseAmount: 20000,
                    incrementPerRide: 100,
                    maxAmount: 600000,
                    eligibleDriversCount: 30,
                    version: 'v2',
                    currentAmount: 20100,
                    completedTripsTotal: 1,
                    createdAt: nowTs,
                    updatedAt: nowTs,
                };
                logger.info(`[POOL_UPDATE] Prepared to create city pool ${cityKey}/${weekId}`);
            } else {
                poolDataToUpdate = {
                    completedTripsTotal: FieldValue.increment(1),
                    currentAmount: FieldValue.increment(100),
                    updatedAt: FieldValue.serverTimestamp(),
                };
                logger.info(`[POOL_UPDATE] Prepared to atomically update city pool ${cityKey}/${weekId}`);
            }

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
                    logger.info(`[MISSION] Driver ${driverId} added bonus ${mId}: $${reward} to batch (to settlementOwner ${settlementOwnerId})`);
                }
            }

            // [EXPRESS_BENEFIT] Add driver wallet movement for VamO Express Coverage
            const vamoExpressCoverage = (settlementData as any).vamoExpressCoverageAmount || 0;
            if (vamoExpressCoverage > 0) {
                driverMovements.push({
                    amount: vamoExpressCoverage,
                    type: 'adjustment' as const, // Treat it similar to an adjustment
                    rideId: rideId,
                    note: 'Cobertura Beneficio Express VamO'
                });
                logger.info(`[EXPRESS_BENEFIT] Driver ${driverId} added coverage: $${vamoExpressCoverage} to batch`);
            }

            // [WALLET_EXEC] Batch all driver movements (earnings, cash recovery, missions)
            // THIS CONTAINS THE FINAL READS (idempotency checks for movements)
            if (!isSharedChild) {
                // If settlementOwnerId != driverId, we must pass a userSnap that belongs to the settlementOwnerId 
                // Wait, addWalletMovements might require the userSnap of the owner to create the wallet if it doesn't exist.
                // We'll pass driverWalletSnap which belongs to settlementOwnerId.
                const settlementOwnerRef = db.collection('users').doc(settlementOwnerId);
                const settlementOwnerSnap = (settlementOwnerId === driverId) ? driverSnap : await tx.get(settlementOwnerRef);
                
                await addWalletMovements(settlementOwnerId, driverMovements, cityKey, tx, { 
                    userSnap: settlementOwnerSnap,
                    walletSnap: driverWalletSnap 
                });
            } else {
                logger.info(`[CHILD_SETTLEMENT] Skipped wallet movements for child ride ${rideId}`);
            }

            // --- WRITES START HERE (Strict read-before-write) ---
            
            // 0. Update Pool 
            if (poolDataToSet) tx.set(cityPoolRef, poolDataToSet);
            if (poolDataToUpdate) tx.update(cityPoolRef, poolDataToUpdate);

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

            // 3. Create Fleet Financial Ledger if applicable
            const agreement = (rideData as any).paymentAgreementSnapshot || (driverData as any).paymentAgreement;
            if (driverData.driverSubtype === 'fleet_driver' && agreement && agreement.mode === 'percentage') {
                logger.log(`[FLEET_LEDGER] Generating informative ledger for ride ${rideId}`);
                const ledgerRef = db.collection('fleet_financial_ledger').doc(rideId);
                const grossFare = settlementData.totalFare || 0;
                const platformFeeAmount = commissionAmount || 0;
                const platformFeePercent = (rideData as any).commissionRateSnapshot || 0;
                const municipalFeeAmount = settlementData.grossReceiptsAmount || 0;
                const associationFeeAmount = 0; // Not applicable yet
                const netAfterFees = grossFare - platformFeeAmount - municipalFeeAmount - associationFeeAmount;
                const driverPct = agreement.driverSharePercent || 0;
                const ownerPct = agreement.ownerSharePercent || 0;
                
                tx.set(ledgerRef, {
                    rideId,
                    driverId,
                    vehicleOwnerId: driverData.vehicleOwnerId || settlementOwnerId,
                    settlementOwnerId,
                    vehicleId: (rideData as any).vehicleId || driverData.vehicle?.plate || null,
                    grossFare,
                    platformFeePercent,
                    platformFeeAmount,
                    municipalFeeAmount,
                    associationFeeAmount,
                    netAfterFees,
                    driverSharePercent: driverPct,
                    ownerSharePercent: ownerPct,
                    driverInformativeAmount: netAfterFees * (driverPct / 100),
                    ownerInformativeAmount: netAfterFees * (ownerPct / 100),
                    appliesTo: "net_after_platform_and_municipal_fees",
                    currency: agreement.currency || 'ARS',
                    type: 'informative_fleet_split',
                    createdAt: now
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

            // [VamO PRO] Update Passenger Weekly Pool
            if (rideData.passengerId && !rideData.isSharedRide) {
                const pName = rideData.passengerName || "Pasajero";
                incrementPassengerPoints(rideData.passengerId, pName, cityKey).catch(e => {
                    logger.error(`[PASSENGER_POOL_ERROR] Failed to increment passenger points for ride ${rideId}:`, e);
                });
            }

            // Update driver_points for Weekly Pool (with Dynamic Pricing counters)
            const dynamicTripIncrement = getDynamicTripIncrement(rideData);
            const isProfessionalDriver = (rideData as any).driverSubtypeSnapshot === 'professional'
                || driverData.driverSubtype === 'professional';

            if (isNewWeek) {
                const newDynTrips = dynamicTripIncrement;
                tx.set(pointsRef, {
                    driverId,
                    cityKey,
                    driverName: driverData.name || 'Anónimo',
                    weeklyPoints: pointsAwarded,
                    weeklyTripsCount: 1,
                    weeklyDynamicTripsCount: newDynTrips,
                    weeklyDynamicPoints: dynamicTripIncrement > 0 ? pointsAwarded : 0,
                    weeklyPoolDynamicMultiplier: getDynamicPoolMultiplier(newDynTrips),
                    totalPoints: pointsAwarded,
                    lastUpdated: now,
                    weekId
                }, { merge: true });
            } else {
                const currentDynTrips = (pointsSnap.exists ? (pointsSnap.data()?.weeklyDynamicTripsCount || 0) : 0)
                    + dynamicTripIncrement;
                tx.update(pointsRef, {
                    weeklyPoints: FieldValue.increment(pointsAwarded),
                    weeklyTripsCount: FieldValue.increment(1),
                    weeklyDynamicTripsCount: FieldValue.increment(dynamicTripIncrement),
                    weeklyDynamicPoints: dynamicTripIncrement > 0
                        ? FieldValue.increment(pointsAwarded)
                        : FieldValue.increment(0),
                    weeklyPoolDynamicMultiplier: isProfessionalDriver
                        ? getDynamicPoolMultiplier(currentDynTrips)
                        : 1.00,
                    lastUpdated: now
                });
            }


            tx.update(driverRef, driverUpdate);

            // LOG VAMO SCORE EVENT
            if (!isSharedChild) {
                const scoreEventRef = db.collection(`users/${driverId}/score_events`).doc();
                tx.set(scoreEventRef, {
                    rideId,
                    eventType: 'trip_completed',
                    pointsChanged: DRIVER_SCORE_RULES.RIDE_COMPLETED,
                    previousScore: currentVamoScore,
                    newScore: newVamoScore,
                    newLevel: newVamoLevel,
                    createdAt: FieldValue.serverTimestamp()
                });
            }

            // --- PASSENGER BALANCE DEDUCTION (UNTOUCHED) ---
            if (!isSharedChild && walletCredit > 0) {
                logger.log(`[FINANCIAL] Deducting $${walletCredit} from passenger ${passengerId} (VamO Pay)`);
                
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
                    type: 'ride_payment',
                    note: `Pago de viaje con billetera ${rideId}`,
                    cityKey, createdAt: now, systemVersion: 'v7_audit_fix'
                });
            }

            // --- INTERNAL LEDGER RECORD ---
            if (!isSharedChild && settlementData.driverGrossAmount && settlementData.driverGrossAmount > 0) {
                const ledgerTxRef = db.collection('ledger_events').doc();
                const totalGross = settlementData.driverGrossAmount;
                const vamoA = settlementData.vamoAmount || 0;
                const muniA = settlementData.municipalAmount || 0;
                const taxiA = settlementData.taxiAssociationAmount || 0;
                const remisA = settlementData.remisAssociationAmount || 0;
                const grossR = settlementData.grossReceiptsAmount || 0;
                
                tx.set(ledgerTxRef, {
                    rideId,
                    driverId, // Operational driver
                    settlementOwnerId, // Financial owner
                    cityKey,
                    timestamp: now,
                    type: 'ride_settlement',
                    amounts: {
                        grossFare: totalGross,
                        vamoCommission: vamoA,
                        municipalCommission: muniA,
                        taxiUnionCommission: taxiA,
                        remisUnionCommission: remisA,
                        grossReceiptsWithheld: grossR,
                        driverNet: settlementData.driverNetAmount || 0
                    },
                    percentages: {
                        vamo: vamoA / totalGross,
                        muni: muniA / totalGross,
                        taxi: taxiA / totalGross,
                        remis: remisA / totalGross,
                        grossReceipts: grossR / totalGross
                    }
                });
            }

            // Update City Pool Amount (Dynamic Contribution Rule v7.2)
            // Rule: weeklyPoolAmount += contribution (capped at $600.000)
            const cityData = citySnap.data() as any;
            const currentPool = cityData?.rewardsConfig?.weeklyPoolAmount ?? 20000;
            const MAX_POOL = 600000;
            
            // Read contribution from config or use legacy $100 fallback
            const POOL_INCREMENT_PER_RIDE = 100; // Forzado a $100 en Versión B
            
            // Only increment if we haven't hit the cap
            const finalPoolIncrement = (currentPool < MAX_POOL) ? POOL_INCREMENT_PER_RIDE : 0;

            if (finalPoolIncrement > 0) {
                logger.info(`[WEEKLY_POOL_CONTRIBUTION] rideId=${rideId} | driverId=${driverId} | city=${cityKey} | contribution=${finalPoolIncrement}`);
            }

            tx.update(cityRef, {
                'rewardsConfig.weeklyPoolAmount': FieldValue.increment(finalPoolIncrement),
                'rewardsConfig.updatedAt': now,
                'stats.totalPlatformCommission': FieldValue.increment(isSharedChild ? 0 : (commissionAmount || 0)),
                'stats.totalRides': FieldValue.increment(1),
            });

            // Update Municipal Account (Treasury Integration)
            if (!isSharedChild) {
                const muniAccRef = db.doc(`municipal_accounts/${cityKey}`);
                tx.set(muniAccRef, {
                    cityKey,
                    createdAt: Timestamp.now(),
                    lastMovementAt: now,
                    updatedAt: now,
                    status: 'active'
                }, { merge: true });

                const muniTxRef = db.collection('platform_transactions').doc();
                tx.set(muniTxRef, {
                    cityKey,
                    rideId,
                    amount: 0,
                    type: 'municipal_contribution',
                    note: `Participación municipal viaje ${rideId}`,
                    createdAt: now,
                    systemVersion: 'v6_pool_muni'
                });
            }

            // FAP Express extra debit removed based on Admin requirements. It is now absorbed within the main commission.

            tx.update(passengerRef, { 
                activeRideId: null, 
                updatedAt: now,
                'stats.ridesCompleted': FieldValue.increment(1),
                vamoPoints: newPassengerPoints,
                activeBonus: hasPassengerBonus
            });
            tx.update(driverLocationRef, { driverStatus: 'online', lastUpdateAt: now });
            

            // NOTE: driver_points se escribe en el bloque isNewWeek/else de arriba (líneas ~1172-1199).
            // El totalPoints se actualiza aquí como campo acumulativo histórico (no semanal):
            if (pointsSnap.exists) {
                tx.update(pointsRef, {
                    totalPoints: FieldValue.increment(pointsAwarded),
                    driverName: driverData.name || 'Anónimo',
                    cityKey,
                });
            }
            // Si no existe el doc, ya fue creado con tx.set en el bloque isNewWeek de arriba.

            settlementDataToLog = settlementData;

            // [WALLET] Consume locked passenger funds (NOW SAFE: ALL READS DONE AT START)
            const walletConsumeAmount = isSharedChild ? 0 : (settlementData.walletCoveredAmount || 0);
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
                    const lockData = lockSnap.exists ? lockSnap.data() : null;
                    // El lock guarda valores negativos en cashAmount/promoAmount
                    const lockedCash = Math.abs(lockData?.cashAmount || 0);
                    const lockedPromo = Math.abs(lockData?.promoAmount || 0);

                    // Consumimos lo que se bloqueó originalmente
                    // Si el precio final varió, consumeLockedWallet manejará la integridad de la billetera
                    await consumeLockedWallet(rideData.passengerId, rideId, lockedCash, lockedPromo, tx, {
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
                    driverNetAmount: settlementDataToLog.driverNetAmount
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

        // --- [FASE 8] NOTIFICATIONS ---
        try {
            const { createNotification } = require('./lib/notifications');
            const logSnap = await rideRef.get();
            const sd = logSnap.data()?.completedRide ?? {};
            
            // Passenger: Viaje finalizado
            await createNotification({
                userId: passengerId,
                role: 'passenger',
                type: 'ride_completed',
                title: 'Viaje Finalizado',
                message: `Llegaste a tu destino. Total: $${sd.cashToCollect ?? sd.totalFare}.`,
                priority: 'success',
                actionUrl: `/dashboard/ride?id=${rideId}`,
                rideId
            });

            // Passenger: Express
            if (sd.expressDiscountAmount > 0) {
                await createNotification({
                    userId: passengerId,
                    role: 'passenger',
                    type: 'express_applied',
                    title: 'Beneficio Express',
                    message: `Ahorraste $${sd.expressDiscountAmount} en este viaje.`,
                    priority: 'success',
                    rideId
                });
            }

            // Driver: Viaje finalizado
            await createNotification({
                userId: driverId,
                role: 'driver',
                type: 'ride_completed',
                title: 'Viaje Finalizado',
                message: `Cobrá $${sd.cashToCollect ?? sd.totalFare} en efectivo. Tu neto es $${sd.driverNetAmount ?? 0}.`,
                priority: 'success',
                actionUrl: `/driver/history`,
                rideId
            });

            // Driver: Cobertura VamO Express
            if (sd.expressDiscountAmount > 0) {
                await createNotification({
                    userId: driverId,
                    role: 'driver',
                    type: 'express_coverage',
                    title: 'Cobertura Express Acreditada',
                    message: `VamO cubrió los $${sd.expressDiscountAmount} del descuento del pasajero.`,
                    priority: 'success',
                    rideId
                });
            }
        } catch (notifErr) {
            logger.error(`[NOTIFICATIONS] Failed to create notifications for ride ${rideId}`, notifErr);
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
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const isSignatureOptional = process.env.MP_WEBHOOK_SIGNATURE_OPTIONAL === "true" || process.env.FUNCTIONS_EMULATOR === "true";

    if (!webhookSecret && !isSignatureOptional) {
        logger.error("[CRITICAL] MERCADOPAGO_WEBHOOK_SECRET is not configured. Webhook is LOCKED for safety.");
        res.status(500).send("Security configuration missing. Webhook disabled.");
        return;
    }

    if (signature && requestId && webhookSecret) {
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
        if (!isSignatureOptional) {
            logger.error(`[SECURITY_ALERT] Webhook received without signature for payment ${paymentId}. REJECTED.`);
            res.status(401).send("Unauthorized: Missing signature.");
            return;
        }
        logger.warn(`[DEBUG_MODE] Proceeding without signature for payment ${paymentId} (Optional flag is ON).`);
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

        const metadata = payment.metadata as any;
        const driverId = payment.external_reference || metadata?.driver_id;
        const amount = payment.transaction_amount;

        if (!driverId || !amount) {
            logger.error("[Step 2/4 FAILED] Webhook para pago, pero falta external_reference o amount.", { paymentId: payment.id, external_ref: payment.external_reference, amount: payment.transaction_amount });
            res.status(200).send("Missing driver reference or amount, skipping but acknowledging.");
            return;
        }

        const driverRef = db.collection("users").doc(driverId);
        const transactionRef = db.collection('platform_transactions').doc(`mp_${paymentId}`);

        // --- MANEJO DE ESTADOS ---
        
        if (payment.status === "approved") {
            logger.log(`[Step 3/4] Payment approved. Initiating accreditation for driver ${driverId} amount ${amount}.`);
            
            await db.runTransaction(async (tx) => {
                const txDoc = await tx.get(transactionRef);
                if (txDoc.exists && txDoc.data()?.status === 'approved') {
                    logger.warn(`[Step 3/4 SKIPPED] Idempotency check failed. Payment mp_${paymentId} already approved/processed.`);
                    return;
                }

                const driverDoc = await tx.get(driverRef);
                if (!driverDoc.exists) {
                    logger.error(`[Step 3/4 FAILED] Driver ${driverId} not found.`);
                    tx.set(transactionRef, { status: 'failed', reason: 'Driver not found', paymentId, amount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                    return;
                }

                // Acreditar fondos
                await addFunds(driverId, amount, 'topup_cash', `Carga vía MP #${paymentId}`, tx, `mp_${paymentId}`);
                
                // Actualizar log de plataforma
                tx.set(transactionRef, {
                    status: 'approved',
                    paymentId: paymentId,
                    driverId: driverId,
                    amount: amount,
                    mpData: {
                        status: payment.status,
                        status_detail: payment.status_detail,
                        payment_method_id: payment.payment_method_id,
                        installments: payment.installments
                    },
                    createdAt: txDoc.exists ? txDoc.data()?.createdAt : FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });

                await emitLedgerEvent({
                    eventType: 'mp_payment_approved',
                    userId: driverId,
                    amount: amount,
                    currency: 'ARS',
                    referenceType: 'payment',
                    referenceId: paymentId.toString(),
                    idempotencyKey: `ledger_mp_approved_${paymentId}`,
                    source: 'mercadopago_webhook',
                    metadata: { status: payment.status }
                }, tx);
            });

            logger.log(`[Step 4/4] SUCCESS! Saldo acreditado para driver ${driverId}.`);
            res.status(200).send("Payment approved and processed.");
            return;
        }

        if (payment.status === "refunded" || payment.status === "charged_back") {
            const eventType = payment.status === 'refunded' ? 'mp_payment_refunded' : 'mp_payment_charged_back';
            logger.warn(`[REVERSAL_INIT] Payment ${paymentId} moved to ${payment.status}. Reverting funds for driver ${driverId}.`);

            await db.runTransaction(async (tx) => {
                const txDoc = await tx.get(transactionRef);
                // Si no existe el registro original de aprobación, no podemos "revertir" algo que nunca acreditamos
                // pero lo registramos para auditoría.
                if (!txDoc.exists || txDoc.data()?.status !== 'approved') {
                    logger.warn(`[REVERSAL_SKIPPED] Cannot reverse payment ${paymentId} as it was never approved in VamO.`);
                    tx.set(transactionRef, { status: payment.status, paymentId, amount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                    return;
                }

                // Verificar si ya fue revertido
                if (txDoc.data()?.status === 'refunded' || txDoc.data()?.status === 'charged_back') {
                    logger.warn(`[REVERSAL_SKIPPED] Payment ${paymentId} already reversed as ${txDoc.data()?.status}.`);
                    return;
                }

                // Revertir fondos (reverseFunds maneja idempotencia de wallet_transactions internamente)
                await reverseFunds(
                    driverId, 
                    amount, 
                    payment.status === 'refunded' ? 'mp_payment_refunded' : 'mp_payment_charged_back',
                    `Reversa por pago ${payment.status} en MP #${paymentId}`,
                    tx,
                    `mp_${paymentId}`
                );

                tx.update(transactionRef, {
                    status: payment.status,
                    reversedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
            });

            res.status(200).send(`Payment reversal for ${payment.status} processed.`);
            return;
        }

        // Otros estados (rejected, cancelled, in_mediation, pending)
        logger.info(`[Step 2/4] Payment ${paymentId} status is ${payment.status}. Recording state without financial movement.`);
        await transactionRef.set({
            status: payment.status,
            paymentId,
            driverId,
            amount,
            updatedAt: FieldValue.serverTimestamp(),
            mpData: { status: payment.status, status_detail: payment.status_detail }
        }, { merge: true });

        await emitLedgerEvent({
            eventType: payment.status === 'rejected' ? 'mp_payment_rejected' : 'mp_payment_approved', // approved is fallback type but metadata says the truth
            userId: driverId,
            amount: 0,
            currency: 'ARS',
            referenceType: 'payment',
            referenceId: paymentId.toString(),
            idempotencyKey: `ledger_mp_state_${paymentId}_${payment.status}`,
            source: 'mercadopago_webhook',
            metadata: { status: payment.status, status_detail: payment.status_detail }
        });

        res.status(200).send(`Payment status ${payment.status} recorded.`);

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
    const { createNotification } = require('./lib/notifications');

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
        await createNotification({
            userId: after.passengerId,
            role: 'passenger',
            type: 'ride_assigned',
            title: '¡Tu conductor está en camino!',
            message: `${after.driverName} aceptó tu viaje.`,
            priority: 'info',
            actionUrl: '/dashboard/ride',
            rideId: event.params.rideId
        });
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
        await createNotification({
            userId: after.passengerId,
            role: 'passenger',
            type: 'ride_arrived',
            title: '¡Tu conductor ha llegado!',
            message: `${after.driverName} está esperando en el punto de encuentro.`,
            priority: 'info',
            actionUrl: '/dashboard/ride',
            rideId: event.params.rideId
        });
        return;
    }

    if (before.status === 'driver_arrived' && after.status === 'in_progress') {
        if (!after.passengerId || !after.driverName) return;
        await createNotification({
            userId: after.passengerId,
            role: 'passenger',
            type: 'ride_started',
            title: 'Viaje en curso',
            message: `Disfrutá tu viaje con ${after.driverName}.`,
            priority: 'info',
            actionUrl: '/dashboard/ride',
            rideId: event.params.rideId
        });
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
                
                let currentScore = passengerData.reputationScore ?? 100;
                if (driverId) {
                    if (before.status === 'driver_arrived') {
                        currentScore = calculateNewScore(currentScore, PASSENGER_SCORE_RULES.NO_SHOW);
                    } else if (before.status === 'driver_assigned') {
                        currentScore = calculateNewScore(currentScore, PASSENGER_SCORE_RULES.LATE_CANCELLATION);
                    }
                }
                const newLevel = getReputationLevel(currentScore);

                const updates: { [key: string]: any } = {
                    activeRideId: null,
                    weeklyCancellations: newWeeklyCount,
                    lastCancellationAt: now,
                    reputationScore: currentScore,
                    reputationLevel: newLevel
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
            if (before.driverId) {
                const { createNotification } = require('./lib/notifications');
                await createNotification({
                    userId: before.driverId,
                    role: 'driver',
                    type: 'ride_cancelled',
                    title: 'Viaje Cancelado',
                    message: 'El pasajero canceló el viaje.',
                    priority: 'warning',
                    actionUrl: '/driver/rides',
                    rideId: rideId
                });
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
            
            let currentScore = driverData.reputationScore ?? 100;
            if (after.passengerId) {
                if (before.status === 'driver_arrived') {
                    currentScore = calculateNewScore(currentScore, DRIVER_SCORE_RULES.NO_SHOW);
                } else if (before.status === 'driver_assigned') {
                    currentScore = calculateNewScore(currentScore, DRIVER_SCORE_RULES.LATE_CANCELLATION);
                }
            }
            const newLevel = getReputationLevel(currentScore);

            const batch = db.batch();
            batch.update(driverRef, { 
                ...riskProfile,
                cancellationCount: FieldValue.increment(1),
                activeRideId: null, 
                driverStatus: 'offline',
                reputationScore: currentScore,
                reputationLevel: newLevel,
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
    logger.info(`[CANCEL_RIDE_START] User ${uid} attempting to cancel ride ${rideId} with reason ${reason}`);

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

        // Regla 7: Cancelación del conductor en viaje compartido
        if (cancelledByRole === 'driver' && rideData.isSharedRide) {
            logger.info(`[SHARED_RIDE] Driver ${uid} cancelled shared ride ${rideId}. Relaunching search.`);
            transaction.update(rideRef, {
                status: 'searching',
                driverId: FieldValue.delete(),
                driverName: FieldValue.delete(),
                driverPhoto: FieldValue.delete(),
                driverPlate: FieldValue.delete(),
                driverModel: FieldValue.delete(),
                driverPhone: FieldValue.delete(),
                dispatchReason: 'urgent_driver_relaunch',
                updatedAt: FieldValue.serverTimestamp()
            });

            const driverRef = db.doc(`users/${uid}`);
            transaction.update(driverRef, {
                activeRideId: FieldValue.delete(),
                cancellationCount: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp()
            });

            // Mark offers as cancelled (the trigger might not do it if status is not cancelled)
            const offersSnap = await db.collection('rideOffers')
                .where('rideId', '==', rideId)
                .where('status', '==', 'pending')
                .get();
            offersSnap.forEach(doc => {
                transaction.update(doc.ref, { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
            });

            return { success: true, relaunched: true };
        }

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

        const rideUpdate: any = {
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
        };

        const userUpdate: any = {
            activeRideId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
        };

        // [VAMO SCORE] Penalties for cancellation
        let scorePenalty = 0;
        let scorePenaltyReason = '';

        if (isDriver) {
            if (reason === 'no_show' || reason === 'passenger_no_show') {
                scorePenalty = DRIVER_SCORE_RULES.NO_SHOW;
                scorePenaltyReason = 'No presentarse';
            } else {
                scorePenalty = DRIVER_SCORE_RULES.LATE_CANCELLATION;
                scorePenaltyReason = 'Cancelación tardía';
            }
        } else if (isPassenger) {
            if (reason === 'no_show' || reason === 'driver_no_show') {
                scorePenalty = PASSENGER_SCORE_RULES.NO_SHOW;
                scorePenaltyReason = 'No presentarse';
            } else if (cancelFeeAmount > 0 || rideData.status === 'driver_arrived') { // Late cancel
                scorePenalty = PASSENGER_SCORE_RULES.LATE_CANCELLATION;
                scorePenaltyReason = 'Cancelación tardía';
            }
        }

        if (scorePenalty < 0) {
            const cancelingUserRef = db.doc(`users/${uid}`);
            const cancelingUserSnap = await transaction.get(cancelingUserRef);
            const currentVamoScore = cancelingUserSnap.exists ? (cancelingUserSnap.data()?.vamoScore ?? 100) : 100;

            const newVamoScore = calculateNewScore(currentVamoScore, scorePenalty);
            const newVamoLevel = getReputationLevel(newVamoScore);

            Object.assign(userUpdate, {
                vamoScore: newVamoScore,
                vamoLevel: newVamoLevel
            });

            const scoreEventRef = db.collection(`users/${uid}/score_events`).doc();
            transaction.set(scoreEventRef, {
                rideId,
                eventType: 'cancellation_penalty',
                reason: scorePenaltyReason,
                pointsChanged: scorePenalty,
                previousScore: currentVamoScore,
                newScore: newVamoScore,
                newLevel: newVamoLevel,
                createdAt: FieldValue.serverTimestamp()
            });

            if (newVamoLevel === 'Suspendido' && currentVamoScore >= 40) {
                Object.assign(userUpdate, {
                    accountStatus: 'suspended',
                    isSuspended: true,
                    suspensionReason: `Suspendido por VamO Score (${scorePenaltyReason})`,
                    suspendedAt: FieldValue.serverTimestamp()
                });
            }
        }

        // [VamO PRO] Unified Financial & Policy Handler (All reads before writes)
        await handleRideCancellationFinancials({
            rideId,
            reason: reason || 'CANCELLED_BY_USER',
            actor: cancelledByRole,
            tx: transaction,
            rideData,
            rideUpdate,
            userUpdate
        });

        transaction.update(rideRef, rideUpdate);

        // [CRITICAL FIX] Clear activeRideId for passengers
        if (rideData.isSharedRide && rideData.sharedGroupId) {
            // Shared ride: Clear all passengers using the specialized utility
            const groupRef = db.doc(`shared_ride_groups/${rideData.sharedGroupId}`);
            const groupSnap = await transaction.get(groupRef);
            if (groupSnap.exists) {
                const group = groupSnap.data() as any;
                for (const pid of group.passengerIds || []) {
                    transaction.update(db.doc(`users/${pid}`), {
                        activeRideId: FieldValue.delete(),
                        activeSharedRequestId: FieldValue.delete(),
                        activeSharedRideGroupId: FieldValue.delete(),
                        sharedRideStatus: 'cancelled',
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
            }
        } else if (rideData.passengerId) {
            // Normal ride: Clear single passenger
            transaction.update(db.doc(`users/${rideData.passengerId}`), userUpdate);
        }
        
        // Also clear driver if assigned
        if (rideData.driverId) {
            transaction.update(db.doc(`users/${rideData.driverId}`), {
                activeRideId: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    }).catch((error) => {
        logger.error(`[CANCEL_RIDE_ERROR] Failed to cancel ride ${rideId}:`, error);
        throw new HttpsError("internal", "Error interno al cancelar el viaje.", error.message);
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

export const submitTripFeedbackV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const db = getDb();
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError("unauthenticated", "Usuario no autenticado.");
    }

    const { rideId, feedbackType, reason, comment } = request.data;
    if (!rideId || (feedbackType !== 'thumbs_up' && feedbackType !== 'thumbs_down')) {
        throw new HttpsError("invalid-argument", "Datos de feedback inválidos.");
    }

    const rideRef = db.doc(`rides/${rideId}`);

    return db.runTransaction(async (transaction: admin.firestore.Transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists) {
            throw new HttpsError("not-found", "El viaje no existe.");
        }
        const rideData = rideSnap.data() as Ride;

        if (rideData.status !== 'completed') {
            logger.warn(`[FEEDBACK_GUARD] invalid ride status: ${rideData.status}`);
            throw new HttpsError("failed-precondition", "Solo se pueden calificar viajes completados.");
        }

        const isPassenger = rideData.passengerId === uid;
        const isDriver = rideData.driverId === uid;

        if (!isPassenger && !isDriver) {
            logger.warn(`[FEEDBACK_GUARD] unauthorized rater: ${uid}`);
            throw new HttpsError("permission-denied", "No sos parte de este viaje.");
        }

        const updates: { [key: string]: any } = {};
        
        let targetUserId = "";
        let isRatingDriver = false;

        if (isPassenger) {
            if (rideData.driverRatingByPassenger) {
                logger.warn(`[FEEDBACK_GUARD] duplicate prevented for passenger ${uid}`);
                throw new HttpsError("already-exists", "Ya enviaste feedback a este conductor.");
            }
            updates.driverRatingByPassenger = feedbackType === 'thumbs_up' ? 5 : 1; // Legacy compatibility
            updates.driverFeedbackType = feedbackType;
            if (reason) updates.driverFeedbackReason = reason;
            if (comment) updates.driverComments = comment;
            targetUserId = rideData.driverId || '';
            isRatingDriver = true;
        } else { // isDriver
            if (rideData.passengerRatingByDriver) {
                logger.warn(`[FEEDBACK_GUARD] duplicate prevented for driver ${uid}`);
                throw new HttpsError("already-exists", "Ya enviaste feedback a este pasajero.");
            }
            updates.passengerRatingByDriver = feedbackType === 'thumbs_up' ? 5 : 1; // Legacy compatibility
            updates.passengerFeedbackType = feedbackType;
            if (reason) updates.passengerFeedbackReason = reason;
            if (comment) updates.passengerComments = comment;
            targetUserId = rideData.passengerId || '';
            isRatingDriver = false;
        }

        transaction.update(rideRef, updates);

        // Fetch target user and update score
        const targetUserRef = db.doc(`users/${targetUserId}`);
        const targetUserSnap = await transaction.get(targetUserRef);

        if (targetUserSnap.exists) {
            const targetData = targetUserSnap.data() || {};
            const currentScore = targetData.vamoScore ?? 100;
            let pointChange = 0;

            if (feedbackType === 'thumbs_up') {
                pointChange = isRatingDriver ? DRIVER_SCORE_RULES.THUMBS_UP : PASSENGER_SCORE_RULES.THUMBS_UP;
            } else if (feedbackType === 'thumbs_down') {
                if (isRatingDriver) {
                    if (reason === 'mild') pointChange = DRIVER_SCORE_RULES.COMPLAINT_MILD;
                    else if (reason === 'moderate') pointChange = DRIVER_SCORE_RULES.COMPLAINT_MODERATE;
                    else if (reason === 'severe') pointChange = DRIVER_SCORE_RULES.COMPLAINT_SEVERE;
                    else pointChange = DRIVER_SCORE_RULES.COMPLAINT_MILD; // Default if not specified
                } else {
                    if (reason === 'severe' || reason === 'fraud') pointChange = PASSENGER_SCORE_RULES.FRAUD_SEVERE;
                    else pointChange = PASSENGER_SCORE_RULES.VALIDATED_COMPLAINT;
                }
            }

            const newScore = calculateNewScore(currentScore, pointChange);
            const newLevel = getReputationLevel(newScore);

            transaction.update(targetUserRef, {
                vamoScore: newScore,
                vamoLevel: newLevel
            });

            // LOG EVENT
            const scoreEventRef = db.collection(`users/${targetUserId}/score_events`).doc();
            transaction.set(scoreEventRef, {
                rideId,
                eventType: isRatingDriver ? 'driver_rated' : 'passenger_rated',
                feedbackType,
                reason: reason || null,
                pointsChanged: pointChange,
                previousScore: currentScore,
                newScore: newScore,
                newLevel: newLevel,
                createdAt: FieldValue.serverTimestamp()
            });

            // SUSPENSION CHECK
            if (newLevel === 'Suspendido' && currentScore >= 40) {
                transaction.update(targetUserRef, {
                    accountStatus: 'suspended',
                    isSuspended: true,
                    suspensionReason: `Suspendido por VamO Score (Grave/Fraude)`,
                    suspendedAt: FieldValue.serverTimestamp()
                });
            }

            logger.info(`[VAMO_SCORE] Updated user ${targetUserId} score: ${currentScore} -> ${newScore} (${newLevel}) due to ${feedbackType}`);
        }

        logger.info(`[FEEDBACK_GUARD] feedback saved for ride ${rideId}`);
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

    const timestamp = FieldValue.serverTimestamp();
    const suspensionUpdates: any = {};
    if (suspend) {
        suspensionUpdates.adminSuspended = true;
        suspensionUpdates.adminSuspensionReason = 'Suspensión administrativa';
        suspensionUpdates.adminSuspendedAt = timestamp;
        suspensionUpdates.adminSuspendedBy = request.auth?.uid || 'admin';
    } else {
        suspensionUpdates.adminSuspended = false;
        suspensionUpdates.adminSuspensionReason = null;
        suspensionUpdates.adminSuspendedAt = null;
        suspensionUpdates.adminSuspendedBy = null;
    }

    const isTraffic = userData.trafficSuspended === undefined ? false : !!userData.trafficSuspended;
    const isMuni = userData.municipalSuspended === undefined ? false : !!userData.municipalSuspended;
    const isAdmin = suspensionUpdates.adminSuspended;

    const finalIsSuspended = isTraffic || isMuni || isAdmin;
    let finalSuspensionSource: 'admin' | 'municipal' | 'traffic' | null = null;
    if (isAdmin) {
        finalSuspensionSource = 'admin';
    } else if (isMuni) {
        finalSuspensionSource = 'municipal';
    } else if (isTraffic) {
        finalSuspensionSource = 'traffic';
    }

    const finalSuspensionReason = isAdmin ? suspensionUpdates.adminSuspensionReason : (isMuni ? userData.municipalSuspensionReason : (isTraffic ? userData.trafficSuspensionReason : null));

    const updatedDriverData = { 
        ...userData, 
        ...suspensionUpdates,
        isSuspended: finalIsSuspended,
        suspensionSource: finalSuspensionSource,
        suspensionReason: finalSuspensionReason
    };
    const riskProfile = computeDriverRiskProfile(updatedDriverData);

    const batch = db.batch();
    batch.update(userRef, {
        ...riskProfile,
        ...suspensionUpdates,
        isSuspended: finalIsSuspended,
        suspensionSource: finalSuspensionSource,
        suspensionReason: finalSuspensionReason,
        municipalStatus: suspend ? 'suspended_by_admin' : 'active',
        driverStatus: "inactive", // Always set to inactive on status change
        updatedAt: timestamp,
    });
    batch.set(driverLocationRef, {
        isSuspended: finalIsSuspended,
        driverStatus: "inactive",
        driverRiskLevel: riskProfile.driverRiskLevel,
        driverRiskScore: riskProfile.driverRiskScore
    }, { merge: true });

    // Sync municipal profile if exists
    const muniRef = db.doc(`municipal_profiles/${driverId}`);
    const muniSnap = await muniRef.get();
    if (muniSnap.exists) {
        batch.update(muniRef, {
            ...suspensionUpdates,
            isSuspended: finalIsSuspended,
            suspensionSource: finalSuspensionSource,
            municipalStatus: suspend ? 'suspended_by_admin' : 'active',
            municipalObservation: suspend ? 'Suspensión por la Administración de VamO' : null,
            updatedAt: timestamp
        });
    }

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
    
    // [STAGE 2B] Consultar retiros pendientes
    const pendingSnap = await db.collection('withdrawal_requests')
        .where('driverId', '==', uid)
        .where('status', '==', 'pending')
        .get();
    
    let pendingWithdrawalBalance = 0;
    pendingSnap.forEach(doc => {
        pendingWithdrawalBalance += (doc.data().amount || 0);
    });

    const withdrawableBalance = (walletData.cashBalance || 0) - (driverData.nonWithdrawableBalance || 0) - pendingWithdrawalBalance;

    if (amount > withdrawableBalance) {
        throw new HttpsError("failed-precondition", `El monto solicitado excede tu saldo retirable disponible. Tenés saldo pendiente de retiro.`);
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
    const { requestId, action, transferReceiptNumber, paymentMethod, destinationAliasOrCvu, adminNote } = request.data;

    if (!requestId || !['approve', 'reject'].includes(action)) {
        throw new HttpsError("invalid-argument", "Falta requestId o la acción es inválida.");
    }

    if (action === 'approve') {
        if (!transferReceiptNumber || !paymentMethod || !destinationAliasOrCvu) {
            throw new HttpsError("invalid-argument", "Para aprobar, se requiere comprobante, método de pago y alias destino.");
        }
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

        const finalStatus = action === 'approve' ? 'paid' : 'rejected';

        const updateData: any = {
            status: finalStatus,
            processedAt: FieldValue.serverTimestamp(),
            processedBy: adminUid,
        };

        if (action === 'approve') {
            updateData.transferReceiptNumber = transferReceiptNumber;
            updateData.paymentMethod = paymentMethod;
            updateData.destinationAliasOrCvu = destinationAliasOrCvu;
        }
        
        if (adminNote) {
            updateData.adminNote = adminNote;
        }

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
                note: adminNote || 'Retiro de saldo aprobado por admin.',
                paymentMethod,
                transferReceiptNumber,
                destinationAliasOrCvu,
                previousBalance,
                newBalance,
                cityKey: requestData.cityKey,
                createdAt: FieldValue.serverTimestamp(),
                systemVersion: 'v1_withdrawal',
            });
        }
        tx.update(requestRef, updateData);
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

    // Solo actualizar si NO tiene cityKey pero SÍ tiene city
    if (!after.cityKey && after.city) {
        const expectedCityKey = canonicalCityKey(after.city);
        const db = getDb();
        logger.info(`onUserUpdateV1: Asignando cityKey para ${event.params.uid}. city: '${after.city}', nuevo cityKey: '${expectedCityKey}'`);

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
        city, cityKey, cityLabel, carModelYear, vehicleType, vehicleFrontPhotoURL,
        servicesOffered, vehicleVerificationStatus, vehicle, passengerPreferences
    } = request.data;

    logger.info(`[PASSENGER_AUTH_AUDIT][PROFILE_UPDATE_START] uid=${auth.uid}`, { data: request.data });

    const db = getDb();
    const userRef = db.collection("users").doc(auth.uid);
    const now = FieldValue.serverTimestamp();

    try {
        await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new HttpsError("not-found", "User profile not found.");
            const userData = userSnap.data() as UserProfile;

            const updates: any = {
                updatedAt: now
            };

            if (name) updates.name = name;
            if (surname) updates.surname = surname;
            if (displayName) updates.displayName = displayName;
            if (gender) updates.gender = gender;
            if (photoURL) updates.photoURL = photoURL;
            if (dni) {
                const normalizedDni = String(dni).replace(/\D/g, '');
                const dniIndexRef = db.collection("dni_index").doc(normalizedDni);
                const dniSnap = await transaction.get(dniIndexRef);

                if (dniSnap.exists && dniSnap.data()?.uid !== auth.uid) {
                    logger.warn(`[PASSENGER_AUTH_AUDIT][DNI_DUPLICATE_BLOCKED] uid=${auth.uid} dni=${normalizedDni}`);
                    throw new HttpsError("already-exists", "Este DNI ya está registrado en VamO.");
                }

                transaction.set(dniIndexRef, {
                    uid: auth.uid,
                    email: userData.emailLower || userData.email || auth.token.email?.toLowerCase() || "",
                    createdAt: FieldValue.serverTimestamp(),
                    source: "updateProfileV1"
                }, { merge: true });

                updates.dni = dni;
            }

            if (phone) {
                const normalizedPhone = normalizePhone(phone);
                const phoneIndexRef = db.collection("phone_index").doc(normalizedPhone);
                const phoneSnap = await transaction.get(phoneIndexRef);

                if (phoneSnap.exists && phoneSnap.data()?.uid !== auth.uid) {
                    logger.warn(`[PASSENGER_AUTH_AUDIT][PHONE_DUPLICATE_BLOCKED] uid=${auth.uid} phone=${normalizedPhone}`);
                    throw new HttpsError("already-exists", "Este número de teléfono ya está registrado en VamO.");
                }

                transaction.set(phoneIndexRef, {
                    uid: auth.uid,
                    email: userData.emailLower || userData.email || auth.token.email?.toLowerCase() || "",
                    createdAt: FieldValue.serverTimestamp(),
                    source: "updateProfileV1"
                }, { merge: true });

                updates.phone = phone;
                updates.phoneNormalized = normalizedPhone;
            }

            if (profileCompleted !== undefined) {
                updates.profileCompleted = profileCompleted;
                if (profileCompleted === true) {
                    updates.registrationStatus = "active";
                    updates.onboardingIncomplete = false;
                }
            }
            if (onboardingCompleted !== undefined) updates.onboardingCompleted = onboardingCompleted;
            if (termsAccepted !== undefined) updates.termsAccepted = termsAccepted;
            
            if (cityKey) {
                const normalizedKey = normalizeCityKey(cityKey);
                updates.cityKey = normalizedKey;
                const derivedCity = city || cityLabel || (normalizedKey === 'rawson' ? 'Rawson' : (normalizedKey === 'trelew' ? 'Trelew' : (normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1))));
                if (derivedCity) {
                    updates.city = derivedCity;
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
            if (cityLabel) updates.cityLabel = cityLabel;
            if (passengerPreferences !== undefined) updates.passengerPreferences = passengerPreferences;

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

            transaction.update(userRef, updates);
        });

        const latency = Date.now() - startTime;
        logger.info(`[PASSENGER_AUTH_AUDIT][PROFILE_UPDATE_SUCCESS] uid=${auth.uid} latency=${latency}ms`);
        return { success: true };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[PASSENGER_AUTH_AUDIT][PROFILE_UPDATE_ERROR] uid=${auth.uid}`, error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * [VamO PRO] BILLETERA / HARDENING GHOST LOCKS
 * Limpia automáticamente bloqueos de billetera que quedaron huérfanos.
 * Ejecuta cada 1 hora y revisa bloqueos de más de 15 minutos.
 */
export const clearStaleWalletLocksV1 = onSchedule({
    schedule: "0 * * * *", 
    timeZone: "America/Argentina/Buenos_Aires",
    memory: "256MiB"
}, async (event: ScheduledEvent) => {
    const db = getDb();
    const now = Date.now();
    const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutos para mayor agilidad

    logger.info("[WALLET_WATCHDOG] Starting stale lock cleanup...");

    try {
        // Buscamos billeteras que fueron actualizadas hace más de 15 minutos
        const staleWalletsSnap = await db.collection('wallets')
            .where('updatedAt', '<', Timestamp.fromMillis(now - STALE_THRESHOLD_MS))
            .get();

        let cleanedCount = 0;

        for (const walletDoc of staleWalletsSnap.docs) {
            const data = walletDoc.data();
            const lockedCash = data.lockedCash || 0;
            const lockedPromo = data.lockedPromo || 0;

            if (lockedCash > 0 || lockedPromo > 0) {
                const lockedRideId = data.lockedRideId;
                const lockedAt = data.lockedAt ? (data.lockedAt as Timestamp).toMillis() : 0;
                
                let shouldClear = false;
                let reason = "";

                if (lockedRideId) {
                    // Si hay un rideId bloqueado, verificamos su estado exacto
                    const rideSnap = await db.collection('rides').doc(lockedRideId).get();
                    if (!rideSnap.exists) {
                        shouldClear = true;
                        reason = `locked_ride_not_found_${lockedRideId}`;
                    } else {
                        const rideStatus = rideSnap.data()?.status;
                        const inactiveStatuses = ['completed', 'cancelled', 'failed'];
                        if (inactiveStatuses.includes(rideStatus)) {
                            shouldClear = true;
                            reason = `ride_${lockedRideId}_is_${rideStatus}`;
                        }
                    }
                } else {
                    // Si NO hay rideId (bloqueo antiguo o huérfano sin metadata)
                    // Actuamos con precaución extrema: verificamos CUALQUIER viaje activo del usuario
                    const activeRidesSnap = await db.collection('rides')
                        .where('passengerId', '==', walletDoc.id)
                        .where('status', 'in', ['searching', 'offered', 'driver_assigned', 'accepted', 'arrived', 'picked_up'])
                        .limit(1)
                        .get();

                    if (activeRidesSnap.empty) {
                        // Solo liberamos si pasaron más de 2 horas (ultra conservador para huérfanos sin ID)
                        const STALE_ORPHAN_THRESHOLD = 2 * 60 * 60 * 1000;
                        if (Date.now() - lockedAt > STALE_ORPHAN_THRESHOLD) {
                            shouldClear = true;
                            reason = "stale_orphan_no_metadata_2h";
                        } else {
                            logger.info(`[WALLET_WATCHDOG] Skipping orphan lock for ${walletDoc.id} (no metadata, not old enough)`);
                        }
                    }
                }

                if (shouldClear) {
                    logger.warn(`[WALLET_WATCHDOG] Found Ghost Lock for user ${walletDoc.id}. RideId: ${lockedRideId || 'N/A'}. Cash: ${lockedCash}, Promo: ${lockedPromo}. Reason: ${reason}. Clearing...`);
                    
                    await db.runTransaction(async (tx) => {
                        const wSnap = await tx.get(walletDoc.ref);
                        const wData = wSnap.data();
                        if (!wData || (wData.lockedCash || 0) === 0 && (wData.lockedPromo || 0) === 0) return;

                        tx.update(walletDoc.ref, {
                            lockedCash: 0,
                            lockedPromo: 0,
                            lockedRideId: null,
                            lockedAt: null,
                            updatedAt: FieldValue.serverTimestamp(),
                            watchdogClearedAt: FieldValue.serverTimestamp(),
                            watchdogReason: reason
                        });

                        // Log en ledger de auditoría
                        const logRef = db.collection('ledger_events').doc();
                        tx.set(logRef, {
                            eventType: 'wallet_lock_purged',
                            actorId: 'system_watchdog',
                            targetId: walletDoc.id,
                            metadata: {
                                previousLockedCash: lockedCash,
                                previousLockedPromo: lockedPromo,
                                reason: 'stale_no_active_ride'
                            },
                            createdAt: FieldValue.serverTimestamp()
                        });
                    });
                    cleanedCount++;
                }
            }
        }

        logger.info(`[WALLET_WATCHDOG] Cleanup finished. Cleaned ${cleanedCount} wallets.`);
    } catch (error) {
        logger.error("[WALLET_WATCHDOG] Critical failure during cleanup:", error);
    }
});
