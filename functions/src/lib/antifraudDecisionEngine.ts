import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./firebaseAdmin";
import { logLedgerEvent } from "./audit";

export type FraudAction = 'none' | 'flag' | 'warn_driver' | 'require_review' | 'soft_block' | 'hard_block';

interface DecisionResult {
    action: FraudAction;
    reason: string;
    skipped?: boolean;
    skipReason?: string;
}

/**
 * [VamO PRO] Simulation Guard
 * Returns true if this alert belongs to a simulation or test entity
 * and should be excluded from the Decision Engine.
 */
function isSimulationAlert(alertData: any): { excluded: boolean; reason: string } {
    const { passengerId, driverId, isSimulation, isTestDriver, isTestPassenger } = alertData;

    // Rule 1: Ride flagged as simulation
    if (isSimulation === true) {
        return { excluded: true, reason: "ride.isSimulation=true" };
    }

    // Rule 2: Driver is a test driver
    if (isTestDriver === true) {
        return { excluded: true, reason: "driver.isTestDriver=true" };
    }

    // Rule 3: Passenger is a test passenger or has test_ prefix
    if (isTestPassenger === true) {
        return { excluded: true, reason: "passenger.isTestPassenger=true" };
    }
    if (typeof passengerId === 'string' && passengerId.startsWith('test_')) {
        return { excluded: true, reason: `passengerId starts with 'test_' (${passengerId})` };
    }

    // Rule 4: Driver ID starts with test_ (defensive)
    if (typeof driverId === 'string' && driverId.startsWith('test_')) {
        return { excluded: true, reason: `driverId starts with 'test_' (${driverId})` };
    }

    return { excluded: false, reason: "" };
}

/**
 * [VamO PRO] Antifraud Decision Engine
 * Analyzes alerts and history to determine automatic or manual actions.
 * Simulation and test entities are ALWAYS excluded from decisions.
 */
export async function processFraudAlertDecision(alertId: string, alertData: any): Promise<DecisionResult> {
    const db = getDb();
    const { type, score, passengerId, driverId, rideId, cityKey } = alertData;

    // ── SIMULATION GUARD ────────────────────────────────────────────────────
    const guard = isSimulationAlert(alertData);
    if (guard.excluded) {
        logger.info(`[FRAUD_DECISION] SKIPPED (simulation/test) | alertId: ${alertId} | reason: ${guard.reason}`);
        return { action: 'none', reason: '', skipped: true, skipReason: guard.reason };
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
        // 1. Fetch History (Last 24 hours of alerts for both entities)
        const dayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
        
        let pAlertsCount = 0;
        let dAlertsCount = 0;

        try {
            const [pAlertsSnap, dAlertsSnap] = await Promise.all([
                db.collection('fraud_alerts')
                    .where('passengerId', '==', passengerId)
                    .where('createdAt', '>', dayAgo)
                    .get(),
                db.collection('fraud_alerts')
                    .where('driverId', '==', driverId)
                    .where('createdAt', '>', dayAgo)
                    .get()
            ]);
            pAlertsCount = pAlertsSnap.size;
            dAlertsCount = dAlertsSnap.size;
        } catch (indexErr: any) {
            // Index still building — fall back to 1 so first-event rules apply
            logger.warn(`[DECISION_ENGINE] Index not ready, using fallback count. ${indexErr?.message?.slice(0, 80)}`);
            pAlertsCount = 1;
            dAlertsCount = 1;
        }

        let action: FraudAction = 'none';
        let reason = "";

        // 2. Apply Rules
        switch (type) {
            case 'ghost_ride':
                if (score >= 80) {
                    action = 'require_review';
                    reason = "High score ghost ride detected.";
                } else if (dAlertsCount >= 3) {
                    action = 'hard_block';
                    reason = "Multiple ghost rides detected in 24h.";
                } else if (dAlertsCount >= 2) {
                    action = 'soft_block';
                    reason = "Repeated ghost rides (2) in 24h.";
                } else {
                    action = 'flag';
                    reason = "Potential ghost ride.";
                }
                break;

            case 'gps_missing':
                if (dAlertsCount >= 5) {
                    action = 'require_review';
                    reason = "Chronic missing GPS (5+ events).";
                } else if (dAlertsCount >= 3) {
                    action = 'flag';
                    reason = "Frequent missing GPS (3+ events).";
                }
                break;

            case 'impossible_speed':
                if (dAlertsCount >= 3) {
                    action = 'require_review';
                    reason = "Repeated impossible speeds.";
                } else if (dAlertsCount >= 2) {
                    action = 'flag';
                    reason = "Multiple speed anomalies.";
                }
                break;

            case 'suspicious_short_trip':
            case 'route_anomaly':
                if (dAlertsCount >= 3) {
                    action = 'require_review';
                    reason = "Repeated route anomalies.";
                } else {
                    action = 'flag';
                    reason = "Suspicious route pattern.";
                }
                break;

            default:
                action = 'none';
        }

        // 3. Store Decision (ONLY for real users, never for simulations)
        if (action !== 'none') {
            const actionId = `act_${Date.now()}_${alertId}`;
            const actionRecord = {
                id: actionId,
                userId: driverId,
                passengerId,
                rideId,
                action,
                reason,
                alertId,
                alertType: type,
                createdAt: FieldValue.serverTimestamp(),
                status: 'monitor' // Phase 2E is monitor only — no real blocks yet
            };

            await db.collection('fraud_actions').doc(actionId).set(actionRecord);

            // 4. Log to Ledger
            const eventType = action === 'flag' ? 'fraud_user_flagged' : 
                            action === 'require_review' ? 'fraud_user_review_required' : 
                            'fraud_action_generated';

            await logLedgerEvent({
                eventType: eventType as any,
                actorId: 'system_engine',
                actorRole: 'admin',
                rideId,
                cityKey,
                metadata: { action, reason, alertType: type }
            });

            logger.info(`[FRAUD_DECISION] Alert: ${type} | Score: ${score} | Action: ${action} | Reason: ${reason}`);
        }

        return { action, reason };

    } catch (error) {
        logger.error(`[DECISION_ENGINE_ERROR] Alert ${alertId}:`, error);
        return { action: 'none', reason: "Error in decision engine" };
    }
}
