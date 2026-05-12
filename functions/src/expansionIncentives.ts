import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { ExpansionIncentive, ChubutExpansionStats, Ride } from "./types";

/**
 * [VamO PRO] Expansion Incentives Logic v2 (Activity Based)
 * Progress is now based on completed trips in Chubut OUTSIDE of Rawson.
 */

const FOUNDER_CITY = 'rawson';
const TARGET_PROVINCE = 'chubut';
const TARGET_TRIPS = 50000; // 100% expansion goal

/**
 * Updates the expansion progress based on a completed ride.
 * Only called from settlement logic when a ride is completed.
 */
export async function updateChubutExpansionProgressV1(ride: Ride) {
    const db = getDb();
    
    // 1. Idempotency & Eligibility Check
    // - Only completed rides
    // - Only if not already processed by the expansion engine
    // - Only if marked as settled (expansionCounted)
    if (ride.status !== 'completed' || !ride.expansionCounted || (ride as any).expansionProcessed) {
        return;
    }

    // 2. Geography Check: Only count rides in Chubut that are NOT in Rawson
    if (ride.cityKey === FOUNDER_CITY) return;
    
    try {
        const citySnap = await db.doc(`cities/${ride.cityKey}`).get();
        const cityData = citySnap.data();
        if (cityData?.province?.toLowerCase() !== TARGET_PROVINCE) return;

        const statsRef = db.doc('stats/chubut_expansion');
        const incentiveRef = db.doc(`expansion_incentives/${FOUNDER_CITY}`);
        const rideRef = db.doc(`rides/${ride.id}`);
        
        await db.runTransaction(async (tx) => {
            // Fetch stats, incentive config and ride state within transaction
            const [statsSnap, incentiveSnap, rideSnap] = await Promise.all([
                tx.get(statsRef),
                tx.get(incentiveRef),
                tx.get(rideRef)
            ]);

            // Re-verify idempotency inside transaction
            if (rideSnap.exists && rideSnap.data()?.expansionProcessed) {
                logger.warn(`[EXPANSION SKIP] Ride ${ride.id} already processed.`);
                return;
            }

            const stats = statsSnap.data() as ChubutExpansionStats;
            // +1 because this ride just completed
            const currentTotal = (stats?.totalTripsOutsideRawson || 0) + 1;
            const progress = Math.min(1, currentTotal / TARGET_TRIPS);

            let incentive: ExpansionIncentive;
            if (!incentiveSnap.exists) {
                // Initialize with default targets if not exists
                incentive = {
                    id: FOUNDER_CITY,
                    province: TARGET_PROVINCE,
                    founderCityKey: FOUNDER_CITY,
                    totalTargetTrips: TARGET_TRIPS,
                    currentTripsOutsideFounder: currentTotal,
                    progress,
                    config: {
                        municipalShare: { start: 0.05, target: 0.15 },
                        taxiRemisCommission: { start: 0.10, target: 0.03 },
                        particularCommission: { start: 0.18, target: 0.12 }
                    },
                    currentRates: {
                        municipalRate: 0.05,
                        taxiRemisCommission: 0.10,
                        particularCommission: 0.18
                    },
                    enabled: true,
                    updatedAt: FieldValue.serverTimestamp()
                };
            } else {
                incentive = incentiveSnap.data() as ExpansionIncentive;
            }

            // Linear Interpolation: progress * (target - start) + start
            const lerp = (start: number, end: number, p: number) => start + (end - start) * p;
            
            const newRates = {
                municipalRate: lerp(incentive.config.municipalShare.start, incentive.config.municipalShare.target, progress),
                taxiRemisCommission: lerp(incentive.config.taxiRemisCommission.start, incentive.config.taxiRemisCommission.target, progress),
                particularCommission: lerp(incentive.config.particularCommission.start, incentive.config.particularCommission.target, progress)
            };

            // Atomically update both the counter and the cached rates
            tx.set(statsRef, {
                totalTripsOutsideRawson: currentTotal,
                lastUpdated: FieldValue.serverTimestamp()
            }, { merge: true });

            tx.set(incentiveRef, {
                currentTripsOutsideFounder: currentTotal,
                progress,
                currentRates: newRates,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            tx.update(rideRef, { expansionProcessed: true });

            logger.info(`[EXPANSION] Progress updated to ${(progress * 100).toFixed(4)}% (${currentTotal}/${TARGET_TRIPS} rides) based on ride ${ride.id}.`);
        });

    } catch (error) {
        logger.error(`[EXPANSION_ERROR] Failed to update progress for ride ${ride.id}:`, error);
    }
}
