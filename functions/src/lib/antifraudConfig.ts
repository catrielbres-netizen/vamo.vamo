import { getDb } from './firebaseAdmin';
import { AntifraudConfig } from '../types';
import * as logger from 'firebase-functions/logger';

const DEFAULT_CONFIG: AntifraudConfig = {
    enabled: true,
    mode: "monitor",
    blockSuspiciousRides: false,
    blockSuspiciousClaims: false,
    blockSuspiciousUsers: false,
    requireManualReviewAboveScore: 70,
    autoBlockAboveScore: 90,
    updatedAt: new Date() as any,
    updatedBy: "system_default"
};

/**
 * [VamO PRO] Get Antifraud Configuration from Firestore
 */
export async function getAntifraudConfig(): Promise<AntifraudConfig> {
    const db = getDb();
    try {
        const snap = await db.collection('system_config').doc('antifraud').get();
        if (!snap.exists) {
            logger.warn("[ANTIFRAUD] Config not found in Firestore. Using defaults.");
            return DEFAULT_CONFIG;
        }
        return snap.data() as AntifraudConfig;
    } catch (e) {
        logger.error("[ANTIFRAUD] Error reading config. Using defaults.", e);
        return DEFAULT_CONFIG;
    }
}
