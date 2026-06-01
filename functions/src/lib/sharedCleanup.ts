import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { UserProfile } from "../types";

/**
 * [VamO PRO] Centralized utility to resolve and clean up stale shared ride states.
 * Returns true if the user is BLOCKED by a real active ride (shared or normal).
 */
export async function resolveActiveSharedRideState(
    userId: string, 
    db: FirebaseFirestore.Firestore,
    tx?: FirebaseFirestore.Transaction
): Promise<{ isBlocked: boolean; reason?: string }> {
    const userRef = db.doc(`users/${userId}`);
    const userSnap = tx ? await tx.get(userRef) : await userRef.get();
    
    if (!userSnap.exists) return { isBlocked: false };
    const userData = userSnap.data() as UserProfile;

    const activeRideId = userData.activeRideId;
    const activeSharedRequestId = userData.activeSharedRequestId;
    const activeSharedRideGroupId = (userData as any).activeSharedRideGroupId || (userData as any).currentSharedRideGroupId;

    logger.info(`[BLOCKING_STATE_RESOLVE] Checking user ${userId}. activeRideId=${activeRideId}, sharedReq=${activeSharedRequestId}, sharedGroup=${activeSharedRideGroupId}`);

    // [VamO PRO] NEW STRICT RULE: 
    // Normal ride only blocked if activeRideId points to a REAL active ride.
    if (activeRideId) {
        const rideRef = db.doc(`rides/${activeRideId}`);
        const rideSnap = tx ? await tx.get(rideRef) : await rideRef.get();
        
        if (rideSnap.exists) {
            const rideData = rideSnap.data() as any;
            const blockingStatuses = ['searching', 'offered', 'accepted', 'driver_assigned', 'driver_arrived', 'in_progress', 'paused'];
            
            if (blockingStatuses.includes(rideData.status)) {
                return { 
                    isBlocked: true, 
                    reason: "Tenés un viaje en curso. Finalizalo o cancelalo para pedir uno nuevo." 
                };
            }
        }
        
        // If we are here, activeRideId exists but ride is NOT in a blocking state.
        // We should clean activeRideId, but we'll do it later along with shared fields if needed.
    }

    // If there is NO active ride, we should NEVER block a normal ride request.
    // Even if there's a shared group/request field, we clean them and allow.
    if (activeSharedRequestId || activeSharedRideGroupId || (userData as any).sharedRideStatus || activeRideId) {
        logger.info(`[SHARED_STATE_CLEANUP] Cleaning stale/ghost state for user ${userId} to allow normal ride.`);
        const updateData: any = {
            activeSharedRequestId: FieldValue.delete(),
            activeSharedRideGroupId: FieldValue.delete(),
            currentSharedRideGroupId: FieldValue.delete(),
            sharedRideStatus: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
        };

        // If activeRideId was stale (non-blocking), clear it too.
        if (activeRideId) {
            updateData.activeRideId = FieldValue.delete();
        }
        
        if (tx) {
            tx.update(userRef, updateData);
        } else {
            await userRef.update(updateData);
        }
    }

    return { isBlocked: false };
}
