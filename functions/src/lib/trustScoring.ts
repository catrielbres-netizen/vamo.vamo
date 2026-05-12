
import * as admin from "firebase-admin";

const db = admin.firestore();

export interface TrustScore {
    score: number; // 0 to 100
    level: 'low' | 'medium' | 'high' | 'verified';
    flags: string[];
    updatedAt: any;
}

/**
 * [VamO PRO] Trust Scoring Engine
 * Evaluates user reliability based on history, verification, and behavior.
 */
export async function calculateUserTrustScore(userId: string): Promise<TrustScore> {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return { score: 0, level: 'low', flags: ['USER_NOT_FOUND'], updatedAt: new Date() };

    const user = userSnap.data() as any;
    let score = 50; // Starting base score
    const flags: string[] = [];

    // 1. Email Verification
    if (user.emailVerified) {
        score += 20;
    } else {
        flags.push('EMAIL_NOT_VERIFIED');
    }

    // 2. Profile Completion
    if (user.profileCompleted) {
        score += 10;
    }

    // 3. Historical Behavior (Cancellations)
    const pStats = user.passengerStats || {};
    const totalRides = pStats.totalRides || 0;
    const cancelledRides = pStats.cancelledRides || 0;

    if (totalRides > 5) {
        const cancelRate = cancelledRides / totalRides;
        if (cancelRate > 0.5) {
            score -= 30;
            flags.push('HIGH_CANCELLATION_RATE');
        } else if (cancelRate < 0.1) {
            score += 10;
        }
    }

    // 4. Age of Account
    const createdAt = user.createdAt?.toDate() || new Date();
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 30) {
        score += 10;
    } else {
        flags.push('NEW_ACCOUNT');
    }

    // Cap score
    score = Math.max(0, Math.min(100, score));

    let level: TrustScore['level'] = 'low';
    if (score >= 90) level = 'verified';
    else if (score >= 70) level = 'high';
    else if (score >= 40) level = 'medium';

    return {
        score,
        level,
        flags,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}
