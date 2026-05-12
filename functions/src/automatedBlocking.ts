import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { getDb } from "./lib/firebaseAdmin";
import { MunicipalProfile, UserProfile, MunicipalExpressStatus } from "./types";

/**
 * [VamO MUNICIPAL] Automated Expiration Blocking
 * Runs every 6 hours to find drivers with expired documentation and suspend them.
 */
export const checkDriverExpirationsV1 = onSchedule({
    schedule: "0 */6 * * *", // Every 6 hours
    region: "us-central1",
    timeZone: "America/Argentina/Buenos_Aires",
    memory: "256MiB",
}, async (event) => {
    const db = getDb();
    const now = Timestamp.now();
    const nowMillis = now.toMillis();

    logger.info("[EXPIRATION_TASK] Starting automated check...");

    try {
        // We only check active drivers or those who were previously approved
        const activeMuniSnaps = await db.collection("municipal_profiles")
            .where("municipalStatus", "in", ["active", "municipal_approved", "renewal_under_review", "municipal_observed"])
            .get();

        if (activeMuniSnaps.empty) {
            logger.info("[EXPIRATION_TASK] No active profiles to check.");
            return;
        }

        logger.info(`[EXPIRATION_TASK] Checking ${activeMuniSnaps.size} profiles.`);

        let blockedCount = 0;

        for (const doc of activeMuniSnaps.docs) {
            const muni = doc.data() as MunicipalProfile;
            const driverId = doc.id;
            
            let blockReason: MunicipalExpressStatus | null = null;
            let auditDetail = "";

            // Check Expirations
            if (muni.licenseExpiry && muni.licenseExpiry.toMillis() < nowMillis) {
                blockReason = "suspended_expired_license";
                auditDetail = "Licencia de conducir vencida";
            } else if (muni.insuranceExpiry && muni.insuranceExpiry.toMillis() < nowMillis) {
                blockReason = "suspended_expired_insurance";
                auditDetail = "Seguro del vehículo vencido";
            } else if (muni.itvExpiry && muni.itvExpiry.toMillis() < nowMillis) {
                blockReason = "suspended_expired_itv";
                auditDetail = "ITV/VTV del vehículo vencido";
            } else if (muni.canonExpiry && muni.canonExpiry.toMillis() < nowMillis) {
                blockReason = "suspended_unpaid_canon";
                auditDetail = "Canon municipal vencido";
            } else if (muni.canonStatus === 'overdue') {
                blockReason = "suspended_unpaid_canon";
                auditDetail = "Canon municipal marcado como impago";
            }

            // Handle Grace Period for observations
            // If it's observed and grace period passed, we block
            if (!blockReason && muni.municipalStatus === 'municipal_observed' && muni.observationGraceUntil) {
                if (muni.observationGraceUntil.toMillis() < nowMillis) {
                    blockReason = "suspended_by_municipality"; // Or a more specific status if available
                    auditDetail = "Plazo de gracia para observaciones municipales vencido";
                }
            }

            if (blockReason) {
                await db.runTransaction(async (tx) => {
                    const muniRef = db.doc(`municipal_profiles/${driverId}`);
                    const userRef = db.doc(`users/${driverId}`);
                    
                    const timestamp = FieldValue.serverTimestamp();

                    tx.update(muniRef, {
                        municipalStatus: blockReason,
                        updatedAt: timestamp,
                        municipalObservation: `Bloqueo automático: ${auditDetail}`
                    });

                    tx.update(userRef, {
                        approved: false,
                        municipalStatus: blockReason,
                        updatedAt: timestamp
                    });

                    // Audit Log
                    tx.set(db.collection('municipal_audit_log').doc(), {
                        driverId,
                        municipalCode: muni.municipalCode,
                        cityKey: muni.cityKey,
                        actionBy: "system_scheduler",
                        action: 'driver_suspended_automatically',
                        newStatus: blockReason,
                        reason: auditDetail,
                        createdAt: timestamp
                    });
                });

                blockedCount++;
                logger.info(`[EXPIRATION_TASK] Suspended driver ${driverId} due to ${auditDetail}`);
            }
        }

        logger.info(`[EXPIRATION_TASK] Completed. Suspended ${blockedCount} drivers.`);
    } catch (error) {
        logger.error("[EXPIRATION_TASK_ERROR]", error);
    }
});
