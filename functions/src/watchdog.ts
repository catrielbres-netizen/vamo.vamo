
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { UserProfile } from "./types";
import { computeDriverRiskProfile } from "./lib/driverRisk";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * driverWatchdogV1
 * Runs every 5 minutes to detect and heal "stuck" driver states.
 * - Cleans up activeRideId if the ride is finished or missing.
 * - Detects "hung" rides (e.g. searching for too long or in_progress for > 2h).
 */
export const driverWatchdogV1 = onSchedule("every 5 minutes", async (event) => {
    logger.info("[WATCHDOG] Starting driver health audit...");
    
    const now = admin.firestore.Timestamp.now();
    const driversSnap = await db.collection('drivers_locations')
        .where('driverStatus', '==', 'in_ride')
        .get();

    if (driversSnap.empty) {
        logger.info("[WATCHDOG] No active drivers found. Audit complete.");
        return;
    }

    let healedCount = 0;

    for (const doc of driversSnap.docs) {
        const driverId = doc.id;
        const userSnap = await db.collection('users').doc(driverId).get();
        if (!userSnap.exists) continue;

        const userData = userSnap.data();
        const activeRideId = userData?.activeRideId;

        if (!activeRideId) {
            // Inconsistency: drivers_locations says 'in_ride' but user profile has no activeRideId
            logger.warn(`[WATCHDOG] Inconsistency detected for driver ${driverId}: status=in_ride but activeRideId is null. Healing...`);
            await doc.ref.update({ driverStatus: 'online', updatedAt: now });
            healedCount++;
            continue;
        }

        const rideSnap = await db.collection('rides').doc(activeRideId).get();
        
        let shouldRelease = false;
        let reason = "";

        if (!rideSnap.exists) {
            shouldRelease = true;
            reason = "Ghost Ride (document missing)";
        } else {
            const rideData = rideSnap.data() as any;
            const finishedStates = ['completed', 'cancelled', 'rejected', 'expired'];
            
            if (finishedStates.includes(rideData.status)) {
                shouldRelease = true;
                reason = `Ride is finished (status: ${rideData.status})`;
            } else {
                // Timeout check: if in_progress for more than 2 hours
                if (rideData.status === 'in_progress' && rideData.startedAt) {
                    const durationHrs = (now.seconds - rideData.startedAt.seconds) / 3600;
                    if (durationHrs > 2) {
                        shouldRelease = true;
                        reason = "Ride Timeout (> 2h in_progress)";
                    }
                }
            }
        }

        if (shouldRelease) {
            logger.warn(`[WATCHDOG] Releasing stuck driver ${driverId}. Reason: ${reason}`);
            
            // [VamO PRO] Risk Update on Watchdog Intervention
            const updatedUserData: UserProfile = {
                ...userData as UserProfile,
                watchdogReleaseCount: (userData?.watchdogReleaseCount || 0) + 1,
                driverStatus: 'online' as any
            };
            const riskProfile = computeDriverRiskProfile(updatedUserData);

            const batch = db.batch();
            batch.update(db.collection('users').doc(driverId), { 
                ...riskProfile,
                watchdogReleaseCount: FieldValue.increment(1),
                activeRideId: null, 
                driverStatus: 'online', 
                updatedAt: now 
            });
            batch.update(db.collection('drivers_locations').doc(driverId), { 
                driverStatus: 'online', 
                driverRiskLevel: riskProfile.driverRiskLevel,
                driverRiskScore: riskProfile.driverRiskScore,
                updatedAt: now 
            });
            
            await batch.commit();
            healedCount++;
        }
    }

    logger.info(`[WATCHDOG] Audit complete. Healed ${healedCount} drivers.`);
});
