import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDb, getAuth } from "./lib/firebaseAdmin";
import { UserProfile } from "./types";
import { enqueueTransactionalEmailV1 } from "./lib/emails";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";

const MAX_RETENTION_EMAILS_PER_RUN = 5;

// Main logic that can be shared between cron and test
export async function runRetentionLogic(options?: { forceTestRun?: boolean }) {
    const db = getDb();
    const now = new Date();
    
    // Limits
    const PASSENGER_INACTIVITY_DAYS = 7;
    const DRIVER_INACTIVITY_DAYS = 5;
    
    // Helpers to generate keys
    const getDedupeKey = (type: string, uid: string) => {
        if (options?.forceTestRun) {
            return `retention_test_${type}_inactive_${uid}_${Date.now()}`;
        }
        // Dedupe depends on day, so we don't send multiple per day
        const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
        return `retention_${type}_inactive_${uid}_${dateStr}`;
    };

    let processedPassengers = 0;
    let processedDrivers = 0;
    let totalProcessed = 0;
    
    const debugInfo = {
        candidatesPassengers: 0,
        candidatesDrivers: 0,
        skippedPassengers: {
            noEmail: 0,
            preferencesDisabled: 0,
            notInactiveEnough: 0,
            alreadyRemindedRecently: 0
        },
        skippedDrivers: {
            noEmail: 0,
            preferencesDisabled: 0,
            notInactiveEnough: 0,
            alreadyRemindedRecently: 0
        }
    };

    try {
        // --- PASSENGERS ---
        const passengersSnap = await db.collection("users")
            .where("role", "==", "passenger")
            .get();

        debugInfo.candidatesPassengers = passengersSnap.size;

        for (const doc of passengersSnap.docs) {
            if (totalProcessed >= MAX_RETENTION_EMAILS_PER_RUN) break;

            const user = doc.data() as UserProfile;
            
            if (!user.email) {
                debugInfo.skippedPassengers.noEmail++;
                continue;
            }
            
            // Respect preferences
            if (user.emailPreferences && user.emailPreferences.marketingEnabled === false) {
                debugInfo.skippedPassengers.preferencesDisabled++;
                continue;
            }

            // Inactivity logic
            const lastActive = user.lastActiveAt ? user.lastActiveAt.toDate() : (user.createdAt?.toDate() || new Date(0));
            const daysInactive = (now.getTime() - lastActive.getTime()) / (1000 * 3600 * 24);
            
            if (daysInactive >= PASSENGER_INACTIVITY_DAYS) {
                // Cooldown: at least 30 days between retention emails
                const lastReminder = user.emailState?.lastInactiveReminderAt?.toDate();
                let daysSinceLastReminder = 999;
                
                if (lastReminder) {
                    daysSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 3600 * 24);
                }

                if (daysSinceLastReminder < 30 && !options?.forceTestRun) {
                    debugInfo.skippedPassengers.alreadyRemindedRecently++;
                } else {
                    const dedupeKey = getDedupeKey("passenger", doc.id);
                    
                    await enqueueTransactionalEmailV1({
                        to: user.email,
                        template: "passenger_inactive_reminder",
                        subject: "Te estamos esperando en VamO",
                        data: {
                            name: user.name,
                            weeklyRides: user.passengerStats?.totalRides || 0
                        },
                        dedupeKey
                    });

                    // Update email state (skip update on forced test to not break real cooldown)
                    if (!options?.forceTestRun) {
                        await doc.ref.set({
                            emailState: {
                                lastInactiveReminderAt: FieldValue.serverTimestamp()
                            }
                        }, { merge: true });
                    }
                    
                    processedPassengers++;
                    totalProcessed++;
                }
            } else {
                debugInfo.skippedPassengers.notInactiveEnough++;
            }
        }

        // --- DRIVERS ---
        const driversSnap = await db.collection("users")
            .where("role", "==", "driver")
            .where("approved", "==", true)
            .get();

        debugInfo.candidatesDrivers = driversSnap.size;

        for (const doc of driversSnap.docs) {
            if (totalProcessed >= MAX_RETENTION_EMAILS_PER_RUN) break;

            const user = doc.data() as UserProfile;
            
            if (!user.email) {
                debugInfo.skippedDrivers.noEmail++;
                continue;
            }

            // Respect preferences
            if (user.emailPreferences && user.emailPreferences.marketingEnabled === false) {
                debugInfo.skippedDrivers.preferencesDisabled++;
                continue;
            }

            // Inactivity logic
            const lastActive = user.lastActiveAt ? user.lastActiveAt.toDate() : (user.createdAt?.toDate() || new Date(0));
            const daysInactive = (now.getTime() - lastActive.getTime()) / (1000 * 3600 * 24);
            
            if (daysInactive >= DRIVER_INACTIVITY_DAYS) {
                // Cooldown: at least 15 days between retention emails for drivers
                const lastReminder = user.emailState?.lastDriverInactiveReminderAt?.toDate();
                let daysSinceLastReminder = 999;
                
                if (lastReminder) {
                    daysSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 3600 * 24);
                }

                if (daysSinceLastReminder < 15 && !options?.forceTestRun) {
                    debugInfo.skippedDrivers.alreadyRemindedRecently++;
                } else {
                    const dedupeKey = getDedupeKey("driver", doc.id);
                    
                    await enqueueTransactionalEmailV1({
                        to: user.email,
                        template: "driver_inactive_reminder",
                        subject: "Conectate y volvé a recibir viajes",
                        data: {
                            name: user.name,
                            weeklyRides: user.stats?.ridesCompleted || 0,
                            weeklyEarnings: user.financialStats?.weeklyEarnings || 0
                        },
                        dedupeKey
                    });

                    // Update email state
                    if (!options?.forceTestRun) {
                        await doc.ref.set({
                            emailState: {
                                lastDriverInactiveReminderAt: FieldValue.serverTimestamp()
                            }
                        }, { merge: true });
                    }
                    
                    processedDrivers++;
                    totalProcessed++;
                }
            } else {
                debugInfo.skippedDrivers.notInactiveEnough++;
            }
        }

        let reason = "success";
        if (totalProcessed === 0) {
            reason = "no eligible users";
        } else if (totalProcessed < MAX_RETENTION_EMAILS_PER_RUN) {
            reason = "ran out of eligible users before hitting limit";
        } else {
            reason = "limit reached";
        }

        logger.info(`[RETENTION] Completed. Passengers: ${processedPassengers}. Drivers: ${processedDrivers}. Total: ${totalProcessed}. Reason: ${reason}`);
        return { processedPassengers, processedDrivers, totalProcessed, reason, debug: debugInfo };
    } catch (error: any) {
        logger.error("[RETENTION] Error running retention job", error);
        return { processedPassengers, processedDrivers, totalProcessed, reason: "error", error: error.message, debug: debugInfo };
    }
}

// Scheduled Cron Job
export const sendRetentionEmailsV1 = onSchedule({
    schedule: "0 10 * * *", // Every day at 10:00 AM
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1"
}, async () => {
    logger.info("[RETENTION] Starting daily retention cron job");
    await runRetentionLogic({ forceTestRun: false });
});

async function assertCanRunEmailTests(request: any) {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email;

    if (!uid) {
        throw new HttpsError("unauthenticated", "Debés iniciar sesión.", { email: null, role: null });
    }

    if (email === "cesareduardobres@gmail.com") return;

    const db = getDb();
    const userSnap = await db.collection("users").doc(uid).get();
    
    // Check role from Firestore doc or Custom Claims
    const role = userSnap.data()?.role || request.auth?.token?.role;

    if (role === "admin" || role === "superadmin" || role === "admin_municipal") return;

    throw new HttpsError("permission-denied", "Permisos insuficientes. Solo administradores.", { email: email || "desconocido", role: role || "desconocido" });
}

// Admin Callable Test
export const testRetentionEmailsV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    await assertCanRunEmailTests(request);

    const { forceTestRun } = request.data || { forceTestRun: true };
    logger.info(`[RETENTION] Manual test triggered by admin ${request.auth?.uid} (forceTestRun: ${forceTestRun})`);
    
    return await runRetentionLogic({ forceTestRun });
});

// NEW: Visual Test Email (Ignores cron rules and queues immediately for design testing)
export const sendVisualTestEmailV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    await assertCanRunEmailTests(request);

    const { template } = request.data;
    if (!template) throw new HttpsError("invalid-argument", "Debes proveer un template");

    const dedupeKey = `visual_test_${template}_${Date.now()}`;
    const testTo = process.env.EMAILS_TEST_TO || "cesareduardobres@gmail.com";
    
    logger.info(`[VISUAL_TEST] Enqueuing direct test email for ${template}`);

    await enqueueTransactionalEmailV1({
        to: testTo,
        template: template,
        subject: `[VamO Visual Test] Template: ${template}`,
        data: {
            name: "Eduardo (Visual Test)",
            cityName: "Rawson",
            weeklyRides: 15,
            weeklyEarnings: 8500,
            walletBalance: 12500,
            documentName: "Licencia de Conducir",
            reason: "La foto está borrosa"
        },
        dedupeKey
    });

    return { success: true, queued: 1, template, dedupeKey };
});
