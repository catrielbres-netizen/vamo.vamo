import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { enqueueTransactionalEmailV1 } from "./lib/emails";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, RegistrationStatus } from "./types";
import { normalizePhone } from "./lib/phone";
import { normalizeCity, canonicalCityKey } from "./lib/city";

/**
 * [VamO SECURITY] completePassengerRegistrationV1
 * Atomic and idempotent passenger registration handler.
 * Replaces direct frontend writes to 'users' and 'wallets'.
 */
export const completePassengerRegistrationV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const startTime = Date.now();
    const auth = request.auth;
    if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const uid = auth.uid;
    const email = auth.token.email || "";
    const { device, referralCode } = request.data || {};
    
    logger.info(`[PASSENGER_AUTH_AUDIT][REGISTER_START] uid=${uid} email=${email}`, { data: request.data });
    
    const db = getDb();
    const userRef = db.collection("users").doc(uid);
    const walletRef = db.collection("wallets").doc(uid);

    logger.info(`[PASSENGER_AUTH_AUDIT][AUTH_VERIFIED] UID: ${uid}`);

    try {
        logger.info(`[PASSENGER_AUTH_AUDIT][TX_START] Starting transaction for uid=${uid}`);
        const result = await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const walletSnap = await transaction.get(walletRef);
            
            let userCreated = false;
            let walletCreated = false;

            // 1. Handle User Document
            if (!userSnap.exists) {
                const newUser: UserProfile = {
                    uid,
                    email,
                    emailLower: email.toLowerCase().trim(),
                    role: "passenger",
                    profileCompleted: false,
                    registrationStatus: "pending_profile",
                    onboardingIncomplete: true,
                    name: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    referredByCode: referralCode || null,
                    emailPreferences: {
                        transactionalEnabled: true,
                        operationalEnabled: true,
                        educationEnabled: true,
                        weeklySummaryEnabled: true,
                        highDemandEnabled: true,
                        marketingEnabled: true
                    },
                    emailState: {
                        sentTemplates: {}
                    }
                };
                transaction.set(userRef, newUser);
                userCreated = true;
                logger.info(`[PASSENGER_AUTH_AUDIT][USER_DOC_CREATED] uid=${uid}`);
            } else {
                logger.info(`[PASSENGER_AUTH_AUDIT][USER_DOC_EXISTS] uid=${uid}`);
            }

            // 2. Handle Wallet Document
            if (!walletSnap.exists) {
                transaction.set(walletRef, {
                    userId: uid,
                    balance: 0,
                    currentBalance: 0,
                    currency: "ARS",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                walletCreated = true;
                logger.info(`[PASSENGER_AUTH_AUDIT][WALLET_DOC_CREATED] uid=${uid}`);
            } else {
                logger.info(`[PASSENGER_AUTH_AUDIT][WALLET_DOC_EXISTS] uid=${uid}`);
            }

            return { userCreated, walletCreated };
        });

        const latency = Date.now() - startTime;
        logger.info(`[PASSENGER_AUTH_AUDIT][REGISTER_SUCCESS] uid=${uid} latency=${latency}ms`, { ...result });

        return { success: true, ...result };

    } catch (error: any) {
        logger.error(`[PASSENGER_AUTH_AUDIT][REGISTER_ERROR] uid=${uid}`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw new HttpsError("internal", `Error en la registración: ${error.message || 'unknown'}`);
    }
});

/**
 * [VamO SECURITY] repairUserProfileV1
 * Self-healing callable to restore missing Firestore/Wallet documents for existing Auth users.
 */
export const repairUserProfileV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const startTime = Date.now();
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");

    const uid = auth.uid;
    const email = auth.token.email || "";
    
    logger.info(`[REPAIR_FUNCTION_START] uid=${uid} email=${email}`);

    const db = getDb();
    const userRef = db.collection("users").doc(uid);
    const walletRef = db.collection("wallets").doc(uid);

    try {
        logger.info(`[REPAIR_TRANSACTION_START] Starting repair transaction for uid=${uid}`);
        await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const walletSnap = await transaction.get(walletRef);

            if (!userSnap.exists) {
                transaction.set(userRef, {
                    uid,
                    email,
                    emailLower: email.toLowerCase().trim(),
                    role: "passenger",
                    profileCompleted: false,
                    registrationStatus: "pending_profile",
                    onboardingIncomplete: true,
                    name: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                logger.info(`[REPAIR_USER_CREATED] uid=${uid}`);
            }

            if (!walletSnap.exists) {
                transaction.set(walletRef, {
                    userId: uid,
                    balance: 0,
                    currentBalance: 0,
                    currency: "ARS",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                logger.info(`[REPAIR_WALLET_CREATED] uid=${uid}`);
            }
        });

        const latency = Date.now() - startTime;
        logger.info(`[REPAIR_FUNCTION_SUCCESS] uid=${uid} latency=${latency}ms`);
        return { success: true };

    } catch (error: any) {
        logger.error(`[REPAIR_FUNCTION_ERROR] uid=${uid}`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw new HttpsError("internal", `Error reparando el perfil: ${error.message}`);
    }
});

/**
 * [VamO SECURITY] completeDriverRegistrationV1
 * Atomic and idempotent driver registration handler.
 */
export const completeDriverRegistrationV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    const startTime = Date.now();
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");

    const uid = auth.uid;
    const email = auth.token.email || "";
    const { phone, cityKey, city, name } = request.data || {};
    const safeCityKey = canonicalCityKey(cityKey);
    
    logger.info(`[DRIVER_REGISTER_FUNCTION_START] uid=${uid} email=${email}`, { data: request.data });

    const db = getDb();
    const normalizedPhone = normalizePhone(phone);
    
    // [VamO SECURITY] Uniqueness check BEFORE transaction to avoid contention if possible, 
    // but within transaction is safer for race conditions. 
    // We'll do it inside the transaction below.

    const userRef = db.collection("users").doc(uid);
    const walletRef = db.collection("wallets").doc(uid);

    try {
        logger.info(`[DRIVER_REGISTER_TRANSACTION_START] Starting transaction for uid=${uid}`);
        const result = await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const walletSnap = await transaction.get(walletRef);
            
            let userCreated = false;
            let walletCreated = false;

            if (!userSnap.exists) {
                // [VamO SECURITY] Uniqueness check using phone_index collection
                if (normalizedPhone) {
                    const phoneIndexRef = db.collection("phone_index").doc(normalizedPhone);
                    const phoneSnap = await transaction.get(phoneIndexRef);
                    
                    if (phoneSnap.exists && phoneSnap.data()?.uid !== uid) {
                        logger.error(`[PHONE_SECURITY] Duplicate phone detected in phone_index: ${normalizedPhone} for UID ${uid}. Existing UID: ${phoneSnap.data()?.uid}`);
                        throw new HttpsError("already-exists", "Este número de teléfono ya está registrado con otra cuenta.");
                    }

                    // Reservar el teléfono en el índice
                    transaction.set(phoneIndexRef, {
                        uid,
                        emailLower: email.toLowerCase().trim(),
                        role: "incomplete_driver",
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                const newUser = {
                    uid,
                    email,
                    emailLower: email.toLowerCase().trim(),
                    role: "incomplete_driver",
                    phone: phone || "",
                    phoneNormalized: normalizedPhone || null,
                    cityKey: safeCityKey || userSnap.data()?.cityKey || "",
                    city: city || userSnap.data()?.city || "",
                    profileCompleted: false,
                    registrationStatus: "pending_profile",
                    onboardingIncomplete: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    emailPreferences: {
                        transactionalEnabled: true,
                        operationalEnabled: true,
                        educationEnabled: true,
                        weeklySummaryEnabled: true,
                        highDemandEnabled: true,
                        marketingEnabled: true
                    },
                    emailState: {
                        sentTemplates: {}
                    }
                };
                transaction.set(userRef, newUser);
                userCreated = true;
                logger.info(`[DRIVER_REGISTER_USER_CREATED] uid=${uid}`);
            } else {
                logger.info(`[DRIVER_REGISTER_USER_EXISTS] uid=${uid}`);
            }

            if (!walletSnap.exists) {
                transaction.set(walletRef, {
                    userId: uid,
                    balance: 0,
                    currentBalance: 0,
                    currency: "ARS",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                walletCreated = true;
                logger.info(`[DRIVER_REGISTER_WALLET_CREATED] uid=${uid}`);
            } else {
                logger.info(`[DRIVER_REGISTER_WALLET_EXISTS] uid=${uid}`);
            }

            return { userCreated, walletCreated };
        });

        const latency = Date.now() - startTime;
        logger.info(`[DRIVER_REGISTER_FUNCTION_SUCCESS] uid=${uid} latency=${latency}ms`);

        // Enviar email transaccional si se creó el usuario
        if (result.userCreated) {
            await enqueueTransactionalEmailV1({
                to: email,
                template: 'driver_registration_created',
                subject: 'Tu registro en VamO fue creado',
                data: {
                    name: name || "",
                    cityName: safeCityKey ? safeCityKey.charAt(0).toUpperCase() + safeCityKey.slice(1) : "Tu ciudad"
                },
                dedupeKey: `driver_registration_created_${uid}`
            });
            // Email secundario (si el template fuera separado, pero decidimos unificarlo, aunque la regla dice que si es separado, usar otro). El usuario dijo "puede ir combinado". Lo voy a mandar como un correo separado también para cumplir con ambas dedupeKeys y ver que llega.
            await enqueueTransactionalEmailV1({
                to: email,
                template: 'driver_pending_documents',
                subject: 'Acción requerida: completá tu habilitación',
                data: { name: name || "" },
                dedupeKey: `driver_pending_documents_${uid}`
            });
        }

        return { success: true, ...result };

    } catch (error: any) {
        logger.error(`[DRIVER_REGISTER_FUNCTION_ERROR] uid=${uid}`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw new HttpsError("internal", `Error en la registración del conductor: ${error.message}`);
    }
});
