import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile } from "./types";
import { sendNotification } from "./handlers";

/**
 * [VamO MUNICIPAL / PLAN B] Automated Expiration Blocking & Notification
 * Runs every 6 hours to find drivers with expiring or expired documentation.
 * Sends notifications at 7 days, 2 days, and 0 days.
 * Suspends if License or Insurance expires. Warns if Criminal Record expires.
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
    const msInDay = 24 * 60 * 60 * 1000;

    logger.info("[EXPIRATION_TASK] Starting automated check...");

    try {
        const activeDriversSnap = await db.collection("users")
            .where("role", "==", "driver")
            .where("approved", "==", true)
            .get();

        if (activeDriversSnap.empty) {
            logger.info("[EXPIRATION_TASK] No active drivers to check.");
            return;
        }

        logger.info(`[EXPIRATION_TASK] Checking ${activeDriversSnap.size} active drivers.`);

        for (const doc of activeDriversSnap.docs) {
            const user = doc.data() as UserProfile;
            const driverId = doc.id;
            
            let blockReason: string | null = null;
            let auditDetail = "";

            const checkExpiry = async (
                expiryObj: any, 
                type: 'license' | 'insurance' | 'criminalRecord'
            ) => {
                if (!expiryObj || !expiryObj.toMillis) return;
                
                const expiryMillis = expiryObj.toMillis();
                const diffMillis = expiryMillis - nowMillis;
                const daysRemaining = Math.ceil(diffMillis / msInDay);

                const messages = {
                    license: "Tu licencia de conducir vence pronto. Actualizala para seguir recibiendo viajes en VamO.",
                    insurance: "Tu seguro vence pronto. Actualizalo para seguir recibiendo viajes en VamO.",
                    criminalRecord: "Tus antecedentes penales están por vencer. Te recomendamos actualizarlos para mantener tu perfil completo."
                };

                const titles = {
                    license: "Licencia por vencer",
                    insurance: "Seguro por vencer",
                    criminalRecord: "Antecedentes por vencer"
                };

                // Notification windows (only send if not already expired to avoid spamming everyday)
                if (daysRemaining === 7 || daysRemaining === 2 || daysRemaining === 0) {
                    await sendNotification(driverId, titles[type], messages[type], '/driver/profile');
                    logger.info(`[EXPIRATION_TASK] Sent ${daysRemaining}d notification for ${type} to ${driverId}`);
                }

                // Blocking logic
                if (daysRemaining < 0) {
                    if (type === 'license') {
                        blockReason = "blocked_docs_expired";
                        auditDetail = "Licencia de conducir vencida";
                    } else if (type === 'insurance') {
                        blockReason = "blocked_docs_expired";
                        auditDetail = "Seguro del vehículo vencido";
                    } else if (type === 'criminalRecord') {
                        // Just flag, don't block
                        logger.info(`[EXPIRATION_TASK] Driver ${driverId} has expired criminal records. (Non-blocking)`);
                        await db.doc(`users/${driverId}`).update({
                            criminalRecordStatus: 'expired_non_blocking',
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                }
            };

            await checkExpiry(user.licenseExpiry, 'license');
            if (!blockReason) await checkExpiry(user.insuranceExpiry, 'insurance');
            await checkExpiry(user.criminalRecordExpiry, 'criminalRecord');

            if (blockReason) {
                await db.runTransaction(async (tx) => {
                    const userRef = db.doc(`users/${driverId}`);
                    const locRef = db.doc(`drivers_locations/${driverId}`);
                    const timestamp = FieldValue.serverTimestamp();

                    tx.update(userRef, {
                        approved: false,
                        driverStatus: 'offline',
                        docsStatus: blockReason,
                        updatedAt: timestamp
                    });
                    
                    tx.update(locRef, {
                        approved: false,
                        driverStatus: 'offline',
                        updatedAt: timestamp
                    });

                    // Audit Log
                    tx.set(db.collection('municipal_audit_log').doc(), {
                        driverId,
                        actionBy: "system_scheduler",
                        action: 'driver_suspended_automatically',
                        newStatus: blockReason,
                        reason: auditDetail,
                        createdAt: timestamp
                    });
                });

                logger.info(`[EXPIRATION_TASK] Suspended driver ${driverId} due to ${auditDetail}`);
            }
        }

        logger.info(`[EXPIRATION_TASK] Completed.`);
    } catch (error) {
        logger.error("[EXPIRATION_TASK_ERROR]", error);
    }
});
