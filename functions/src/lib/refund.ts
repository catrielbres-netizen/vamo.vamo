
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { Ride, UserProfile } from '../types';
import { getDb } from './firebaseAdmin';
import { releaseLockedWallet } from './wallet';

/**
 * [VamO PRO] Unified Financial & Policy Handler for Cancelled Rides
 * Ensures ALL READS happen before ALL WRITES to comply with Firestore Transactions.
 */
export async function handleRideCancellationFinancials({
    rideId,
    reason,
    actor,
    tx,
    rideData
}: {
    rideId: string,
    reason: string,
    actor: 'system' | 'passenger' | 'driver' | 'admin',
    tx: admin.firestore.Transaction,
    rideData: Ride
}) {
    const db = getDb();
    const passengerId = rideData.passengerId;
    if (!passengerId) return;

    const walletCovered = rideData.pricing?.walletCoveredAmount || 0;
    const creditCovered = rideData.pricing?.creditCoveredAmount || 0;

    // --- PHASE 1: ALL READS ---
    const userRef = db.doc(`users/${passengerId}`);
    const lockTxRef = db.collection('wallet_transactions').doc(`lock_${rideId}`);
    const lockedCreditsQuery = db.collection('passenger_credits')
        .where('rideId', '==', rideId)
        .where('status', '==', 'locked');

    // Perform all reads in parallel
    const [userSnap, lockSnap, lockedCreditsSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(lockTxRef),
        tx.get(lockedCreditsQuery)
    ]);

    // --- PHASE 2: LOGIC & WRITES ---

    // 1. REFUND LOGIC (Idempotent)
    if (rideData.status !== 'completed' && !(rideData as any).walletRefunded) {
        if (walletCovered > 0 || creditCovered > 0) {
            
            // 1.1 Wallet Release
            if (walletCovered > 0) {
                let cashToRelease = 0;
                let promoToRelease = 0;
                
                if (lockSnap.exists) {
                    const lockData = lockSnap.data();
                    cashToRelease = Math.abs(lockData?.cashAmount || 0);
                    promoToRelease = Math.abs(lockData?.promoAmount || 0);
                } else {
                    cashToRelease = walletCovered;
                }

                if (cashToRelease > 0 || promoToRelease > 0) {
                    await releaseLockedWallet(passengerId, rideId, cashToRelease, promoToRelease, tx);
                }
            }

            // 1.2 Credits Release
            if (creditCovered > 0 && !lockedCreditsSnap.empty) {
                lockedCreditsSnap.forEach(doc => {
                    tx.update(doc.ref, {
                        status: 'active',
                        rideId: FieldValue.delete(),
                        lockedAmount: FieldValue.delete()
                    });
                });
            }

            // 1.3 Mark Ride as Refunded
            tx.update(db.doc(`rides/${rideId}`), {
                walletRefunded: true,
                walletRefundedAmount: walletCovered + creditCovered,
                walletRefundedAt: FieldValue.serverTimestamp(),
                walletRefundReason: reason,
                walletRefundActor: actor,
                walletRefundTransactionId: `release_${rideId}`
            });

            logger.info(`[WALLET_REFUND_CANCELLED_RIDE] rideId=${rideId} passengerId=${passengerId} amount=${walletCovered + creditCovered} reason=${reason} actor=${actor} status=${rideData.status}`);
        }
    }

    // 2. CANCELLATION POLICY LOGIC
    if (actor === 'passenger') {
        const systemReasons = [
            'NO_DRIVERS_AVAILABLE', 
            'MAX_MATCHING_ATTEMPTS_REACHED', 
            'GLOBAL_SEARCH_TIMEOUT',
            'NO_ELIGIBLE_DRIVERS',
            'MATCHING_EXPIRED',
            'DRIVER_NOT_FOUND'
        ];

        if (!systemReasons.includes(reason) && userSnap.exists) {
            const userData = userSnap.data() as UserProfile;
            const now = Timestamp.now();
            const lastResetAt = (userData as any).weeklyCancellationsResetAt;
            
            let currentCount = (userData as any).weeklyCancellations || 0;
            
            // Weekly Reset logic (7 days)
            const weekInMs = 7 * 24 * 60 * 60 * 1000;
            if (!lastResetAt || (now.toMillis() - lastResetAt.toMillis() > weekInMs)) {
                currentCount = 0;
                tx.update(userRef, {
                    weeklyCancellationsResetAt: now
                });
            }

            const nextCount = currentCount + 1;
            const updatePayload: any = {
                weeklyCancellations: nextCount,
                lastCancellationAt: now,
                updatedAt: FieldValue.serverTimestamp()
            };

            let passengerStatus = (userData as any).passengerStatus || 'active';

            if (nextCount >= 3) {
                const blockedUntil = new Timestamp(now.seconds + 24 * 60 * 60, 0);
                updatePayload.passengerCancellationBlockedUntil = blockedUntil;
                updatePayload.passengerStatus = 'limited';
                passengerStatus = 'limited';
                logger.warn(`[PASSENGER_LIMIT] User ${passengerId} limited until ${blockedUntil.toDate().toISOString()} due to 3rd weekly cancellation.`);
            }

            tx.update(userRef, updatePayload);
            
            tx.update(db.doc(`rides/${rideId}`), {
                countsAgainstPassenger: true,
                passengerWeeklyCancellationCount: nextCount
            });

            logger.info(`[PASSENGER_CANCELLATION_COUNT] passengerId=${passengerId} rideId=${rideId} weeklyCount=${nextCount} status=${passengerStatus}`);
        }
    }
}
