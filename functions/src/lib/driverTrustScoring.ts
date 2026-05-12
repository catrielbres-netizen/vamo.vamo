
import * as admin from "firebase-admin";

const db = admin.firestore();

export interface DriverTrustScore {
    score: number; // 0 to 100
    level: 'low' | 'medium' | 'high' | 'pro' | 'verified';
    flags: string[];
    updatedAt: any;
}

/**
 * [VamO PRO] Driver Trust Scoring Engine
 * Evaluates driver reliability based on municipal compliance, behavior, and history.
 */
export async function calculateDriverTrustScore(driverId: string): Promise<DriverTrustScore> {
    const userSnap = await db.collection('users').doc(driverId).get();
    if (!userSnap.exists) return { score: 0, level: 'low', flags: ['DRIVER_NOT_FOUND'], updatedAt: new Date() };

    const driver = userSnap.data() as any;
    let score = 50; // Starting base score
    const flags: string[] = [];

    // 1. Municipal Compliance
    if (driver.municipalStatus === 'active' || driver.municipalStatus === 'approved') {
        score += 20;
    } else if (driver.municipalStatus === 'pending_municipal_review') {
        score += 5;
    } else {
        flags.push('MUNICIPAL_NOT_ACTIVE');
    }

    // 2. Behavioral Metrics
    const stats = driver.stats || {};
    const acceptanceRate = stats.acceptanceRate || 0;
    const cancellationRate = stats.cancellationRate || 0;

    if (acceptanceRate > 0.8) score += 10;
    else if (acceptanceRate < 0.4) {
        score -= 10;
        flags.push('LOW_ACCEPTANCE_RATE');
    }

    if (cancellationRate > 0.3) {
        score -= 20;
        flags.push('HIGH_CANCELLATION_RATE');
    }

    // 3. Risk History (Ghost Rides, etc.)
    const riskScore = driver.driverRiskScore || 0;
    if (riskScore > 70) {
        score -= 40;
        flags.push('HIGH_SECURITY_RISK');
    } else if (riskScore > 30) {
        score -= 15;
        flags.push('MEDIUM_SECURITY_RISK');
    }

    // 4. Rating
    const rating = driver.averageRating || 0;
    if (rating >= 4.8) score += 10;
    else if (rating < 3.5 && rating > 0) {
        score -= 15;
        flags.push('LOW_RATING');
    }

    // 5. Seniority
    const createdAt = driver.createdAt?.toDate() || new Date();
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 90) score += 10;

    // Cap score
    score = Math.max(0, Math.min(100, score));

    let level: DriverTrustScore['level'] = 'low';
    if (score >= 95) level = 'pro';
    else if (score >= 80) level = 'verified';
    else if (score >= 60) level = 'high';
    else if (score >= 40) level = 'medium';

    return {
        score,
        level,
        flags,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
}
