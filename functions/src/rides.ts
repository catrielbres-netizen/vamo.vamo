import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";
import * as geofire from "geofire-common";
import { getDb, getFunctions } from "./lib/firebaseAdmin";
import { normalizeCity, canonicalCityKey } from "./lib/city";
import { resolvePricingMunicipality } from "./lib/territoryResolver";
import { canDriverReceiveOffers, canPassengerRequestRide } from "./eligibility";
import { calculateRidePrice, PricingInput } from "./lib/pricing";
import { CITY_DEFINITIONS } from "./lib/cityResolver";
import { getExpressDiscountPercent } from "./lib/passengerProgress";
import { lockWalletForRide, getOrCreateWallet, addFunds } from "./lib/wallet";
import { checkPromotionEligibility } from "./promotions";
import { calculateAndLockCredits, releaseLockedCredits, INCENTIVE_CONFIG } from "./lib/incentives";
import { handleRideCancellationFinancials } from "./lib/refund";
import { ensureServiceInvariants, sendNotification } from "./handlers";
import { logLedgerEvent } from "./lib/audit";
import { getPassengerRiskSummary } from "./lib/antifraud";
import { calculateUserTrustScore } from "./lib/trustScoring";
import {
    UserProfile, Ride, RideOffer, ServiceType, ExpressConfig,
    ExpressBudget, SystemConfig, Promotion, Place, PricingConfig,
    CityConfig, Referral, UserReward, PricingSnapshot, PaymentSnapshot
} from "./types";
import { assertSharedPassengersHaveRequestIds } from "./lib/sharedHelpers";

const OFFER_DURATION_SECONDS = 60;
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

/**
 * [VamO PRO] Determine if a time belongs to NIGHT tariff (23:00 - 06:00 ARG)
 */
function getIsNight(date: Date): boolean {
    const argentinaHour = parseInt(
        new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: 'numeric',
            hour12: false
        }).format(date),
        10
    );
    return argentinaHour >= 23 || argentinaHour < 6;
}

async function isRawsonBroadcastEnabled(
    db: FirebaseFirestore.Firestore
): Promise<boolean> {
    try {
        // [VamO PRO] Unified config read
        const sysSnap = await db.doc("system_config/global").get();
        if (sysSnap.exists) {
            const data = sysSnap.data();
            if (data?.rawsonBroadcastEnabled !== undefined) return data.rawsonBroadcastEnabled;
        }
        return false;
    } catch (err) {
        console.error("MATCHING_CONFIG_READ_ERROR", err);
        return false;
    }
}

async function hasPendingOffersForRide(
    db: FirebaseFirestore.Firestore,
    rideId: string
): Promise<boolean> {
    const snap = await db
        .collection("rideOffers")
        .where("rideId", "==", rideId)
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
    
    // [VamO PRO] Unified config read
    const sysSnap = await db.doc('system_config/global').get();
    if (sysSnap.exists) {
        return sysSnap.data() as SystemConfig;
    }

    return { 
        matchingEnabled: true, 
        expressEnabled: true, 
        globalMaintenance: false,
        maxMatchingAttempts: 10,
        offerDurationSeconds: 60 
    };
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
    if (attempt <= 1) return 2500;
    if (attempt === 2) return 4000;
    if (attempt === 3) return 6000;
    return 8000;
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
            logger.warn(`[MATCH_GUARD] ride not assignable. Status: ${rideData.status}. RideId: ${rideId}`);
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

        const hasPending = await hasPendingOffersForRide(db, rideId);
        if (hasPending) {
            logger.warn(`[MATCH_GUARD] Ride ${rideId} already has pending offers. Skipping redundant matching attempt.`);
            return;
        }

        const isRawsonBroadcast = (await isRawsonBroadcastEnabled(db)) || pricingMunicipalityKey === "rawson";

        const center = [rideData.origin.lat, rideData.origin.lng] as geofire.Geopoint;
        const currentAttempts = rideData.matchingAttempts || 0;
        const radiusInM = getMatchingRadiusByAttempt(currentAttempts + 1);
        const bounds = geofire.geohashQueryBounds(center, radiusInM);

        logger.info(`[MATCH_DEBUG] Geofire Search: Ride=${rideId}, Origin=${center[0]},${center[1]}, Radius=${radiusInM}m, Attempt=${currentAttempts + 1}`);

        const isSimulation = (rideData as any).isSimulation === true;
        
        // [VamO PRO] Scheduled Priority Logic
        const interestedIds = rideData.interestedDriverIds || [];
        const hasInterested = interestedIds.length > 0;
        
        const geoCandidates: { id: string, distanceKm: number, walletBalance?: number }[] = [];
        
        if (hasInterested && currentAttempts === 0) {
            logger.info(`[MATCH_DEBUG] Scheduled ride ${rideId} has ${interestedIds.length} interested drivers. Checking their eligibility first.`);
            for (const id of interestedIds) {
                const locSnap = await db.collection('drivers_locations').doc(id).get();
                if (!locSnap.exists) continue;
                const data = locSnap.data();
                if (!data) continue;
                
                const lat = data.currentLocation?.latitude ?? data.currentLocation?.lat;
                const lng = data.currentLocation?.longitude ?? data.currentLocation?.lng;
                if (lat === undefined || lng === undefined) continue;
                
                const driverPos = [lat, lng] as geofire.Geopoint;
                const distanceKm = geofire.distanceBetween(driverPos, center);
                const isOnline = data.driverStatus === 'online';
                const isApproved = data.approved === true;
                const notSuspended = data.isSuspended !== true;

                // Priority candidates must be online and approved
                if (isOnline && isApproved && notSuspended) {
                    geoCandidates.push({ id, distanceKm, walletBalance: data.walletBalance ?? 0 });
                }
            }
            logger.info(`[MATCH_DEBUG] Found ${geoCandidates.length} eligible interested drivers.`);
        }

        // [FASE 4] Taxi Stand Priority Logic
        const isStationPriority = rideData.stationId && rideData.stationDispatchStatus === 'station_priority';
        
        if (geoCandidates.length === 0 && isStationPriority && currentAttempts === 0) {
            logger.info(`[MATCH_DEBUG] Ride ${rideId} has station priority for ${rideData.stationId}. Checking station drivers in users collection.`);
            
            // 1. Fetch from 'users' collection to find who belongs to this station
            const usersSnap = await db.collection('users')
                .where('role', '==', 'driver')
                .where('stationId', '==', rideData.stationId)
                .get();
                
            logger.info(`[MATCH_DEBUG] Found ${usersSnap.size} drivers linked to station ${rideData.stationId} in users collection.`);

            // 2. For each user, check their real-time status in drivers_locations
            for (const userDoc of usersSnap.docs) {
                const uid = userDoc.id;
                const uData = userDoc.data();
                
                // Early validation of city
                if (uData.cityKey && rideData.cityKey && uData.cityKey !== rideData.cityKey) continue;
                
                // Fetch drivers_locations to check online status and coordinates
                const dLocSnap = await db.collection('drivers_locations').doc(uid).get();
                if (!dLocSnap.exists) {
                    logger.warn(`[MATCH_DEBUG] Station Priority candidate ${uid} discarded: No drivers_locations document`);
                    continue;
                }
                
                const data = dLocSnap.data();
                if (!data) continue;
                
                const lat = data.currentLocation?.latitude ?? data.currentLocation?.lat;
                const lng = data.currentLocation?.longitude ?? data.currentLocation?.lng;
                if (lat === undefined || lng === undefined) {
                    logger.warn(`[MATCH_DEBUG] Station Priority candidate ${uid} discarded: No valid coordinates`);
                    continue;
                }
                
                const isOnline = data.driverStatus === 'online';
                // we allow pending_municipal_review in some cases, but generally approved is needed. 
                const isApproved = data.approved === true || data.municipalStatus === 'pending_municipal_review';
                const notSuspended = data.isSuspended !== true;
                const balance = data.walletBalance ?? 0;
                
                // Check if they are professional to apply the correct negative limit
                // if driverSubtype is missing in drivers_locations, we check uData
                const isProfessional = data.driverSubtype === 'professional' || uData.driverSubtype === 'professional';
                const negativeLimit = isProfessional ? -15000 : -8000;
                const hasFunds = balance > negativeLimit;
                
                if (isOnline && isApproved && notSuspended && hasFunds) {
                    const driverPos = [lat, lng] as geofire.Geopoint;
                    const distanceKm = geofire.distanceBetween(driverPos, center);
                    geoCandidates.push({ id: uid, distanceKm, walletBalance: balance });
                    logger.info(`[MATCH_DEBUG] Station Priority candidate accepted: ${uid}`);
                } else {
                    logger.warn(`[MATCH_DEBUG] Station Priority candidate ${uid} discarded: online=${isOnline}, approved=${isApproved}, notSuspended=${notSuspended}, hasFunds=${hasFunds}`);
                }
            }
            logger.info(`[MATCH_DEBUG] Found ${geoCandidates.length} eligible priority station drivers.`);
            
            if (geoCandidates.length > 0) {
                await db.doc(`rides/${rideId}`).update({
                    stationPriorityAttempted: true,
                    stationPriorityDriverIds: geoCandidates.map(c => c.id),
                    stationPriorityRound: currentAttempts + 1
                });
            }
        }

        // Fallback to geosearch if no interested drivers found or it's a retry
        if (geoCandidates.length === 0) {
            const snapshots = await Promise.all(bounds.map(b => {
                return db.collection('drivers_locations')
                    .where('geohash', '>=', b[0])
                    .where('geohash', '<=', b[1])
                    .get();
            }));

            snapshots.forEach((snap) => {
                snap.forEach(doc => {
                const data = doc.data();
                const driverId = doc.id;
                
                const lat = data.currentLocation?.latitude ?? data.currentLocation?.lat;
                const lng = data.currentLocation?.longitude ?? data.currentLocation?.lng;

                if (lat === undefined || lng === undefined) {
                    logger.warn(`[MATCH_DEBUG] Candidate ${driverId} discarded: Missing currentLocation coords in drivers_locations.`);
                    return;
                }
                
                // [SIM_MATCHING] Isolation Guard
                const isTestDriver = data.isTestDriver === true;
                if (isSimulation && !isTestDriver) {
                    logger.info(`[SIM_MATCHING] Skipping REAL driver ${driverId} for simulation ride ${rideId}`);
                    return;
                }
                if (!isSimulation && isTestDriver) {
                    logger.info(`[SIM_MATCHING] Skipping TEST driver ${driverId} for real ride ${rideId}`);
                    return;
                }

                const driverPos = [lat, lng] as geofire.Geopoint;
                const distanceKm = geofire.distanceBetween(driverPos, center);
                const distanceM = distanceKm * 1000;

                const isOnline = data.driverStatus === 'online';
                const isApproved = data.approved === true;
                const notSuspended = data.isSuspended !== true; // Resilience: Allow if missing

                logger.info(`[MATCH_DEBUG] Candidate Found (Geo): ${driverId}, Dist=${distanceM.toFixed(1)}m, Status=${data.driverStatus}, Approved=${data.approved}, Suspended=${data.isSuspended}, isTest=${isTestDriver}`);

                if (distanceM <= radiusInM) {
                    // [ISOLATED_MATCHING] Logic separation
                    if (!isSimulation) {
                        // PRODUCTION RULE: Must be online, (approved OR pending_review) and not suspended
                        const isEligible = isOnline && (isApproved || data.municipalStatus === 'pending_municipal_review') && notSuspended;
                        
                        // [VamO PRO] Wallet Balance Pre-Check (Optimization)
                        const balance = data.walletBalance ?? 0;
                        const negativeLimit = data.driverSubtype === 'professional' ? -15000 : -8000;
                        const hasFunds = balance > negativeLimit;

                        // [VamO PRO] Dynamic Pricing Preference Filter
                        const satisfiesPreferences = true;

                        if (isEligible && hasFunds && satisfiesPreferences) {
                            geoCandidates.push({ id: driverId, distanceKm, walletBalance: balance });
                        } else {
                            logger.warn(`[MATCH_DEBUG] Candidate ${driverId} discarded (REAL PASS): online=${isOnline}, approved=${isApproved}, status=${data.municipalStatus}, suspended=${!notSuspended}, hasFunds=${hasFunds}, satisfiesPreferences=${satisfiesPreferences} (bal: ${balance})`);
                        }
                    } else {
                        // TEST RULE: Must be a test driver (guard at line 181 ensures this), online and not suspended. 
                        // We allow non-approved test drivers to facilitate isolated testing.
                        if (isOnline && notSuspended) {
                            geoCandidates.push({ id: driverId, distanceKm });
                            logger.info(`[MATCH_DEBUG] TEST Candidate ${driverId} accepted for simulation ride.`);
                        } else {
                            logger.warn(`[MATCH_DEBUG] TEST Candidate ${driverId} discarded (TEST PASS): online=${isOnline}, suspended=${!notSuspended}`);
                        }
                    }
                }
            });
        });
    }

        const zone = rideData.origin.zoneName || "Unknown";
        logger.info(`[MATCH_RADIUS] Zone: ${zone}, Attempt: ${currentAttempts + 1}, Radius: ${radiusInM}m, Candidates Found: ${geoCandidates.length}`);

        if (geoCandidates.length === 0) {
            const currentAttempts = (rideData.matchingAttempts || 0) + 1;
            logger.warn(`[MATCH_GUARD] no eligible drivers found within radius. Attempt: ${currentAttempts}`);
            
            await rideRef.update({
                searchRadiusKmUsed: radiusInM / 1000,
                lastMatchingFailureReason: 'NO_DRIVERS_NEARBY',
                matchingAttempts: currentAttempts,
                updatedAt: FieldValue.serverTimestamp()
            });

            if (currentAttempts >= MAX_MATCHING_ATTEMPTS) {
                logger.error(`[MATCH_DEBUG] Max attempts reached (${MAX_MATCHING_ATTEMPTS}). Cancelling ride ${rideId}.`);
                await db.runTransaction(async (tx) => {
                    const rSnap = await tx.get(rideRef);
                    if (!rSnap.exists) return;
                    const rData = rSnap.data() as Ride;
                    if (rData.status !== 'searching') return;

                    const rideUpdate: any = {
                        status: 'cancelled',
                        cancelledBy: 'system',
                        cancelReason: 'MAX_MATCHING_ATTEMPTS_REACHED',
                        cancelledAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    };
                    const userUpdate: any = { activeRideId: null };

                    // [VamO PRO] Unified Financial & Policy Handler (Must read before write)
                    await handleRideCancellationFinancials({
                        rideId,
                        reason: 'MAX_MATCHING_ATTEMPTS_REACHED',
                        actor: 'system',
                        tx,
                        rideData: rData,
                        rideUpdate,
                        userUpdate
                    });

                    tx.update(rideRef, rideUpdate);

                    if (rData.passengerId) {
                        tx.update(db.doc(`users/${rData.passengerId}`), userUpdate);
                    }
                });
            }
            return;
        }

        geoCandidates.sort((a, b) => a.distanceKm - b.distanceKm);
        const topCandidates = geoCandidates.slice(0, 10);

        const round = (rideData.matchingAttempts || 0) + 1;
        const finalCandidates: { id: string, distanceKm: number, profile: UserProfile }[] = [];

        for (const candidate of topCandidates) {
            const driverId = candidate.id;
            const userSnap = await db.doc(`users/${driverId}`).get();
            const p = userSnap.data() as UserProfile;

            if (!userSnap.exists || !p) {
                logger.warn(`[MATCH_DEBUG] Candidate ${driverId} discarded: Profile not found.`);
                continue;
            }

            // [WALLET] Ensure driver has enough balance and is eligible
            // Optimization: use walletBalance from drivers_locations if available
            const cashBalance = (candidate as any).walletBalance;

            const eligibility = canDriverReceiveOffers(
                p, 
                rideData.serviceType, 
                undefined, 
                { 
                    hasPet: (rideData as any).hasPet, 
                    paymentMethod: rideData.paymentMethod 
                }, 
                cashBalance
            );
            
            if (!eligibility.isEligible) {
                logger.warn(`[MATCH_DEBUG] Candidate ${driverId} discarded (eligibility): ${eligibility.reason} (cash: ${cashBalance ?? 'MISSING_LOC'})`);
                continue;
            }

            finalCandidates.push({ id: driverId, distanceKm: candidate.distanceKm, profile: p });
        }

        if (finalCandidates.length === 0) {
            logger.warn(`[MATCH_GUARD] No drivers passed profile filters. Attempt: ${round}`);
            await rideRef.update({
                searchRadiusKmUsed: radiusInM / 1000,
                lastMatchingFailureReason: 'DRIVERS_BUSY_OR_OFFLINE',
                matchingAttempts: round,
                updatedAt: FieldValue.serverTimestamp()
            });
            return;
        }
        // --- Priority Sort & Selection ---

        // [FASE 7.3] Priority sort: dentro del mismo pool de candidatos,
        // conductores con priorityUntil > now van primero (sin excluir a nadie).
        const nowMs = Date.now();
        finalCandidates.sort((a, b) => {
            const aHasPriority = (a.profile as any).priorityUntil?.toMillis
                ? (a.profile as any).priorityUntil.toMillis() > nowMs
                : false;
            const bHasPriority = (b.profile as any).priorityUntil?.toMillis
                ? (b.profile as any).priorityUntil.toMillis() > nowMs
                : false;
            if (aHasPriority && !bHasPriority) return -1;
            if (!aHasPriority && bHasPriority) return 1;
            // Mismo nivel de prioridad → menor distancia primero
            return a.distanceKm - b.distanceKm;
        });
        finalCandidates.forEach(c => {
            const hasPriority = (c.profile as any).priorityUntil?.toMillis
                ? (c.profile as any).priorityUntil.toMillis() > nowMs
                : false;
            logger.info(`[PRIORITY_MATCH] driverId=${c.id} | hasPriority=${hasPriority} | distance=${(c.distanceKm * 1000).toFixed(0)}m`);
        });

        const expiresAt = Timestamp.fromMillis(Date.now() + OFFER_DURATION_SECONDS * 1000);

        if (isRawsonBroadcast) {
            const winners = finalCandidates.slice(0, MAX_BROADCAST_DRIVERS);
            const winnerIds = winners.map(w => w.id);
            logger.info(`[MATCH_DEBUG] Rawson Broadcast branch: choosing ${winners.length} drivers: ${winnerIds.join(',')}`);

            const passengerSnap = await db.doc(`users/${rideData.passengerId}`).get();
            const passengerName = passengerSnap.data()?.name || "Pasajero";

            // [VamO PRO] Anti-Fraud Trust Signal
            const riskSummary = await getPassengerRiskSummary(rideData.passengerId);

            const batch = db.batch();
            for (const winner of winners) {
                const offerId = `${rideId}_${winner.id}`;
                const finalPricing = (rideData.pricing || {}) as any;
                const offerData: RideOffer = {
                    rideId,
                    driverId: winner.id,
                    passengerId: rideData.passengerId,
                    status: 'pending',
                    sentAt: FieldValue.serverTimestamp(),
                    expiresAt,
                    round,
                    origin: rideData.origin,
                    destination: rideData.destination,
                    serviceType: rideData.serviceType,
                    estimatedTotal: finalPricing.estimatedTotal ?? 0,
                    cashToCollect: finalPricing.cashToCollect ?? 0,
                    walletCoveredAmount: finalPricing.walletCoveredAmount ?? 0,
                    pricing: {
                        ...finalPricing,
                        dynamic: finalPricing.dynamic || null
                    } as any,
                    paymentMethod: rideData.paymentMethod || 'cash',
                    durationMinutes: rideData.durationMinutes || 0,
                    passengerName,
                    cityKey: pricingMunicipalityKey,
                    passengerRiskSummary: riskSummary,
                    // [VamO Compartido] Copy shared properties to offer
                    rideType: rideData.rideType || 'standard',
                    isSharedRide: rideData.isSharedRide || false,
                    sharedGroupId: (rideData as any).sharedGroupId ?? null,
                    sharedPassengerCount: (rideData as any).sharedPassengerCount ?? null,
                    sharedFarePerPassenger: (rideData as any).sharedFarePerPassenger ?? null,
                    pickupStopsCount: (rideData as any).pickupStops?.length ?? null,
                    dropoffStopsCount: (rideData as any).dropoffStops?.length ?? null,
                    orderedStopsPreview: (rideData as any).orderedStops ?? null,
                    individualFareReference: (rideData as any).estimatedIndividualFare || 0,
                    driverBenefitAmount: (rideData as any).driverBenefitAmount || 0,
                    sharedPassengers: (rideData as any).sharedPassengers || []
                };
                batch.set(db.collection('rideOffers').doc(offerId), offerData);
                console.log(`[MATCH_DEBUG] rideOffer created (broadcast):`, offerId);
            }

            batch.update(rideRef, {
                currentOfferedDriverId: winnerIds[0],
                matchingExpiresAt: expiresAt,
                matchingAttempts: round,
                searchRadiusKmUsed: radiusInM / 1000,
                notifiedDrivers: FieldValue.arrayUnion(...winnerIds),
                updatedAt: FieldValue.serverTimestamp(),
                lastOfferCreatedAt: FieldValue.serverTimestamp()
            });

            // [VamO PRO] Increment pendingOffers for all notified drivers
            for (const winnerId of winnerIds) {
                batch.update(db.collection('drivers_locations').doc(winnerId), {
                    pendingOffers: FieldValue.increment(1)
                });
            }

            await batch.commit();
            logger.info(`[MATCH_DEBUG] Broadcast round ${round} SUCCESS: ${winners.length} offers created.`);

            for (const winnerId of winnerIds) {
                const offerId = `${rideId}_${winnerId}`;
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

                // [VamO PRO] Anti-Fraud Trust Signal
                const riskSummary = await getPassengerRiskSummary(rideData.passengerId);

                const offerId = `${rideId}_${nextDriverId}`;
                const finalPricing = (rideData.pricing || {}) as any;
                const offerData: RideOffer = {
                    rideId,
                    driverId: nextDriverId,
                    passengerId: rideData.passengerId,
                    status: 'pending',
                    sentAt: FieldValue.serverTimestamp(),
                    expiresAt,
                    round,
                    origin: rideData.origin,
                    destination: rideData.destination,
                    serviceType: rideData.serviceType,
                    estimatedTotal: finalPricing.estimatedTotal ?? 0,
                    cashToCollect: finalPricing.cashToCollect ?? 0,
                    walletCoveredAmount: finalPricing.walletCoveredAmount ?? 0,
                    pricing: {
                        ...finalPricing,
                        dynamic: finalPricing.dynamic || null
                    } as any,
                    paymentMethod: rideData.paymentMethod || 'cash',
                    durationMinutes: rideData.durationMinutes || 0,
                    passengerName,
                    cityKey: pricingMunicipalityKey,
                    passengerRiskSummary: riskSummary,
                    // [VamO Compartido] Copy shared properties to offer
                    rideType: rideData.rideType || 'standard',
                    isSharedRide: rideData.isSharedRide || false,
                    sharedGroupId: (rideData as any).sharedGroupId ?? null,
                    sharedPassengerCount: (rideData as any).sharedPassengerCount ?? null,
                    sharedFarePerPassenger: (rideData as any).sharedFarePerPassenger ?? null,
                    pickupStopsCount: (rideData as any).pickupStops?.length ?? null,
                    dropoffStopsCount: (rideData as any).dropoffStops?.length ?? null,
                    orderedStopsPreview: (rideData as any).orderedStops ?? null,
                    individualFareReference: (rideData as any).estimatedIndividualFare || 0,
                    driverBenefitAmount: (rideData as any).driverBenefitAmount || 0,
                    sharedPassengers: (rideData as any).sharedPassengers || []
                };

                tx.set(db.collection('rideOffers').doc(offerId), offerData);
                console.log(`[MATCH_DEBUG] rideOffer created (sequential):`, offerId);
                tx.update(rideRef, {
                    currentOfferedDriverId: nextDriverId,
                    matchingExpiresAt: expiresAt,
                    matchingAttempts: round,
                    searchRadiusKmUsed: radiusInM / 1000,
                    notifiedDrivers: FieldValue.arrayUnion(nextDriverId),
                    updatedAt: FieldValue.serverTimestamp()
                });

                // [VamO PRO] Increment pendingOffers for the chosen driver
                tx.update(db.collection('drivers_locations').doc(nextDriverId), {
                    pendingOffers: FieldValue.increment(1)
                });
                logger.info(`[MATCH_DEBUG] Transaction SUCCESS: Offer ${offerId} created.`);
            });

            const offerId = `${rideId}_${nextDriverId}`;
            await getFunctions().taskQueue('expireRideOfferTaskV1').enqueue(
                { offerId, rideId },
                { scheduleDelaySeconds: OFFER_DURATION_SECONDS }
            ).catch(e => logger.error(`Task queue failed`, e));
        }

    } catch (e) {
        console.log(`[MATCH_DEBUG] matcher fatal error`, e);
        logger.error(`[MATCH_DEBUG] CRITICAL_ERROR:`, e);
    }
}

async function detectNearbyTaxiStand(db: FirebaseFirestore.Firestore, cityKey: string, originLat: number, originLng: number) {
    try {
        const standsQuery = await db.collection('taxi_stands')
            .where('cityKey', '==', cityKey)
            .get();
            
        let closestStand: any = null;
        let minDistanceMeters = Infinity;

        standsQuery.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'active' && data.active !== true) return;
            
            const lat = data.location?._latitude ?? data.location?.latitude ?? data.location?.lat;
            const lng = data.location?._longitude ?? data.location?.longitude ?? data.location?.lng;
            const radiusM = data.radiusMeters || 500;
            
            if (lat !== undefined && lng !== undefined) {
                const distKm = distanceInKm(originLat, originLng, lat, lng);
                const distM = distKm * 1000;
                
                if (distM <= radiusM && distM < minDistanceMeters) {
                    minDistanceMeters = distM;
                    closestStand = {
                        id: doc.id,
                        name: data.name,
                        radiusMeters: radiusM,
                        distanceMeters: Math.round(distM)
                    };
                }
            }
        });

        return closestStand;
    } catch (e) {
        logger.error('[detectNearbyTaxiStand] Error:', e);
        return null;
    }
}

export const createRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    let { origin, destination, serviceType, dryRun, promotionId, preferredDriverGender, clientRequestId, scheduledAt, paymentMethod = 'cash' } = request.data;
    const isScheduled = !!scheduledAt;
    
    // [FASE 3] Reservas: Solo efectivo por ahora, sin tocar wallet
    if (isScheduled) {
        paymentMethod = 'cash';
    }

    const passengerId = request.auth.uid;
    // Log request receipt and payload
    console.log('[createRideV1] request recibido');
    console.log('[createRideV1] auth.uid', request.auth.uid);
    console.log('[createRideV1] payload recibido', { origin, destination, serviceType, dryRun, promotionId, preferredDriverGender, clientRequestId, scheduledAt, paymentMethod });
    
    // Generate fallback clientRequestId if not provided by frontend
    const effectiveClientRequestId = clientRequestId || uuidv4();
    console.log('[createRideV1] clientRequestId', effectiveClientRequestId);
    
    const userRef = db.doc(`users/${passengerId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Perfil de usuario no encontrado.');
    const passengerProfile = userSnap.data() as UserProfile;

    const CURRENT_TERMS_V = 'v1.3';
    if (!dryRun && (!passengerProfile.termsAccepted || passengerProfile.termsVersion !== CURRENT_TERMS_V)) {
        throw new HttpsError('failed-precondition', 'Debes aceptar los Términos y Condiciones actualizados.');
    }

    if (!origin || !destination || !serviceType) {
        logger.warn('[CREATE_RIDE_GUARD] invalid payload');
        throw new HttpsError('invalid-argument', 'Faltan parámetros.');
    }

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
    // Log resolved pricing key
    console.log('[createRideV1] pricingMunicipalityKey resolved:', pricingMunicipalityKey);
    const pricingRef = db.doc(`municipal_pricing/${pricingMunicipalityKey}`);
    const pricingSnap = await pricingRef.get();
    console.log('[createRideV1] pricing existsBefore:', pricingSnap.exists);
    let pricingConfig: PricingConfig;
    if (!pricingSnap.exists) {
      console.log('[createRideV1] creating default municipal pricing:', pricingMunicipalityKey);
      await pricingRef.set({
        DAY_BASE_FARE: 300,
        DAY_PRICE_PER_100M: 110,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log('[createRideV1] created OK');
      // Re-read to verify
      const verifySnap = await pricingRef.get();
      console.log('[createRideV1] existsAfterSet:', verifySnap.exists);
      pricingConfig = verifySnap.data() as PricingConfig;
    } else {
      pricingConfig = pricingSnap.data() as PricingConfig;
    }
    console.log('[createRideV1] pricing config final:', pricingConfig);
    // Duplicate default pricing block removed
    // pricingConfig already set above
    // Removed duplicate pricePerKmFactor declaration; using cityPricingConfig later

    // Use pricingMunicipalityKey as the city identifier
    const finalCity = pricingMunicipalityKey;

    const cityKey = canonicalCityKey(finalCity);
    logger.info(`[createRideV1] Resolved cityKey: ${cityKey}`);
    
    const staticDef = CITY_DEFINITIONS[cityKey];
    if (staticDef && staticDef.status === 'draft') {
        logger.error(`[createRideV1] City ${cityKey} is explicitly marked as draft in code.`);
        throw new HttpsError('failed-precondition', `Esta ciudad aún no está habilitada para operar en VamO.`);
    }

    const citySnap = await db.doc(`cities/${cityKey}`).get();
    const cityConfig = citySnap.data() as any;

    if (!citySnap.exists || !cityConfig?.enabled) {
        logger.error(`[createRideV1] City ${cityKey} is not enabled or not found.`);
        throw new HttpsError('failed-precondition', `VamO aún no está disponible en ${finalCity}.`);
    }
    
    // NEW RULE: Check passenger access via operationalStatus or passengerAccess config
    const passengerAccessEnabled = cityConfig.passengerAccess?.enabled;
    const isOperative = cityConfig.operationalStatus === 'active' || passengerAccessEnabled;

    if (!isOperative) {
        logger.error(`[createRideV1] City ${cityKey} is not ready for passengers. Status: ${cityConfig.operationalStatus}`);
        throw new HttpsError('failed-precondition', `VamO se está preparando en ${finalCity}. Todavía no se pueden solicitar viajes.`);
    }
    const cityPricingConfig = cityConfig.pricing; if (!cityPricingConfig) { logger.error('[createRideV1] cityConfig.pricing missing'); throw new HttpsError('failed-precondition', 'Error de configuraci�n de ciudad.'); }
    
    const pricePerKmFactor = (cityPricingConfig as any).NIGHT_PRICE_PER_100M > 1000 ? 1 : 10;
    (cityPricingConfig as any)._pricePerKmFactor = pricePerKmFactor;

    if (!pricingConfig) {
        logger.error(`[createRideV1] Pricing config missing for city ${cityKey}`);
        throw new HttpsError('failed-precondition', 'La configuración de tarifas para esta ciudad no está disponible.');
    }

    // --- DYNAMIC PRICING ALGORITHM (VamO PRO) ---
    let dynamicConfig: any = undefined;
    if (pricingConfig.smartPricingEnabled) {
        const globalSmartPricingSnap = await db.doc('system_config/smart_pricing').get();
        if (globalSmartPricingSnap.exists) {
            dynamicConfig = globalSmartPricingSnap.data();
        }
    }
    if (dynamicConfig?.enabled && dynamicConfig?.algorithmMode === 'automatic') {
        const t0 = Date.now();
        // Count available drivers in this city
        const driversQuery = db.collection('drivers')
            .where('cityKey', '==', pricingMunicipalityKey)
            .where('status', '==', 'online');
        
        // Count active passenger requests in this city
        const activeStatuses = ['searching_driver', 'driver_assigned', 'in_progress', 'arrived_at_pickup', 'driver_arrived'];
        const ridesQuery = db.collection('rides')
            .where('cityKey', '==', pricingMunicipalityKey)
            .where('status', 'in', activeStatuses);

        const [driversCountSnap, ridesCountSnap] = await Promise.all([
            driversQuery.count().get(),
            ridesQuery.count().get()
        ]);

        const availableDrivers = driversCountSnap.data().count;
        const activeRides = ridesCountSnap.data().count;
        
        const ratio = activeRides / (availableDrivers + 1); // Avoid division by zero
        
        // Interpolate discount based on ratio
        // High Demand (Ratio >= 1.5) -> 0% discount
        // Low Demand (Ratio <= 0.5) -> maxDiscountPercent
        const maxDiscount = dynamicConfig.maxDiscountPercent || 30;
        let calculatedDiscount = 0;

        if (ratio <= 0.5) {
            calculatedDiscount = maxDiscount;
        } else if (ratio >= 1.5) {
            calculatedDiscount = 0;
        } else {
            // Linear interpolation between 0.5 and 1.5
            calculatedDiscount = maxDiscount * (1 - (ratio - 0.5));
        }

        const finalDiscount = Math.round(calculatedDiscount);
        
        logger.info(`[PRICING_ALGORITHM] City: ${pricingMunicipalityKey} | Drivers: ${availableDrivers} | Rides: ${activeRides} | Ratio: ${ratio.toFixed(2)} | Calculated Discount: ${finalDiscount}% (${Date.now() - t0}ms)`);
        
        // Override the current discount percent for this specific calculation
        dynamicConfig = {
            ...dynamicConfig,
            currentDiscountPercent: finalDiscount,
            reasonCodes: ['algorithmic_override', `supply_${availableDrivers}`, `demand_${activeRides}`]
        };
    }

    // --- CENTRALIZED PRICING ENGINE (VamO PRO) ---
    const evalDate = scheduledAt ? (typeof scheduledAt === 'number' ? new Date(scheduledAt) : (scheduledAt.toDate ? scheduledAt.toDate() : new Date(scheduledAt))) : new Date();
    const isNight = getIsNight(evalDate);

    const pricingResult = calculateRidePrice({
        distanceKm: effectiveDistKm,
        durationMin: durationMin,
        serviceType,
        isNight,
    }, pricingConfig, dynamicConfig, pricingMunicipalityKey || undefined);

    let total = pricingResult.total;
    let breakdown = pricingResult.breakdown;
    let dynamicSnapshot = pricingResult.dynamicSnapshot;

    // [PRICING_AUDIT] Log base before express
    console.log(`[PRICING_AUDIT] baseFare=${breakdown.baseFare}, distanceFare=${breakdown.distanceFare}, totalBase=${total}`);

    // [FASE B] Express discount: 20% cap 2000
    const MAX_EXPRESS_DISCOUNT = 2000;
    const ridesThisWeek = passengerProfile?.passengerProgress?.ridesThisWeek ?? 0;
    let expressDiscountAmount = 0;
    if (serviceType === 'express') {
        const discountPercent = getExpressDiscountPercent(passengerProfile);
        if (discountPercent > 0) {
            const rawDiscount = Math.floor(total * (discountPercent / 100));
            expressDiscountAmount = Math.min(rawDiscount, MAX_EXPRESS_DISCOUNT);
            // DO NOT mutate 'total' here to keep it as gross fare.
        } else {
            if (!dryRun) {
                throw new HttpsError('failed-precondition', 'Beneficio Express vencido o no disponible. Completá 5 viajes esta semana para desbloquearlo.');
            }
        }
        breakdown.expressDiscountAmount = expressDiscountAmount;
        breakdown.expressDiscountPercent = discountPercent > 0 ? discountPercent : 0;
        console.log(`[EXPRESS_APPLY] ridesThisWeek=${ridesThisWeek} | discountPercent=${discountPercent}% | expressDiscountAmount=${expressDiscountAmount} | totalGross=${total}`);
    }

    console.log(`[PRICING_AUDIT] discountApplied=${expressDiscountAmount}, finalTotal=${total}`);
    breakdown.total = total;

    if (dryRun) {
        logger.info('[CREATE_RIDE_GUARD] dryRun respected');
        const isExpressBlocked = serviceType === 'express' && expressDiscountAmount === 0;
        return { 
            estimatedTotal: total, 
            breakdown, 
            dynamic: dynamicSnapshot || null, 
            expressDiscountAmount,
            expressBlockedReason: isExpressBlocked ? 'weekly_expired' : null,
            message: isExpressBlocked ? 'Completá 5 viajes esta semana para desbloquear Express.' : null
        };
    }

    // DEBUG: Log estimation details before proceeding
    console.log('[DEBUG][createRideV1][dryRun] origin:', origin, 'destination:', destination, 'distKm:', distKm, 'effectiveDistKm:', effectiveDistKm, 'pricePerKmFactor:', (cityPricingConfig as any)._pricePerKmFactor, 'estimatedTotal:', total);
    
    const userAgent = request.rawRequest.headers['user-agent'] || 'unknown';
    const ip = request.rawRequest.ip || request.rawRequest.headers['x-forwarded-for'] || '0.0.0.0';

    // [FASE 4] Auto-detect nearby taxi stand
    let detectedStand: any = null;
    try {
        detectedStand = await detectNearbyTaxiStand(db, cityKey, origin.lat, origin.lng);
        if (detectedStand) {
            console.log(`[createRideV1] Detectada parada cercana: ${detectedStand.name} (${detectedStand.id}) a ${detectedStand.distanceMeters}m`);
        }
    } catch (e) {
        console.error('[createRideV1] Error detectando parada:', e);
    }

    // Idempotency: check if a ride with the same clientRequestId already exists for this passenger
    const existingSnap = await db.collection('rides')
      .where('passengerId', '==', passengerId)
      .where('clientRequestId', '==', effectiveClientRequestId)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      const existingRide = existingSnap.docs[0];
      logger.info(`[CREATE_RIDE_GUARD] idempotent hit: ${existingRide.id}`);
      return { rideId: existingRide.id, resolvedCity: finalCity };
    }

    // [WALLET] Pre-read passenger wallet balance (outside transaction, safe read)
    let walletSnapshot = { cashBalance: 0, promoBalance: 0 };
    try {
        walletSnapshot = await getOrCreateWallet(passengerId);
        logger.info(`[WALLET] Pre-ride balance: cash=${walletSnapshot.cashBalance}, promo=${walletSnapshot.promoBalance}`);
    } catch (we) {
        logger.warn(`[WALLET] Could not read wallet for ${passengerId}. Defaulting to cash.`, we);
    }
    const walletBalance = Math.max(0, (walletSnapshot.cashBalance || 0) + (walletSnapshot.promoBalance || 0));

    // [FASE 2] Pre-generate rideId so credits can be locked with a deterministic ID before the ride TX completes
    const newRideRef = db.collection('rides').doc();
    const newRideId = newRideRef.id;

    // [FASE 2] Lock passenger credits BEFORE building pricingModel (separate TX, best-effort)
    let creditCoveredAmount = 0;
    if (!isScheduled) {
        try {
            const globalIncentiveBudget = Math.floor(total * (INCENTIVE_CONFIG.MAX_TOTAL_DISCOUNT_PERCENT / 100));
            const creditResult = await db.runTransaction(async (creditTx) => {
                return calculateAndLockCredits(passengerId, newRideId, total, globalIncentiveBudget, creditTx);
            });
            creditCoveredAmount = creditResult.creditAmount;
            logger.info(`[CREDITS] available=${globalIncentiveBudget} | locked=${creditCoveredAmount} | rideId=${newRideId} | passengerId=${passengerId}`);
        } catch (creditErr) {
            // Non-fatal: if credit lock fails, ride proceeds without credit discount
            logger.warn(`[CREDITS] Lock failed for ride ${newRideId}. Proceeding without credits.`, creditErr);
            creditCoveredAmount = 0;
        }
    }

    // [PRICING_FIX] Explicitly check if user wants to use wallet
    const useWallet = paymentMethod !== 'cash';
    const totalAfterExpress = Math.max(0, total - expressDiscountAmount);
    const totalAfterCredits = Math.max(0, totalAfterExpress - creditCoveredAmount);
    
    // walletCoveredAmount is only calculated if useWallet is true
    const walletCoveredAmount = useWallet ? Math.min(walletBalance, totalAfterCredits) : 0;
    const cashToCollectEstimate = Math.max(0, totalAfterCredits - walletCoveredAmount);
    
    const paymentSnapshot: PaymentSnapshot = {
        selectedPaymentMethod: paymentMethod as any,
        useWallet,
        finalPassengerFare: totalAfterExpress, // Monto post-express
        walletCoveredAmount,
        cashAmount: cashToCollectEstimate,
        source: "backend",
        timestamp: FieldValue.serverTimestamp()
    };
    
    const paymentMethodSnapshot = cashToCollectEstimate === 0 ? (creditCoveredAmount >= total ? 'credit' : 'wallet') : (walletCoveredAmount > 0 || creditCoveredAmount > 0 ? 'mixed' : 'cash');
    logger.info(`[WALLET] Estimate: total=${total}, credits=${creditCoveredAmount}, wallet=${walletCoveredAmount}, cash=${cashToCollectEstimate}, method=${paymentMethodSnapshot}, useWallet=${useWallet}`);

    try {
        console.log('[createRideV1] starting transaction');
        const result = await db.runTransaction(async (tx) => {
            const passengerSnap = await tx.get(userRef);
            const passengerData = passengerSnap.data() as UserProfile;
            
            // [WALLET] Ensure unified wallet is the source of truth for eligibility
            const wallet = await getOrCreateWallet(passengerId, tx);
            const tokenEmailVerified = request.auth?.token?.email_verified === true;

            const eligibility = canPassengerRequestRide(passengerData, tokenEmailVerified, wallet.cashBalance);
            if (!eligibility.isEligible) {
                // If eligibility fails, release any locked credits before throwing
                if (creditCoveredAmount > 0) {
                    releaseLockedCredits(newRideId).catch(e => logger.warn(`[CREDITS] Release on eligibility fail`, e));
                }
                throw new HttpsError('failed-precondition', eligibility.reason || 'No eres elegible para solicitar un viaje.');
            }

            if (passengerData.activeRideId) {
                const activeRideSnap = await tx.get(db.doc(`rides/${passengerData.activeRideId}`));
                if (activeRideSnap.exists && !['completed', 'cancelled'].includes(activeRideSnap.data()?.status)) {
                    if (creditCoveredAmount > 0) {
                        releaseLockedCredits(newRideId).catch(e => logger.warn(`[CREDITS] Release on activeRide fail`, e));
                    }
                    throw new HttpsError('failed-precondition', 'Ya tenés un viaje activo.');
                }
            }

            // [WALLET] Lock funds inside the transaction if there is wallet coverage
            // CRITICAL: MUST HAPPEN BEFORE ANY WRITES (tx.set/tx.update)
            let finalLockResult = null;
            if (walletCoveredAmount > 0) {
                try {
                    finalLockResult = await lockWalletForRide(passengerId, newRideId, walletCoveredAmount, tx, paymentMethod as any);
                    logger.info(`[WALLET] Locked $${finalLockResult.totalLocked} for ride ${newRideId}`);
                } catch (lockErr: any) {
                    // FATAL: If it's a VamO Pay trip and lock fails, we MUST abort.
                    logger.error(`[WALLET] Lock FAILED for ride ${newRideId}. ABORTING RIDE CREATION.`, lockErr);
                    throw new HttpsError('failed-precondition', `No se pudo reservar el saldo: ${lockErr.message || 'Error desconocido'}`);
                }
            }

            // newRideRef is pre-generated above — reuse it here

            // [PHS] PRICING_SNAPSHOT: Capture current city rates for non-retroactive settlement
            const pricingSnapshot: PricingSnapshot = {
                commission_particular: pricingConfig.commission_particular ?? (cityKey === 'rawson' ? 0.13 : 0.14),
                commission_taxi_remis: pricingConfig.commission_taxi_remis ?? (cityKey === 'rawson' ? 0.07 : 0.08),
                // municipal_percentage removed in Version B
                cityKey: cityKey,
                timestamp: FieldValue.serverTimestamp()
            };
            logger.info(`[PRICING_SNAPSHOT] Captured for ride ${newRideId}: particular=${pricingSnapshot.commission_particular}, taxiRemis=${pricingSnapshot.commission_taxi_remis}`);

            const pricingModel = {
                estimated: { total, breakdown, configSnapshot: pricingConfig, calculatedAt: FieldValue.serverTimestamp() },
                dynamic: dynamicSnapshot || null,
                estimatedTotal: total, // Tarifa bruta (Gross Fare)
                originalTotal: total, // Igual a estimatedTotal si no hay otros descuentos previos
                estimatedDistanceMeters: Math.round(effectiveDistKm * 1000),
                expressDiscountAmount,
                creditCoveredAmount,
                creditsApplied: creditCoveredAmount > 0,
                serviceType,
                driverReceivesTotal: total,
                passengerPaysTotal: cashToCollectEstimate + walletCoveredAmount + creditCoveredAmount, // El subtotal que paga el pasajero (incluyendo billetera/créditos)
                walletCoveredAmount,
                cashToCollect: cashToCollectEstimate,
                paymentMethodSnapshot,
                paymentSnapshot,
                compensationAmount: 0,
                pricingSnapshot, // Locked rates for Phase 2
                tariffMode: isNight ? 'night' : 'day',
                tariffEvaluatedAt: Timestamp.fromDate(evalDate)
            };

            const isScheduled = !!scheduledAt;
            const rideStatus = isScheduled ? 'scheduled' : 'searching';

            // [SETTLEMENT_FIX] Derive driverSubtypeSnapshot from serviceType at creation time.
            // Even though the driver is not assigned yet, 'professional' service implies professional driver.
            // This guarantees onRideSettlementV6 always finds this field and never silently falls back to 'express'.
            const driverSubtypeSnapshotAtCreation = serviceType === 'professional' ? 'professional' : 'particular';

            const baseRideData: any = {
                passengerId, origin, destination, serviceType,
                status: rideStatus, 
                city: finalCity,
                cityKey, // mandatory field
                clientRequestId: effectiveClientRequestId,
                pricing: pricingModel,
                paymentMethod: paymentMethodSnapshot,
                paymentSnapshot,
                pricingSnapshot: pricingModel.pricingSnapshot, // [SETTLEMENT_FIX] top-level for easy access
                isScheduled,
                activationStatus: isScheduled ? 'waiting_scheduled_time' : 'active',
                scheduledAt: isScheduled ? (typeof scheduledAt === 'number' ? Timestamp.fromMillis(scheduledAt) : scheduledAt) : null,
                legalAcceptance: {
                    termsVersion: passengerProfile.termsVersion || 'v1.2',
                    acceptedAt: Timestamp.now(),
                    userAgent,
                    ip: typeof ip === 'string' ? ip : ip[0]
                },
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                passengerName: passengerData.name || 'Pasajero',
                // [SETTLEMENT_FIX] Financial snapshot fields — always present from creation
                driverSubtypeSnapshot: driverSubtypeSnapshotAtCreation,
                // [AUDIT] Financial metadata
                walletLockStatus: finalLockResult ? 'locked' : (walletCoveredAmount > 0 ? 'pending' : 'none'),
                walletLockedAmount: finalLockResult ? finalLockResult.totalLocked : 0,
                walletLockTxId: finalLockResult ? `lock_${newRideId}` : null
            };

            if (detectedStand) {
                baseRideData.stationId = detectedStand.id;
                baseRideData.stationName = detectedStand.name;
                baseRideData.stationDispatchStatus = 'station_priority';
                baseRideData.dispatchSource = 'taxi_stand';
                baseRideData.fallbackToGeneralMatching = true;
                baseRideData.stationRadiusMeters = detectedStand.radiusMeters;
                baseRideData.stationDistanceMeters = detectedStand.distanceMeters;
            }

            console.log('[createRideV1] tx.set ride. Status:', rideStatus);
            tx.set(newRideRef, baseRideData);

            console.log('[createRideV1] tx.update activeRideId');
            tx.update(userRef, { activeRideId: newRideRef.id });

            return { rideId: newRideRef.id, resolvedCity: finalCity };
        });

        // Log OUTSIDE transaction
        await logLedgerEvent({
            eventType: 'offer_received',
            actorId: passengerId,
            actorRole: 'passenger',
            rideId: result.rideId,
            cityKey: result.resolvedCity || undefined,
            metadata: { serviceType }
        });

        return { success: true, rideId: result.rideId };

        console.log('[MATCH_DEBUG] createRide completed');
        logger.info('[CREATE_RIDE_GUARD] transaction committed');
        
        // [MATCH_REMEDIATION] Proactive matching call removed. 
        // We now rely solely on the onRideCreatedV1 trigger to ensure exactly one matching cycle starts.
        // findNextDriverAndCreateOffer(result.rideId).catch(e => logger.error(`Proactive matching failed`, e));
        
        console.log('[createRideV1] success response sent', result.rideId);
        return { success: true, rideId: result.rideId };
    } catch (error: any) {
        console.log('[createRideV1] fatal error', error);
        if (error instanceof HttpsError) throw error; throw new HttpsError('internal', error.message || 'No se pudo crear el viaje.');
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
        tx.update(offerDoc.ref, { status: 'rejected', finalizedAt: FieldValue.serverTimestamp() });
        tx.update(db.doc(`rides/${rideId}`), {
            currentOfferedDriverId: null,
            matchingExpiresAt: null,
            totalIgnores: FieldValue.increment(1)
        });
    });

    findNextDriverAndCreateOffer(rideId).catch(e => logger.error(`Next match failed`, e));
    return { success: true };
});

// --- SHARED ROUTE OPTIMIZATION HELPERS ---
function getDistanceM(p1: any, p2: any): number {
    const R = 6371e3;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function optimizePickupStopsFromDriverLocation(
    orderedStops: any[],
    driverLocation: { lat: number; lng: number }
): any[] {
    const pickups = orderedStops.filter((s: any) => s.type === 'pickup');
    const dropoffs = orderedStops.filter((s: any) => s.type === 'dropoff');

    if (pickups.length === 0) return orderedStops;

    const driverPlace = { lat: driverLocation.lat, lng: driverLocation.lng };
    const optimized: any[] = [];

    // Optimize Pickups
    let lastLoc = driverPlace;
    let remainingPickups = [...pickups];
    while (remainingPickups.length > 0) {
        let nextIdx = 0;
        let nextDist = Infinity;
        remainingPickups.forEach((r, idx) => {
            const d = r.location ? getDistanceM(lastLoc, r.location) : Infinity;
            if (d < nextDist) {
                nextDist = d;
                nextIdx = idx;
            }
        });
        const next = remainingPickups.splice(nextIdx, 1)[0];
        optimized.push(next);
        lastLoc = next.location;
    }

    optimized.push(...dropoffs);

    // Re-assign order field
    return optimized.map((s, idx) => ({ ...s, order: idx + 1 }));
}
// -----------------------------------------

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
            const driverLocationSnap = await tx.get(db.doc(`drivers_locations/${driverId}`));

            if (!offerSnap.exists || offerSnap.data()?.status !== 'pending') {
                logger.warn(`[ACCEPT_GUARD] offer not pending. Offer ID: ${offerDoc.id}`);
                throw new HttpsError('failed-precondition', 'La oferta ya no está disponible.');
            }

            const ride = rideSnap.data() as Ride;
            if (ride.status !== 'searching') {
                logger.warn(`[ACCEPT_GUARD] ride already assigned or unavailable. Current status: ${ride.status}`);
                // [MATCH_REMEDIATION] Explicitly return success false or throw if already assigned to prevent double-processing
                throw new HttpsError('failed-precondition', 'El viaje ya no está disponible para asignación.');
            }

            logger.info(`[MATCH_DEBUG] accepted winner: ${driverId} for ride ${rideId}`);

            const profileSubtype = driverSnap.data()?.driverSubtype;
            // [SETTLEMENT_FIX] 'express' is a SERVICE TYPE, not a driver category.
            // Never propagate it as driverSubtypeSnapshot — that field must be 'professional' or 'particular'.
            // Priority: existing ride snapshot (if valid) > serviceType-derived > profile subtype > 'particular'
            const existingSnapshot = (ride as any).driverSubtypeSnapshot;
            const validSubtypes = ['professional', 'particular'];
            const driverSubtypeSnap: string = validSubtypes.includes(existingSnapshot)
                ? existingSnapshot  // Keep what was already set (e.g., from createRideV1 or station assignment)
                : validSubtypes.includes(profileSubtype)
                    ? profileSubtype  // Use real driver profile subtype if it's valid
                    : (ride.serviceType === 'professional' ? 'professional' : 'particular'); // Derive from serviceType
            
            if (!validSubtypes.includes(profileSubtype)) {
                logger.warn(`[ACCEPT_SUBTYPE_FIX] Driver ${driverId} has driverSubtype='${profileSubtype}' which is not a valid driver category. Resolved driverSubtypeSnapshot='${driverSubtypeSnap}' from serviceType='${ride.serviceType}'.`);
            }
            
            const snapshot = (ride as any).pricing?.pricingSnapshot;

            
            let vamoRateSnap;
            
            if (snapshot) {
                vamoRateSnap = driverSubtypeSnap === 'professional' 
                    ? snapshot.commission_taxi_remis 
                    : snapshot.commission_particular;
                
                // Safety fallback
                if (vamoRateSnap === undefined) vamoRateSnap = driverSubtypeSnap === 'professional' ? 0.12 : 0.18;
                logger.info(`[ACCEPT_PRICING] Using snapshot for ride ${rideId}: vamo=${vamoRateSnap}`);
            } else {
                vamoRateSnap = driverSubtypeSnap === 'professional' ? 0.12 : 0.18;
                logger.info(`[ACCEPT_PRICING] Fallback to current rates for ride ${rideId}`);
            }

            tx.update(db.doc(`rides/${rideId}`), {
                status: 'driver_assigned',
                driverId: driverId,
                driverName: driverSnap.data()?.name || 'Conductor',
                driverRating: driverSnap.data()?.rating || 5.0,
                driverVehicle: driverSnap.data()?.vehicle ? `${driverSnap.data()?.vehicle?.brand} ${driverSnap.data()?.vehicle?.model} (${driverSnap.data()?.vehicle?.color})` : 'Vehículo pendiente de completar',
                driverPlate: driverSnap.data()?.vehicle?.plate || 'N/A',
                driverVehiclePhoto: driverSnap.data()?.vehiclePhotoFrontUrl || driverSnap.data()?.vehicleFrontPhotoURL || null,
                driverPhotoUrl: driverSnap.data()?.photoURL || null,
                driverVehicleBrand: driverSnap.data()?.vehicle?.brand || null,
                driverVehicleModel: driverSnap.data()?.vehicle?.model || null,
                driverVehicleYear: driverSnap.data()?.vehicle?.year || null,
                driverVehicleColor: driverSnap.data()?.vehicle?.color || null,
                // [VamO PRO] Fleet management fields
                activeDriverId: driverId,
                vehicleOwnerId: driverSnap.data()?.vehicleOwnerId || null,
                settlementOwnerId: driverSnap.data()?.vehicleOwnerId || driverId,
                vehicleId: driverSnap.data()?.vehicle?.plate || null, // Best proxy for vehicleId right now
                // [FASE 5] Commission snapshot — frozen at acceptance time
                driverSubtypeSnapshot: driverSubtypeSnap,
                commissionRateSnapshot: vamoRateSnap,
                paymentAgreementSnapshot: driverSnap.data()?.paymentAgreement || null,
                updatedAt: FieldValue.serverTimestamp()
            });

            tx.update(db.doc(`users/${driverId}`), { activeRideId: rideId, driverStatus: 'in_ride' });
            tx.update(db.doc(`drivers_locations/${driverId}`), { driverStatus: 'in_ride' });
            tx.update(offerDoc.ref, {
                status: 'accepted',
                finalizedAt: FieldValue.serverTimestamp()
            });

            if (ride.isSharedRide && (ride as any).sharedGroupId && (ride as any).sharedPassengers) {
                let updatedOrderedStops = ride.orderedStops || [];
                let updatedRoutePlan = ride.routePlan || [];

                // [GUARD – Opción A] Fail hard if ANY sharedPassenger is missing requestId.
                // If this throws, the entire transaction is rolled back — no partial state updates.
                // This guarantees we never assign a driver to a corrupted ride.
                assertSharedPassengersHaveRequestIds(
                    (ride as any).sharedPassengers,
                    rideId,
                    'acceptRideV2'
                );

                // 1. users/{driverId}.currentLocation
                // 2. users/{driverId}.location
                const locData = driverLocationSnap.exists ? driverLocationSnap.data() : null;
                const usrData = driverSnap.exists ? driverSnap.data() : null;

                let driverLocation = locData?.currentLocation || locData?.l || usrData?.currentLocation || usrData?.location || null;

                if (driverLocation && updatedOrderedStops.length > 0) {
                    updatedOrderedStops = optimizePickupStopsFromDriverLocation(updatedOrderedStops, driverLocation);
                    updatedRoutePlan = updatedOrderedStops.map((stop: any, index: number) => ({
                        order: index + 1,
                        type: stop.type,
                        passengerId: stop.passengerId || 'unknown',
                        passengerName: stop.passengerName || 'Pasajero',
                        address: stop.location?.address || '',
                        status: stop.status || 'pending'
                    }));

                    // Update master ride with optimized route
                    tx.update(db.doc(`rides/${rideId}`), {
                        orderedStops: updatedOrderedStops,
                        routePlan: updatedRoutePlan,
                        routeUpdatedAt: FieldValue.serverTimestamp()
                    });
                } else if (!driverLocation) {
                    logger.warn(`[ACCEPT_SHARED] PICKUP_OPTIMIZATION_SKIPPED_MISSING_DRIVER_LOCATION for ride ${rideId}`);
                }

                tx.update(db.doc(`shared_ride_groups/${(ride as any).sharedGroupId}`), {
                    status: 'driver_assigned',
                    driverId: driverId,
                    assignedDriverId: driverId,
                    ...(driverLocation && updatedOrderedStops.length > 0 ? { orderedStops: updatedOrderedStops } : {}),
                    updatedAt: FieldValue.serverTimestamp()
                });

                // [FIX – Opción A] assertSharedPassengersHaveRequestIds already ran above,
                // so every p.requestId is guaranteed to be present here.
                for (const p of (ride as any).sharedPassengers) {
                    // requestId is guaranteed by the assertion above — no need for an if/else
                    tx.update(db.doc(`shared_ride_requests/${p.requestId}`), {
                        status: 'driver_assigned',
                        driverId: driverId,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    if (p.passengerId) {
                        tx.update(db.doc(`users/${p.passengerId}`), {
                            activeRideId: rideId,
                            activeSharedRideId: rideId,
                            activeSharedRideGroupId: (ride as any).sharedGroupId,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    } else {
                        // passengerId missing is also caught by the assertion, but belt-and-suspenders
                        logger.error(`[ACCEPT_SHARED] sharedPassenger missing passengerId. requestId=${p.requestId}. Skipping user update.`);
                    }
                }
            }
        });

        // Log OUTSIDE transaction
        const rideSnap = await db.doc(`rides/${rideId}`).get();
        const rideData = rideSnap.data();
        await logLedgerEvent({
            eventType: 'ride_accepted',
            actorId: driverId,
            actorRole: 'driver',
            rideId: rideId,
            passengerId: rideData?.passengerId || 'unknown',
            cityKey: rideData?.cityKey || 'unknown',
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
                        finalizedAt: FieldValue.serverTimestamp(),
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
        logger.error(`[ACCEPT_GUARD] conflict prevented. CRITICAL_ERROR:`, error);
        throw new HttpsError('internal', 'No se pudo aceptar el viaje.');
    }
});

/**
 * assignStationRideToDriverV1
 * Callable function: allows a station_operator, admin_municipal or super_admin to
 * manually assign a ride (pending station dispatch) to a specific driver.
 * Creates a rideOffer so the driver is notified through the normal offer flow.
 */
export const assignStationRideToDriverV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { rideId, driverId } = request.data;
    const operatorId = request.auth.uid;

    if (!rideId || !driverId) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros: rideId y driverId son requeridos.');
    }

    logger.info(`[STATION_ASSIGN] Operator ${operatorId} assigning driver ${driverId} to ride ${rideId}`);

    // --- Auth & Role Check ---
    const operatorSnap = await db.doc(`users/${operatorId}`).get();
    if (!operatorSnap.exists) throw new HttpsError('not-found', 'Perfil de operador no encontrado.');
    const operatorData = operatorSnap.data() as UserProfile;

    const allowedRoles = ['station_operator', 'admin_municipal', 'admin', 'super_admin'];
    if (!allowedRoles.includes(operatorData.role as string)) {
        throw new HttpsError('permission-denied', 'No tenés permisos para asignar viajes desde parada.');
    }

    // --- Load Ride ---
    const rideSnap = await db.doc(`rides/${rideId}`).get();
    if (!rideSnap.exists) throw new HttpsError('not-found', 'El viaje no existe.');
    const ride = rideSnap.data() as Ride;

    // --- Validate station_operator scope ---
    if (operatorData.role === 'station_operator') {
        const operatorStationId = (operatorData as any).stationId;
        if (!operatorStationId) {
            throw new HttpsError('permission-denied', 'El operador no tiene una parada asignada.');
        }
        if (ride.stationId !== operatorStationId) {
            throw new HttpsError('permission-denied', 'Solo podés asignar viajes de tu propia parada.');
        }
    }

    // --- Validate Ride Status ---
    const assignableStatuses = ['pending_assignment', 'pending_reassignment'];
    const rideDispatchStatus = (ride as any).stationDispatchStatus;
    if (!assignableStatuses.includes(rideDispatchStatus)) {
        throw new HttpsError(
            'failed-precondition',
            `El viaje no está pendiente de asignación (estado actual: ${rideDispatchStatus}).`
        );
    }
    if (ride.status !== 'searching') {
        throw new HttpsError(
            'failed-precondition',
            `El viaje no está en estado de búsqueda (estado actual: ${ride.status}).`
        );
    }

    // --- Validate Taxi Stand ---
    const stationId = (ride as any).stationId;
    if (!stationId) throw new HttpsError('failed-precondition', 'El viaje no tiene una parada asignada.');
    const stationSnap = await db.doc(`taxi_stands/${stationId}`).get();
    if (!stationSnap.exists) throw new HttpsError('not-found', 'La parada no existe.');
    const stationData = stationSnap.data() as any;
    if (stationData.cityKey !== ride.cityKey) {
        throw new HttpsError('failed-precondition', 'Inconsistencia de ciudad entre la parada y el viaje.');
    }

    // --- Validate Driver ---
    const driverSnap = await db.doc(`users/${driverId}`).get();
    if (!driverSnap.exists) throw new HttpsError('not-found', 'El conductor no existe.');
    const driver = driverSnap.data() as UserProfile;

    if (driver.approved !== true) {
        throw new HttpsError('failed-precondition', 'El conductor no está aprobado.');
    }
    if ((driver as any).isSuspended === true) {
        throw new HttpsError('failed-precondition', 'El conductor está suspendido.');
    }
    if (driver.driverStatus !== 'online') {
        throw new HttpsError('failed-precondition', `El conductor no está online (estado: ${driver.driverStatus}).`);
    }
    if (driver.activeRideId && driver.activeRideId !== null) {
        throw new HttpsError('failed-precondition', 'El conductor ya tiene un viaje activo.');
    }

    // Optionally check driver belongs to this station or is available for it
    const driverStationId = (driver as any).stationId;
    if (driverStationId && driverStationId !== stationId) {
        logger.warn(`[STATION_ASSIGN] Driver ${driverId} belongs to station ${driverStationId}, assigning to station ${stationId}. Proceeding anyway.`);
    }

    // --- Compute snapshot values ---
    const driverSubtypeSnap = driver.driverSubtype || 'professional';
    const pricingSnap = (ride as any).pricing?.pricingSnapshot;
    let commissionRate: number;
    if (pricingSnap) {
        commissionRate = driverSubtypeSnap === 'professional'
            ? (pricingSnap.commission_taxi_remis ?? 0.12)
            : (pricingSnap.commission_particular ?? 0.18);
    } else {
        commissionRate = driverSubtypeSnap === 'professional' ? 0.12 : 0.18;
    }

    // --- Transactional Assignment ---
    const offerRef = db.collection('rideOffers').doc();
    const offerId = offerRef.id;
    const offerExpiresAt = Timestamp.fromMillis(Date.now() + 60 * 1000); // 60 seconds

    try {
        await db.runTransaction(async (tx) => {
            // Re-read inside transaction for consistency
            const freshRideSnap = await tx.get(db.doc(`rides/${rideId}`));
            const freshRide = freshRideSnap.data() as Ride;

            if (!assignableStatuses.includes((freshRide as any).stationDispatchStatus)) {
                throw new HttpsError('already-exists', 'El viaje ya fue asignado por otro operador.');
            }

            // Create the rideOffer — driver will receive this and can accept via acceptRideV2
            tx.set(offerRef, {
                rideId,
                driverId,
                passengerId: ride.passengerId,
                status: 'pending',
                source: 'station_dispatch',
                stationId,
                sentAt: FieldValue.serverTimestamp(),
                expiresAt: offerExpiresAt,
                round: 1,
                assignedByOperatorId: operatorId,
                createdAt: FieldValue.serverTimestamp()
            });

            // Update the ride
            tx.update(db.doc(`rides/${rideId}`), {
                stationDispatchStatus: 'assigned_to_driver',
                stationAssignedDriverId: driverId,
                assignedDriverId: driverId,
                currentOfferedDriverId: driverId,
                stationAssignedAt: FieldValue.serverTimestamp(),
                stationAssignedByOperatorUid: operatorId,
                matchingExpiresAt: offerExpiresAt,
                // [SETTLEMENT_FIX] Freeze driverSubtypeSnapshot at assignment if not already set
                driverSubtypeSnapshot: (freshRide as any).driverSubtypeSnapshot || driverSubtypeSnap,
                commissionRateSnapshot: commissionRate,
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        logger.info(`[STATION_ASSIGN] Success: ride ${rideId} assigned to driver ${driverId}, offer ${offerId} created.`);
        return { success: true, offerId, rideId, driverId };

    } catch (error: any) {
        logger.error(`[STATION_ASSIGN] Error assigning ride ${rideId} to driver ${driverId}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al asignar el conductor.');
    }
});

export const scheduledRideWorkerV1 = onSchedule({ schedule: "every 1 minutes", timeZone: "America/Argentina/Buenos_Aires" }, async (event) => {
    const db = getDb();
    const now = Timestamp.now();
    
    // 1. Activation: Process scheduled rides that are close to their time
    const activationWindowMs = 10 * 60 * 1000; // 10 minutes (T-10)
    
    // 1a. Rides without driver -> searching (last attempt)
    const scheduledSnap = await db.collection('rides')
        .where('status', 'in', ['scheduled', 'pending_driver_assignment'])
        .get();

    for (const doc of scheduledSnap.docs) {
        const data = doc.data() as Ride;
        if (!data.scheduledAt) continue;

        const scheduledTime = (data.scheduledAt as any).toMillis ? (data.scheduledAt as any).toMillis() : new Date(data.scheduledAt as any).getTime();
        const timeDiff = scheduledTime - now.toMillis();

        if (timeDiff <= activationWindowMs) {
            logger.info(`[RESERVATIONS] Activating unassigned ride ${doc.id} (T-10). Scheduled for: ${new Date(scheduledTime).toISOString()}`);
            await doc.ref.update({
                status: 'searching', // This triggers the normal matching flow
                activationStatus: 'active',
                activatedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                matchingAttempts: 0
            });
            findNextDriverAndCreateOffer(doc.id).catch(e => logger.error(`Activation matching failed for ${doc.id}`, e));
        }
    }

    // 1b. Rides with driver -> activating
    const assignedSnap = await db.collection('rides')
        .where('status', '==', 'driver_assigned')
        .where('activationStatus', '==', 'waiting_scheduled_time')
        .get();

    for (const doc of assignedSnap.docs) {
        const data = doc.data() as Ride;
        if (!data.scheduledAt) continue;

        const scheduledTime = (data.scheduledAt as any).toMillis ? (data.scheduledAt as any).toMillis() : new Date(data.scheduledAt as any).getTime();
        const timeDiff = scheduledTime - now.toMillis();

        if (timeDiff <= activationWindowMs) {
            logger.info(`[RESERVATIONS] Activating assigned ride ${doc.id} (T-10). Driver: ${data.driverId}. Scheduled for: ${new Date(scheduledTime).toISOString()}`);
            await doc.ref.update({
                status: 'activating', // This triggers the driver active ride UI
                activationStatus: 'active',
                activatedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
            // We could send a push notification here to the driver to start driving.
        }
    }

    // 2. Fallback: Expire stalled ride offers (Fix for Problem 1 - Avoids composite index)
    const pendingOffersSnap = await db.collection('rideOffers')
        .where('status', '==', 'pending')
        .limit(500)
        .get();
    
    const stalledOffers = pendingOffersSnap.docs.filter(doc => {
        const data = doc.data() as RideOffer;
        return data.expiresAt && (data.expiresAt as any).toMillis() < now.toMillis();
    });
    
    if (stalledOffers.length > 0) {
        logger.info(`[WORKER] Found ${stalledOffers.length} stalled offers. Expiring...`);
        const batch = db.batch();
        stalledOffers.forEach(doc => {
            batch.update(doc.ref, { 
                status: 'expired', 
                finalizedAt: now,
                reason: 'WORKER_TIMEOUT_FALLBACK'
            });
        });
        await batch.commit();
    }

    // 3. Maintenance: Retry 'searching' rides that stalled or timed out (Fix for Problem 3)
    const searchingSnap = await db.collection('rides').where('status', '==', 'searching').get();
    for (const doc of searchingSnap.docs) {
        const rideId = doc.id;
        const data = doc.data() as Ride;
        
        // [VamO PRO] Fixed Timeout for Scheduled Rides
        // Use activatedAt if it exists (for scheduled rides), fallback to createdAt
        const referenceTime = (data as any).activatedAt || data.createdAt;
        const createdAt = referenceTime.toMillis();
        const searchingDurationSeconds = (now.toMillis() - createdAt) / 1000;

        // Global Timeout: 5 minutes (300s)
        if (searchingDurationSeconds > 300) {
            logger.warn(`[WORKER] Ride ${rideId} timed out after ${searchingDurationSeconds}s. ReferenceTime: ${referenceTime.toDate().toISOString()}. Cancelling.`);
            await db.runTransaction(async (tx) => {
                const rSnap = await tx.get(doc.ref);
                if (!rSnap.exists) return;
                const rData = rSnap.data() as Ride;
                if (rData.status !== 'searching') return;

                const isScheduled = !!rData.scheduledAt;
                const newStatus = isScheduled ? 'failed_no_driver' : 'cancelled';
                const newReason = isScheduled ? 'NO_DRIVER_FOUND_FOR_RESERVATION' : 'GLOBAL_SEARCH_TIMEOUT';

                const rideUpdate: any = {
                    status: newStatus,
                    cancelledBy: 'system',
                    cancelReason: newReason,
                    updatedAt: now,
                    cancelledAt: now
                };
                const userUpdate: any = { activeRideId: null };

                // [VamO PRO] Unified Financial & Policy Handler (Must read before write)
                await handleRideCancellationFinancials({
                    rideId,
                    reason: newReason,
                    actor: 'system',
                    tx,
                    rideData: rData,
                    rideUpdate,
                    userUpdate
                });

                tx.update(doc.ref, rideUpdate);

                if (rData.passengerId) {
                    tx.update(db.doc(`users/${rData.passengerId}`), userUpdate);
                }
            });
            continue;
        }

        // Rematching Fallback: If no pending offers, try again (Problem 1)
        const hasPending = await hasPendingOffersForRide(db, rideId);
        if (!hasPending) {
            // Give it at least 5s since last update to avoid too frequent retries
            const lastUpdate = (data.updatedAt as any).toMillis();
            if (now.toMillis() - lastUpdate > 5000) {
                logger.info(`[WORKER] Ride ${rideId} searching with no offers. Triggering rematch.`);
                findNextDriverAndCreateOffer(rideId).catch(e => logger.error(`Worker rematch failed`, e));
            }
        }
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
        await offerRef.update({ status: 'expired', finalizedAt: FieldValue.serverTimestamp() });
    }
});

/**
 * [VamO PRO] Robust Matching Initialization
 */
import { obs } from "./lib/observability";

export const onRideCreatedV1 = onDocumentCreated({ document: "rides/{rideId}", region: 'us-central1' }, async (event: any) => {
    const startTime = Date.now();
    const rideId = event.params.rideId;
    const db = getDb();
    obs.info("RIDE_CREATED_TRIGGER", { rideId });
    
    const rideData = event.data?.data();
    if (!rideData) return;

    // [TRUST_SCORE] Calculate and snapshot passenger trust
    try {
        const trust = await calculateUserTrustScore(rideData.passengerId);
        await db.collection('rides').doc(rideId).update({
            'passengerTrustSnapshot': trust
        });
        obs.info("TRUST_SNAPSHOT_CREATED", { rideId, passengerId: rideData.passengerId, score: trust.score });
    } catch (trustErr: any) {
        obs.error("TRUST_SNAPSHOT_FAILED", trustErr, { rideId });
    }

    // [HEATMAP] Track demand hotspot
    if (rideData?.origin?.lat && rideData?.origin?.lng) {
        const geohash = geofire.geohashForLocation([rideData.origin.lat, rideData.origin.lng]);
        const heatmapId = `demand_${geohash.substring(0, 6)}`;
        await db.collection('heatmap_demand').doc(heatmapId).set({
            geohash: geohash.substring(0, 6),
            cityKey: rideData.cityKey || 'unknown',
            count: admin.firestore.FieldValue.increment(1),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        obs.trackWrite("heatmap_demand", "set", { heatmapId });
    }

    // scheduledRideWorker or proactive matching usually handles this, but we keep the trigger for robustness.
    await findNextDriverAndCreateOffer(rideId);
    obs.trackLatency("onRideCreatedV1_Total", startTime, { rideId });
});

export const onRideUpdatedV1 = onDocumentUpdated({ document: "rides/{rideId}", region: 'us-central1' }, async (event: any) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const rideId = event.params.rideId;
    if (!beforeData || !afterData) return;

    // Trigger only when transitioning to completed
    if (afterData.status === 'completed' && beforeData.status !== 'completed') {
        const db = getDb();
        const cityKey = afterData.cityKey || 'unknown';
        
        // 1. Calculate fare and shares
        // If paymentSnapshot exists, use finalPassengerFare. Otherwise use estimatedTotal.
        const totalFare = afterData.paymentSnapshot?.finalPassengerFare ?? (afterData.pricing?.estimatedTotal ?? 0);
        if (totalFare <= 0) return;

        // Fetch municipal share from city config, fallback to 5%
        let municipalSharePercent = 5;
        try {
            const citySnap = await db.doc(`cities/${cityKey}`).get();
            if (citySnap.exists) {
                const cityConfig = citySnap.data();
                if (cityConfig?.pricing?.municipalSharePercent !== undefined) {
                    municipalSharePercent = cityConfig.pricing.municipalSharePercent;
                }
            }
        } catch (e) {
            logger.warn(`Could not read city config for ${cityKey}. Using default municipal share 5%`);
        }

        const municipalShareAmount = Math.floor(totalFare * (municipalSharePercent / 100));

        // 2. Determine source and settlement status
        const sourceMap: Record<string, string> = {
            'cash': 'cash',
            'wallet': 'wallet',
            'mercado_pago': 'mercado_pago',
            'mixed': 'mixed'
        };
        const paymentMethod = afterData.paymentMethod || 'cash';
        const source = sourceMap[paymentMethod] || 'other';

        // Phase 1 rule: everything is pending_transfer as we are in ledger_first mode.
        const settlementStatus = 'pending_transfer';

        // 3. Optional: check for municipal account to link it
        let municipalityAccountId = null;
        try {
            const accountSnap = await db.doc(`municipal_accounts/${cityKey}`).get();
            if (accountSnap.exists && accountSnap.data()?.enabled) {
                municipalityAccountId = accountSnap.id;
            }
        } catch (e) {
            logger.warn(`Could not read municipal account for ${cityKey}`, e);
        }

        // 4. Create Ledger Entry
        const ledgerEntry = {
            cityKey,
            rideId,
            paymentMethod,
            totalFare,
            municipalSharePercent,
            municipalShareAmount,
            source,
            settlementStatus,
            municipalityAccountId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const ledgerRef = db.collection('municipal_ledger').doc(rideId);
        await ledgerRef.set(ledgerEntry);
        logger.info(`[LEDGER] Created municipal_ledger entry for ride ${rideId} (City: ${cityKey}, Amount: ${municipalShareAmount})`);
    }
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
            batch.update(docSnap.ref, { weeklyPoints: 0, lastResetAt: FieldValue.serverTimestamp() });
            batch.update(usersRef.doc(docSnap.id), { weeklyPoints: 0, driverLevel: 'bronce', updatedAt: FieldValue.serverTimestamp() });
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
            'updatedAt': FieldValue.serverTimestamp(),
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
                pauseStartedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
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
                cumulativeWaitSeconds: FieldValue.increment(addedWait),
                pauseHistory: FieldValue.arrayUnion({
                    duration: addedWait,
                    reason: 'driver_pause'
                }),
                updatedAt: FieldValue.serverTimestamp()
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
    const isNight = getIsNight(new Date());

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
/**
 * [VamO PRO] Weekly Pool Settlement DRY-RUN
 * This function simulates the payout process without modifying balances or resetting points.
 * Targets Top 10 drivers with at least 10 trips.
 */
export const weeklyPoolSettlementDryRunV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    // Authorization: Only admins can trigger dry-run
    if (!(request.auth.token as any).admin) {
        throw new HttpsError('permission-denied', 'Solo personal administrativo puede ejecutar esta simulación.');
    }

    const db = getDb();
    const now = Timestamp.now();
    
    // Calculate weekId (Current week for testing purposes)
    const getWeekId = () => {
        const d = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(d);
        const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
        const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
        const argDate = new Date(y, m, day);
        const firstDayOfYear = new Date(y, 0, 1);
        const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${y}-W${String(weekNumber).padStart(2, '0')}`;
    };

    const weekId = getWeekId();
    logger.info(`[DRY-RUN] Starting weekly pool settlement for week ${weekId}`);

    const citiesSnap = await db.collection('cities').get();
    const results: any[] = [];

    for (const cityDoc of citiesSnap.docs) {
        const cityKey = cityDoc.id;
        const cityData = cityDoc.data();
        const rewardsConfig = cityData.rewardsConfig || {};
        const poolAmount = rewardsConfig.weeklyPoolAmount || 0;

        if (poolAmount <= 0) {
            logger.info(`[DRY-RUN] Skipping city ${cityKey} (Pool is 0)`);
            continue;
        }

        // Fetch Top 10 drivers with at least 10 trips
        const topDriversSnap = await db.collection('driver_points')
            .where('weeklyTripsCount', '>=', 10)
            .orderBy('weeklyPoints', 'desc')
            .limit(10)
            .get();

        if (topDriversSnap.empty) {
            logger.info(`[DRY-RUN] Skipping city ${cityKey} (No qualified drivers)`);
            continue;
        }

        let totalAdjustedPoints = 0;
        const driverPayouts: any[] = [];

        // Pass 1: Multipliers and Adjusted Points
        topDriversSnap.docs.forEach((doc, index) => {
            const data = doc.data();
            const rank = index + 1;
            const points = data.weeklyPoints || 0;
            
            let multiplier = 1.0;
            if (rank <= 2) multiplier = 1.5;
            else if (rank <= 6) multiplier = 1.2;
            else if (rank <= 10) multiplier = 1.0;

            const adjPoints = points * multiplier;
            totalAdjustedPoints += adjPoints;

            driverPayouts.push({
                driverId: doc.id,
                driverName: data.driverName || 'Anónimo',
                rank,
                points,
                multiplier,
                adjPoints
            });
        });

        // Pass 2: Final Prize Allocation
        const cityResults = driverPayouts.map(d => {
            const reward = totalAdjustedPoints > 0 
                ? Math.floor((d.adjPoints / totalAdjustedPoints) * poolAmount) 
                : 0;
            return { ...d, reward };
        });

        const totalDistributed = cityResults.reduce((acc, curr) => acc + curr.reward, 0);

        // Record in History
        const historyId = `dryrun_${weekId}_${cityKey}_${Date.now()}`;
        const historyData = {
            cityKey,
            weekId,
            poolAmount,
            totalAdjustedPoints,
            totalDistributed,
            isDryRun: true,
            processedAt: now,
            ranking: cityResults
        };

        await db.collection('weekly_pool_history').doc(historyId).set(historyData);
        
        results.push(historyData);
        logger.info(`[DRY-RUN] City ${cityKey} processed. Total Rewards: $${totalDistributed} across ${cityResults.length} drivers.`);
    }

    return {
        success: true,
        weekId,
        citiesProcessed: results.length,
        data: results
    };
});

/**
 * [VamO PRO] Weekly Pool Payout MANUAL
 * This function performs real balance increments based on the weekly pool logic.
 * Requires an existing dry-run in history for safety.
 */
export const weeklyPoolPayoutManualV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    // Authorization: Strict Admin check
    if (!(request.auth.token as any).admin) {
        throw new HttpsError('permission-denied', 'Solo personal administrativo puede ejecutar el payout real.');
    }

    const { cityKey } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'cityKey es obligatorio.');

    const db = getDb();
    const now = Timestamp.now();
    
    // Calculate current weekId
    const getWeekId = () => {
        const d = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(d);
        const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
        const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
        const argDate = new Date(y, m, day);
        const firstDayOfYear = new Date(y, 0, 1);
        const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${y}-W${String(weekNumber).padStart(2, '0')}`;
    };

    const weekId = getWeekId();
    logger.info(`[PAYOUT] Attempting manual payout for city: ${cityKey}, week: ${weekId}`);

    // 1. Safety Check: Verify recent dry-run exists
    const dryRunSnap = await db.collection('weekly_pool_history')
        .where('cityKey', '==', cityKey)
        .where('weekId', '==', weekId)
        .where('isDryRun', '==', true)
        .limit(1)
        .get();

    if (dryRunSnap.empty) {
        throw new HttpsError('failed-precondition', 'No se encontró un Dry-Run reciente para esta ciudad/semana. Ejecutá la simulación antes del pago real.');
    }

    // 2. Fetch City Data and Pool
    const cityRef = db.doc(`cities/${cityKey}`);
    const citySnap = await cityRef.get();
    if (!citySnap.exists) throw new HttpsError('not-found', 'Ciudad no encontrada.');

    const cityData = citySnap.data();
    const poolAmount = cityData?.rewardsConfig?.weeklyPoolAmount || 0;
    if (poolAmount <= 0) throw new HttpsError('failed-precondition', 'El pozo actual es 0.');

    // 3. Fetch Top 10 Qualified Drivers
    const topDriversSnap = await db.collection('driver_points')
        .where('weeklyTripsCount', '>=', 10)
        .orderBy('weeklyPoints', 'desc')
        .limit(10)
        .get();

    if (topDriversSnap.empty) {
        throw new HttpsError('failed-precondition', 'No hay conductores calificados para el reparto.');
    }

    // 4. Calculate Shares (Atomic logic replication)
    let totalAdjustedPoints = 0;
    const candidates: any[] = [];

    topDriversSnap.docs.forEach((doc, index) => {
        const data = doc.data();
        const rank = index + 1;
        const points = data.weeklyPoints || 0;
        let multiplier = 1.0;
        if (rank <= 2) multiplier = 1.5;
        else if (rank <= 6) multiplier = 1.2;
        else if (rank <= 10) multiplier = 1.0;
        
        const adjPoints = points * multiplier;
        totalAdjustedPoints += adjPoints;
        candidates.push({ driverId: doc.id, driverName: data.driverName || 'Anónimo', rank, points, multiplier, adjPoints });
    });

    const finalPayouts = candidates.map(c => {
        const reward = totalAdjustedPoints > 0 ? Math.floor((c.adjPoints / totalAdjustedPoints) * poolAmount) : 0;
        return { ...c, reward };
    });

    const totalDistributed = finalPayouts.reduce((acc, curr) => acc + curr.reward, 0);

    // 5. Execute Payouts with Idempotency
    const processedPayouts: any[] = [];
    
    for (const p of finalPayouts) {
        if (p.reward <= 0) continue;

        const payoutId = `weekly_pool_payout_${weekId}_${cityKey}_${p.driverId}`;
        const transactionRef = db.doc(`platform_transactions/${payoutId}`);
        const userRef = db.doc(`users/${p.driverId}`);

        try {
            await db.runTransaction(async (tx) => {
                const txSnap = await tx.get(transactionRef);
                if (txSnap.exists) {
                    logger.warn(`[PAYOUT] Payout ${payoutId} already exists. Skipping.`);
                    return;
                }
                // [STAGE 2A] Unified Wallet Payout
                // addFunds handles wallets.cashBalance, wallet_transactions and legacy mirror users.currentBalance
                await addFunds(
                    p.driverId,
                    p.reward,
                    'ride_earning', // Using ride_earning for pool rewards as it represents operational gains
                    `Premio Pozo Semanal: ${cityKey} ${weekId}`,
                    tx,
                    payoutId
                );
            });
            processedPayouts.push({ ...p, status: 'paid' });
        } catch (err) {
            logger.error(`[PAYOUT] Error processing driver ${p.driverId}:`, err);
            processedPayouts.push({ ...p, status: 'failed', error: String(err) });
        }
    }

    // 6. Record Final History (Not dry-run)
    const historyId = `settlement_${weekId}_${cityKey}_${Date.now()}`;
    await db.collection('weekly_pool_history').doc(historyId).set({
        cityKey,
        weekId,
        poolAmount,
        totalDistributed,
        isDryRun: false,
        processedAt: now,
        ranking: processedPayouts
    });

    return {
        success: true,
        weekId,
        totalDistributed,
        driversProcessed: processedPayouts.length,
        results: processedPayouts
    };
});

/**
 * [VamO PRO] Weekly Pool RESET MANUAL
 * This function resets the pool and driver points after a payout is confirmed.
 */
export const manualWeeklyPoolResetV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    if (!(request.auth.token as any).admin) {
        throw new HttpsError('permission-denied', 'Solo personal administrativo puede ejecutar el reseteo.');
    }

    const { cityKey } = request.data;
    if (!cityKey) throw new HttpsError('invalid-argument', 'cityKey es obligatorio.');

    const db = getDb();
    const now = Timestamp.now();

    // 1. Safety Check: Verify payout (settlement) exists for this week
    const getWeekId = () => {
        const d = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const parts = formatter.formatToParts(d);
        const y = parts.find(p => p.type === 'year')?.value || '0';
        const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
        const argDate = new Date(parseInt(y), m, day);
        const firstDayOfYear = new Date(parseInt(y), 0, 1);
        const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${y}-W${String(weekNumber).padStart(2, '0')}`;
    };

    const weekId = getWeekId();
    
    const settlementSnap = await db.collection('weekly_pool_history')
        .where('cityKey', '==', cityKey)
        .where('weekId', '==', weekId)
        .where('isDryRun', '==', false)
        .limit(1)
        .get();

    if (settlementSnap.empty) {
        throw new HttpsError('failed-precondition', 'No se encontró un Payout real (Settlement) para esta ciudad/semana. No podés resetear sin haber pagado.');
    }

    const historyDoc = settlementSnap.docs[0];
    const historyData = historyDoc.data();

    if (historyData.resetCompleted) {
        return { success: true, message: 'El reseteo ya fue completado para esta semana.', resetAt: historyData.resetAt };
    }

    // 2. Reset Pool Amount to Base ($50,000)
    const cityRef = db.doc(`cities/${cityKey}`);
    
    // 3. Reset Global Driver Points
    const driversToResetSnap = await db.collection('driver_points')
        .where('weeklyPoints', '>', 0)
        .get();

    const driversByTripsSnap = await db.collection('driver_points')
        .where('weeklyTripsCount', '>', 0)
        .get();

    // Merge unique doc IDs
    const resetSet = new Set<string>();
    driversToResetSnap.docs.forEach(d => resetSet.add(d.id));
    driversByTripsSnap.docs.forEach(d => resetSet.add(d.id));

    logger.info(`[RESET] Resetting pool for ${cityKey} and ${resetSet.size} drivers.`);

    // Execute in batches of 400
    const resetArray = Array.from(resetSet);
    for (let i = 0; i < resetArray.length; i += 400) {
        const batch = db.batch();
        const chunk = resetArray.slice(i, i + 400);
        chunk.forEach(id => {
            batch.update(db.doc(`driver_points/${id}`), {
                weeklyPoints: 0,
                weeklyTripsCount: 0,
                lastResetAt: now,
                previousWeekId: weekId
            });
            // Optional: reset users mirror fields
            batch.update(db.doc(`users/${id}`), {
                weeklyPoints: 0,
                updatedAt: now
            });
        });
        await batch.commit();
    }

    // Finalize: Update City and History
    const finalBatch = db.batch();
    finalBatch.update(cityRef, {
        'rewardsConfig.weeklyPoolAmount': 50000,
        'rewardsConfig.lastResetAt': now
    });
    finalBatch.update(historyDoc.ref, {
        resetCompleted: true,
        resetAt: now
    });
    await finalBatch.commit();

    return {
        success: true,
        weekId,
        driversReset: resetSet.size,
        resetAt: now
    };
});

/**
 * [VamO PRO] Weekly Pool AUTO-CLOSE (Scheduled)
 * Runs every Monday at 03:00 AM ARG.
 * Performs Payouts and Resets for all active cities.
 */
export const scheduledWeeklyPoolAutoCloseV1 = onSchedule({
    schedule: '0 3 * * 1',
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'us-central1',
    retryCount: 3,
    memory: '512MiB'
}, async (event) => {
    logger.info('[WEEKLY_POOL_AUTO_START] Starting weekly liquidation cycle.');
    
    const db = getDb();
    const now = Timestamp.now();
    
    // 1. Calculate weekId (The week that JUST ended)
    const getWeekId = () => {
        const d = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const parts = formatter.formatToParts(d);
        const y = parts.find(p => p.type === 'year')?.value || '0';
        const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
        const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
        const argDate = new Date(parseInt(y), m, day);
        const firstDayOfYear = new Date(parseInt(y), 0, 1);
        const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${y}-W${String(weekNumber).padStart(2, '0')}`;
    };

    const weekId = getWeekId();
    
    // 2. Detect Active Cities
    const citiesSnap = await db.collection('cities').get();
    const activeCities = citiesSnap.docs.filter(doc => {
        const data = doc.data();
        return data.rewardsConfig?.weeklyPoolEnabled !== false && (data.rewardsConfig?.weeklyPoolAmount || 0) > 0;
    });

    if (activeCities.length === 0) {
        logger.info('[WEEKLY_POOL_AUTO_FINISH] No active cities with rewards found.');
        return;
    }

    // 3. Snapshot Rankings (Crucial: Fetch BEFORE any resets)
    // We assume Top 10 global for now as per previous logic
    const topDriversSnap = await db.collection('driver_points')
        .where('weeklyTripsCount', '>=', 10)
        .orderBy('weeklyPoints', 'desc')
        .limit(10)
        .get();

    if (topDriversSnap.empty) {
        logger.info('[WEEKLY_POOL_AUTO_FINISH] No qualified drivers found across all cities.');
        return;
    }

    // 4. Process Each City
    for (const cityDoc of activeCities) {
        const cityKey = cityDoc.id;
        const cityData = cityDoc.data();
        const poolAmount = cityData.rewardsConfig?.weeklyPoolAmount || 0;

        logger.info(`[WEEKLY_POOL_AUTO_CITY_START] Processing ${cityKey} | Pool: $${poolAmount}`);

        // Check Idempotency
        const historySnap = await db.collection('weekly_pool_history')
            .where('cityKey', '==', cityKey)
            .where('weekId', '==', weekId)
            .where('isDryRun', '==', false)
            .limit(1)
            .get();

        if (!historySnap.empty && historySnap.docs[0].data().resetCompleted) {
            logger.info(`[WEEKLY_POOL_AUTO_CITY_SKIP] ${cityKey} already settled and reset.`);
            continue;
        }

        try {
            // A. Payout Logic
            let totalAdjustedPoints = 0;
            const candidates: any[] = [];
            topDriversSnap.docs.forEach((doc, index) => {
                const data = doc.data();
                const rank = index + 1;
                let mult = 1.0;
                if (rank <= 2) mult = 1.5;
                else if (rank <= 6) mult = 1.2;
                const adj = (data.weeklyPoints || 0) * mult;
                totalAdjustedPoints += adj;
                candidates.push({ driverId: doc.id, name: data.driverName || 'Anónimo', rank, points: data.weeklyPoints, mult, adj });
            });

            const cityPayouts = candidates.map(c => ({
                ...c,
                reward: totalAdjustedPoints > 0 ? Math.floor((c.adj / totalAdjustedPoints) * poolAmount) : 0
            }));

            const processedPayouts = [];
            for (const p of cityPayouts) {
                if (p.reward <= 0) continue;
                const payoutId = `weekly_pool_payout_${weekId}_${cityKey}_${p.driverId}`;
                const transactionRef = db.doc(`platform_transactions/${payoutId}`);

                await db.runTransaction(async (tx) => {
                    const txSnap = await tx.get(transactionRef);
                    if (txSnap.exists) return;
                    // [STAGE 2A] Unified Wallet Payout
                    // addFunds handles wallets.cashBalance, wallet_transactions and legacy mirror users.currentBalance
                    await addFunds(
                        p.driverId,
                        p.reward,
                        'ride_earning',
                        `Premio Pozo Semanal (Auto): ${cityKey} ${weekId}`,
                        tx,
                        payoutId
                    );
                });
                processedPayouts.push({ ...p, status: 'paid' });
            }

            logger.info(`[WEEKLY_POOL_AUTO_PAYOUT_SUCCESS] ${cityKey}: Paid ${processedPayouts.length} drivers.`);

            // B. Record History & Reset City Pool
            const historyId = `auto_settlement_${weekId}_${cityKey}_${Date.now()}`;
            const historyRef = db.collection('weekly_pool_history').doc(historyId);
            
            const batch = db.batch();
            batch.set(historyRef, {
                cityKey, weekId, poolAmount, totalDistributed: processedPayouts.reduce((a, b) => a + b.reward, 0),
                isDryRun: false, processedAt: now, ranking: processedPayouts, source: 'auto_cron'
            });
            batch.update(db.doc(`cities/${cityKey}`), {
                'rewardsConfig.weeklyPoolAmount': 50000,
                'rewardsConfig.lastResetAt': now
            });
            await batch.commit();

            logger.info(`[WEEKLY_POOL_AUTO_RESET_SUCCESS] ${cityKey}: Pool reset to 50000.`);

            // C. Finalize Settlement Status
            await historyRef.update({ resetCompleted: true, resetAt: now });

        } catch (err) {
            logger.error(`[WEEKLY_POOL_AUTO_ERROR] Failed city ${cityKey}:`, err);
        }
    }

    // 5. Global Driver Points Reset (Final Step)
    const driversToResetSnap = await db.collection('driver_points')
        .where('weeklyPoints', '>', 0)
        .get();
    
    if (!driversToResetSnap.empty) {
        const resetArray = driversToResetSnap.docs.map(d => d.id);
        for (let i = 0; i < resetArray.length; i += 400) {
            const batch = db.batch();
            const chunk = resetArray.slice(i, i + 400);
            chunk.forEach(id => {
                batch.update(db.doc(`driver_points/${id}`), {
                    weeklyPoints: 0, weeklyTripsCount: 0, lastResetAt: now, previousWeekId: weekId
                });
                batch.update(db.doc(`users/${id}`), {
                    weeklyPoints: 0, updatedAt: now
                });
            });
            await batch.commit();
        }
        logger.info(`[WEEKLY_POOL_AUTO_RESET_SUCCESS] Global reset for ${driversToResetSnap.size} drivers.`);
    }

    logger.info('[WEEKLY_POOL_AUTO_FINISH] All cities processed successfully.');
});

/**
 * [FASE 3] Reservas: Aceptar Reserva (Asignación Anticipada)
 * Allows an approved driver to officially accept a scheduled ride.
 */
export const acceptScheduledRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { rideId } = request.data;
    const driverId = request.auth.uid;

    if (!rideId) throw new HttpsError('invalid-argument', 'Falta rideId.');

    try {
        const result = await db.runTransaction(async (tx) => {
            const rideRef = db.doc(`rides/${rideId}`);
            const driverRef = db.doc(`users/${driverId}`);
            
            const [rideSnap, driverSnap] = await Promise.all([tx.get(rideRef), tx.get(driverRef)]);

            if (!rideSnap.exists) throw new HttpsError('not-found', 'Viaje no encontrado.');
            const ride = rideSnap.data() as Ride;

            if (ride.status !== 'scheduled' && ride.status !== 'pending_driver_assignment') {
                throw new HttpsError('failed-precondition', 'La reserva ya fue tomada o no está disponible.');
            }

            const driver = driverSnap.data() as UserProfile;
            if (!driver) throw new HttpsError('not-found', 'Perfil de conductor no encontrado.');

            // Eligibility check: Approved or Active Municipal Status
            const isApproved = driver.approved === true || driver.municipalStatus === 'active';
            if (!isApproved) {
                throw new HttpsError('permission-denied', 'Tu cuenta aún no está habilitada para tomar reservas.');
            }

            // [VamO PRO] City Isolation: Driver must belong to the same city as the ride
            if (ride.cityKey !== driver.cityKey) {
                throw new HttpsError('permission-denied', 'No podés tomar reservas de otra ciudad.');
            }

            // Derive snapshot for subtype
            const validSubtypes = ['professional', 'particular'];
            let driverSubtypeSnap = ride.serviceType === 'professional' ? 'professional' : 'particular';
            if (validSubtypes.includes(driver.driverSubtype as string)) {
                driverSubtypeSnap = driver.driverSubtype as string;
            }

            // Assign driver to ride
            tx.update(rideRef, {
                status: 'driver_assigned',
                activationStatus: 'waiting_scheduled_time',
                driverId: driverId,
                driverName: driver.name || 'Conductor',
                driverRating: driver.averageRating || 5.0,
                driverVehicle: driver.vehicle ? `${driver.vehicle.brand} ${driver.vehicle.model} (${driver.vehicle.color})` : 'Vehículo pendiente',
                driverPlate: driver.vehicle?.plate || 'N/A',
                driverVehiclePhoto: driver.vehicleFrontPhotoURL || (driver as any).vehiclePhotoFrontUrl || null,
                driverPhotoUrl: driver.photoURL || null,
                driverVehicleBrand: driver.vehicle?.brand || null,
                driverVehicleModel: driver.vehicle?.model || null,
                driverVehicleYear: driver.vehicle?.year || null,
                driverVehicleColor: driver.vehicle?.color || null,
                // [VamO PRO] Fleet management fields
                activeDriverId: driverId,
                vehicleOwnerId: driver.vehicleOwnerId || null,
                settlementOwnerId: driver.vehicleOwnerId || driverId,
                vehicleId: driver.vehicle?.plate || null,
                paymentAgreementSnapshot: (driver as any).paymentAgreement || null,
                commissionRateSnapshot: 0,
                driverSubtypeSnapshot: driver.driverSubtype || 'express',
                driverAssignedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            return { success: true };
        });

        return result;
    } catch (error: any) {
        logger.error(`[RESERVATIONS] Error in acceptScheduledRideV1 for ride ${rideId}`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Error al procesar la solicitud.');
    }
});

export const clearPassengerActiveRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const userRef = db.doc(`users/${request.auth.uid}`);
    await userRef.update({
        activeRideId: FieldValue.delete(),
        activeSharedRideId: FieldValue.delete(),
        activeSharedGroupId: FieldValue.delete(),
        activeSharedRequestId: FieldValue.delete()
    });
    return { success: true };
});
