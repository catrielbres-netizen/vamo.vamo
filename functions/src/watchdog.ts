
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { UserProfile, Ride } from "./types";
import { computeDriverRiskProfile } from "./lib/driverRisk";
import { FieldValue } from "firebase-admin/firestore";
import { handleRideCancellationFinancials } from "./lib/refund";
import { findNextDriverAndCreateOffer } from "./rides";

const db = admin.firestore();

/**
 * driverWatchdogV1
 * Runs every 5 minutes to detect and heal "stuck" driver states.
 * - Cleans up activeRideId only if the ride is finished or missing.
 * - CONSERVATIVE: Does not release drivers from ongoing in_progress rides by duration.
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
            }
            // CONSERVATIVE RULE: We no longer auto-release driver if ride is 'in_progress' regardless of time here.
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

/**
 * rideWatchdogV1
 * Runs every 5 minutes to audit and resolve stuck rides,
 * matching engine inconsistencies, and user profile activeRideId state.
 * CONSERVATIVE VERSION: Never cancels or releases active rides (assigned, arrived, in_progress, paused) automatically.
 * Instead, flags them for admin review (needsAdminReview = true).
 */
export const rideWatchdogV1 = onSchedule({
    schedule: "every 5 minutes",
    timeZone: "America/Argentina/Buenos_Aires",
    memory: "512MiB"
}, async (event) => {
    logger.info("[RIDE_WATCHDOG] Starting ride lifecycle and matching integrity audit...");
    const now = admin.firestore.Timestamp.now();
    const nowMillis = now.toMillis();
    
    // 1. Audit active (non-terminal) rides
    try {
        const activeRidesSnap = await db.collection('rides')
            .where('status', 'in', ['scheduled', 'searching', 'driver_assigned', 'driver_arrived', 'in_progress', 'paused'])
            .limit(200)
            .get();

        logger.info(`[RIDE_WATCHDOG] Found ${activeRidesSnap.size} non-terminal rides to check.`);

        for (const doc of activeRidesSnap.docs) {
            const rideId = doc.id;
            const rideData = doc.data() as Ride;
            
            try {
                // Check A: Scheduled ride that missed its window
                if (rideData.status === 'scheduled' && rideData.scheduledAt) {
                    const scheduledMillis = (rideData.scheduledAt as any).toMillis();
                    if (nowMillis - scheduledMillis > 30 * 60 * 1000) {
                        if (!rideData.driverId) {
                            // Safe to cancel automatically because no driver is assigned and it never started
                            logger.warn(`[RIDE_WATCHDOG] Scheduled ride ${rideId} has no driver and missed its window. Cancelling automatically...`);
                            await cancelRideViaWatchdog(rideId, 'SCHEDULED_ACTIVATION_MISSED');
                        } else {
                            // If it has a driver, flag for review instead of cancelling automatically
                            logger.warn(`[RIDE_WATCHDOG] Scheduled ride ${rideId} has driver assigned but missed its window. Flagging for review.`);
                            await db.collection('rides').doc(rideId).update({
                                needsAdminReview: true,
                                requiresAdminReview: true,
                                watchdogFlag: "scheduled_stalled_with_driver",
                                watchdogFlaggedAt: now,
                                watchdogLastCheckAt: now,
                                updatedAt: now
                            });
                        }
                    }
                }
                
                // Check B: driver_assigned stalled (flag for review, do not cancel or release users)
                else if (rideData.status === 'driver_assigned') {
                    const referenceTime = rideData.driverAssignedAt || rideData.updatedAt || rideData.createdAt;
                    if (referenceTime) {
                        const ageMs = nowMillis - (referenceTime as any).toMillis();
                        if (ageMs > 30 * 60 * 1000) {
                            logger.warn(`[RIDE_WATCHDOG] Ride ${rideId} stalled in driver_assigned state for ${Math.round(ageMs / 60000)} mins. Flagging for admin review.`);
                            await db.collection('rides').doc(rideId).update({
                                needsAdminReview: true,
                                requiresAdminReview: true,
                                watchdogFlag: "stalled_driver_assigned",
                                watchdogFlaggedAt: now,
                                watchdogLastCheckAt: now,
                                updatedAt: now
                            });
                        }
                    }
                }
                
                // Check C: driver_arrived stalled (flag for review, do not cancel or release users)
                else if (rideData.status === 'driver_arrived') {
                    const referenceTime = rideData.arrivedAt || rideData.updatedAt;
                    if (referenceTime) {
                        const ageMs = nowMillis - (referenceTime as any).toMillis();
                        if (ageMs > 20 * 60 * 1000) {
                            logger.warn(`[RIDE_WATCHDOG] Ride ${rideId} stalled in driver_arrived state for ${Math.round(ageMs / 60000)} mins. Flagging for admin review.`);
                            await db.collection('rides').doc(rideId).update({
                                needsAdminReview: true,
                                requiresAdminReview: true,
                                watchdogFlag: "stalled_driver_arrived",
                                watchdogFlaggedAt: now,
                                watchdogLastCheckAt: now,
                                updatedAt: now
                            });
                        }
                    }
                }
                
                // Check D: in_progress/paused too long (flag for review, do not cancel or release users)
                else if (rideData.status === 'in_progress' || rideData.status === 'paused') {
                    const referenceTime = rideData.startedAt || rideData.updatedAt;
                    if (referenceTime) {
                        const ageMs = nowMillis - (referenceTime as any).toMillis();
                        if (ageMs > 2 * 60 * 60 * 1000) {
                            logger.warn(`[RIDE_WATCHDOG] Ride ${rideId} active for too long (${Math.round(ageMs / 3600000)} hours). Flagging for admin review.`);
                            await db.collection('rides').doc(rideId).update({
                                needsAdminReview: true,
                                requiresAdminReview: true,
                                watchdogFlag: "long_running_active_ride",
                                watchdogFlaggedAt: now,
                                watchdogLastCheckAt: now,
                                updatedAt: now
                            });
                        }
                    }
                }
                
                // Check E: searching ride matching integrity
                else if (rideData.status === 'searching' && rideData.currentOfferedDriverId) {
                    const offerQuery = await db.collection('rideOffers')
                        .where('rideId', '==', rideId)
                        .where('driverId', '==', rideData.currentOfferedDriverId)
                        .where('status', '==', 'pending')
                        .limit(1)
                        .get();
                    
                    if (offerQuery.empty) {
                        logger.warn(`[RIDE_WATCHDOG] Ride ${rideId} is searching but currentOfferedDriverId ${rideData.currentOfferedDriverId} has no pending offer. Healing matching engine...`);
                        await db.collection('rides').doc(rideId).update({
                            currentOfferedDriverId: null,
                            matchingExpiresAt: null,
                            updatedAt: now
                        });
                        
                        logger.info(`[RIDE_WATCHDOG] Triggering findNextDriverAndCreateOffer for healed ride ${rideId}`);
                        await findNextDriverAndCreateOffer(rideId).catch(err => {
                            logger.error(`[RIDE_WATCHDOG] Matching restart failed for ${rideId}:`, err);
                        });
                    }
                }
            } catch (err) {
                logger.error(`[RIDE_WATCHDOG] Failed to process active ride ${rideId}:`, err);
            }
        }
    } catch (err) {
        logger.error("[RIDE_WATCHDOG] Error auditing active rides:", err);
    }

    // 2. Audit completed rides that are not settled (older than 10 minutes)
    try {
        const completedRidesSnap = await db.collection('rides')
            .where('status', '==', 'completed')
            .orderBy('completedAt', 'desc')
            .limit(100)
            .get();
        
        for (const doc of completedRidesSnap.docs) {
            const rideId = doc.id;
            const rideData = doc.data();
            
            if (!rideData.settledAt) {
                const completedAt = rideData.completedAt;
                if (completedAt) {
                    const ageMs = nowMillis - (completedAt as any).toMillis();
                    if (ageMs > 10 * 60 * 1000) {
                        const retries = rideData.settlementRetryCount || 0;
                        if (retries < 3) {
                            logger.warn(`[RIDE_WATCHDOG] Completed ride ${rideId} is not settled. Retry count: ${retries}. Touching to re-trigger settlement.`);
                            await db.collection('rides').doc(rideId).update({
                                settlementRetryCount: admin.firestore.FieldValue.increment(1),
                                updatedAt: now
                            });
                        } else {
                            logger.warn(`[RIDE_WATCHDOG] Completed ride ${rideId} has failed settlement 3 times. Flagging for admin review.`);
                            await db.collection('rides').doc(rideId).update({
                                needsAdminReview: true,
                                requiresAdminReview: true,
                                watchdogFlag: "settlement_failed_retries",
                                watchdogFlaggedAt: now,
                                watchdogLastCheckAt: now,
                                updatedAt: now
                            });
                        }
                    }
                }
            }
        }
    } catch (err) {
        logger.error("[RIDE_WATCHDOG] Error auditing completed unsettled rides:", err);
    }

    // 3. Clean up passengers and drivers with stuck activeRideId pointing to finished or missing rides
    // CONSERVATIVE RULE: Only release if there is a strong evidence of inconsistency (ghost or finished rides)
    try {
        const usersSnap = await db.collection('users')
            .orderBy('activeRideId')
            .limit(200)
            .get();

        for (const doc of usersSnap.docs) {
            const userId = doc.id;
            const userData = doc.data() as UserProfile;
            const activeRideId = userData.activeRideId;
            
            if (!activeRideId) continue;
            
            try {
                const rideSnap = await db.collection('rides').doc(activeRideId).get();
                let shouldClear = false;
                let reason = "";
                
                if (!rideSnap.exists) {
                    shouldClear = true;
                    reason = "Ghost Ride (document missing)";
                } else {
                    const rideData = rideSnap.data() as Ride;
                    if (rideData.status === 'completed' || rideData.status === 'cancelled') {
                        shouldClear = true;
                        reason = `Ride ${activeRideId} is in terminal state (${rideData.status})`;
                    }
                }
                
                if (shouldClear) {
                    logger.warn(`[RIDE_WATCHDOG] Clearing stuck activeRideId for user ${userId} (${userData.role}). Reason: ${reason}`);
                    const batch = db.batch();
                    
                    const updatePayload: any = {
                        activeRideId: null,
                        updatedAt: now
                    };
                    
                    if (userData.role === 'passenger') {
                        updatePayload.activeSharedRequestId = admin.firestore.FieldValue.delete();
                        updatePayload.activeSharedRideGroupId = admin.firestore.FieldValue.delete();
                        updatePayload.sharedRideStatus = 'expired';
                    }
                    
                    batch.update(doc.ref, updatePayload);
                    
                    if (userData.role === 'driver') {
                        batch.update(db.collection('drivers_locations').doc(userId), {
                            driverStatus: 'online',
                            updatedAt: now
                        });
                    }
                    
                    await batch.commit();
                }
            } catch (err) {
                logger.error(`[RIDE_WATCHDOG] Failed to check/clear activeRideId for user ${userId}:`, err);
            }
        }
    } catch (err) {
        logger.error("[RIDE_WATCHDOG] Error auditing user activeRideId:", err);
    }

    // 4. Clean up orphan/stuck ride offers
    try {
        const pendingOffersSnap = await db.collection('rideOffers')
            .where('status', '==', 'pending')
            .limit(100)
            .get();

        for (const doc of pendingOffersSnap.docs) {
            const offerId = doc.id;
            const offerData = doc.data();
            
            try {
                const rideSnap = await db.collection('rides').doc(offerData.rideId).get();
                let shouldExpire = false;
                let reason = "";
                
                if (!rideSnap.exists) {
                    shouldExpire = true;
                    reason = "PARENT_RIDE_MISSING";
                } else {
                    const rideData = rideSnap.data() as Ride;
                    if (rideData.status !== 'searching') {
                        shouldExpire = true;
                        reason = "PARENT_RIDE_INACTIVE";
                    }
                }
                
                if (shouldExpire) {
                    logger.warn(`[RIDE_WATCHDOG] Expiring orphan ride offer ${offerId} (ride: ${offerData.rideId}). Reason: ${reason}`);
                    await doc.ref.update({
                        status: 'expired',
                        finalizedAt: now,
                        expireReason: reason,
                        updatedAt: now
                    });
                }
            } catch (err) {
                logger.error(`[RIDE_WATCHDOG] Failed to process pending offer ${offerId}:`, err);
            }
        }
    } catch (err) {
        logger.error("[RIDE_WATCHDOG] Error auditing pending offers:", err);
    }

    logger.info("[RIDE_WATCHDOG] Ride lifecycle and matching integrity audit complete.");
});

/**
 * cancelRideViaWatchdog
 * Runs scheduled ride cancellation under transaction to ensure READ-BEFORE-WRITE
 * and refund/release wallet funds correctly. Only called for scheduled rides with no driver.
 */
async function cancelRideViaWatchdog(rideId: string, cancelReason: string) {
    const rideRef = db.collection('rides').doc(rideId);
    
    await db.runTransaction(async (tx) => {
        const rideSnap = await tx.get(rideRef);
        if (!rideSnap.exists) return;
        const rideData = rideSnap.data() as Ride;
        
        // Only allow automatic cancellation for scheduled rides that have NO driver assigned
        if (rideData.status !== 'scheduled' || rideData.driverId) {
            logger.info(`[RIDE_WATCHDOG] Skip auto-cancellation of ride ${rideId} since it has a driver or is not scheduled.`);
            return;
        }
        
        const passengerId = rideData.passengerId;
        const passengerRef = db.collection('users').doc(passengerId);
        const passengerSnap = await tx.get(passengerRef);
        
        const rideUpdate: any = {
            status: 'cancelled',
            cancelledBy: 'system',
            cancelReason,
            cancelledAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
            watchdogInterventionAt: admin.firestore.Timestamp.now()
        };
        const userUpdate: any = {
            activeRideId: null,
            activeSharedRequestId: admin.firestore.FieldValue.delete(),
            activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
            sharedRideStatus: 'expired',
            updatedAt: admin.firestore.Timestamp.now()
        };

        // Execute financials inside transaction (safely refunds/releases passenger locked wallet funds)
        await handleRideCancellationFinancials({
            rideId,
            reason: cancelReason,
            actor: 'system',
            tx,
            rideData,
            rideUpdate,
            userUpdate
        });
        
        // Update ride document
        tx.update(rideRef, rideUpdate);
        
        // Release passenger
        if (passengerSnap.exists) {
            tx.update(passengerRef, userUpdate);
        }
    });
}

