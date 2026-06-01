import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { featureFlags, PLAN_B_DRIVER_SUBTYPE } from "./config/features";
import * as logger from "firebase-functions/logger";
import { UserProfile } from "./types";
import { computeDriverRiskProfile } from "./lib/driverRisk";
import { normalizePhone } from "./lib/phone";

const VALID_ROLES = ['admin', 'superadmin', 'admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal', 'traffic_municipal', 'driver', 'passenger'];
const PRIVILEGED_ROLES = ['admin', 'superadmin', 'admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal', 'traffic_municipal'];

const isValidCityKey = (ck: any): boolean => {
    return typeof ck === 'string' && /^[a-z0-9_-]{3,25}$/.test(ck);
};

export const unifiedUserClaimsManagerV1 = onDocumentWritten({ 
    document: "users/{userId}", 
    region: "us-central1" 
}, async (event) => {
    const uid = event.params.userId;
    const uidPart = uid.substring(0, 6);
    const auth = admin.auth();
    const change = event.data;
    if (!change) return;
    if (!change.after.exists) {
        try {
            await auth.setCustomUserClaims(uid, null);
            await auth.revokeRefreshTokens(uid);
        } catch (e: any) {
            logger.error(`[CLAIMS_DELETE_ERR] ${uidPart}`, e);
        }
        return;
    }
    const before = change.before.data() as UserProfile | undefined;
    const after = change.after.data() as UserProfile;
    const role = after.role;
    const cityKey = after.cityKey;
    const isSuspended = after.isSuspended === true || (after as any).disabled === true;
    const claimsVersion = typeof after.claimsVersion === 'number' ? after.claimsVersion : 1;
    const roleWasRemoved = !!before?.role && (!role || !VALID_ROLES.includes(role));
    const roleChanged = before?.role !== role;
    const cityChanged = before?.cityKey !== cityKey;
    const suspensionChanged = before?.isSuspended !== after.isSuspended || (before as any)?.disabled !== (after as any)?.disabled;
    const versionChanged = before?.claimsVersion !== after.claimsVersion;
    let shouldNullify = false;
    let failReason = "";
    if (isSuspended) {
        shouldNullify = true;
        failReason = "USER_SUSPENDED_OR_DISABLED";
    } else if (!VALID_ROLES.includes(role)) {
        shouldNullify = true;
        failReason = "INVALID_ROLE";
    } else if (role.endsWith('_municipal') && !isValidCityKey(cityKey)) {
        // For drivers: only enforce cityKey AFTER onboarding is completed.
        // During initial registration, cityKey can be empty or null.
        shouldNullify = true;
        failReason = "INVALID_CITYKEY_FOR_ROLE";
    } else if (role === 'driver' && (after as any).profileCompleted === true && !isValidCityKey(cityKey)) {
        // Driver has completed onboarding but has an invalid cityKey — this is a real error.
        shouldNullify = true;
        failReason = "INVALID_CITYKEY_FOR_DRIVER_POST_ONBOARDING";
    }
    const beforeAny = before as any;
    const afterAny = after as any;

    const approvedChanged = before?.approved !== after.approved;
    const isTestDriverChanged = (before as any)?.isTestDriver !== (after as any)?.isTestDriver;
    const preferencesChanged = JSON.stringify(before?.driverPreferences) !== JSON.stringify(after.driverPreferences);

    if (!change.before.exists || roleChanged || cityChanged || suspensionChanged || versionChanged || roleWasRemoved || isTestDriverChanged || approvedChanged || preferencesChanged) {
        try {
            if (shouldNullify) {
                await auth.setCustomUserClaims(uid, null);
                await auth.revokeRefreshTokens(uid);
                return;
            }
            const ckValue = (['admin', 'superadmin', 'passenger'].includes(role)) ? null : (cityKey ? cityKey.toLowerCase() : null);
            const claims = { r: role, ck: ckValue, v: claimsVersion };
            await auth.setCustomUserClaims(uid, claims);
            
            // [VamO SECURITY] Only revoke refresh tokens on genuine role changes for EXISTING users.
            const isNewDoc = !change.before.exists;
            if (!isNewDoc && roleChanged) {
                await auth.revokeRefreshTokens(uid);
            }

            // [SIM_GUARD] Sync critical driver metadata to drivers_locations for matching engine
            if (role === 'driver') {
                const driverLocationRef = admin.firestore().doc(`drivers_locations/${uid}`);
                const driverRef = admin.firestore().doc(`drivers/${uid}`);
                
                // [VamO SECURITY] Enforce Express pricing rules during sync
                const isExpress = after.driverSubtype === 'express';
                const finalPreferences = {
                    ...(after.driverPreferences || {
                        acceptsExpress: true,
                        acceptsDiscountedRides: true,
                        acceptsPets: true
                    }),
                    // Express drivers MUST accept discounted rides.
                    acceptsDiscountedRides: isExpress ? true : (after.driverPreferences?.acceptsDiscountedRides ?? true)
                };

                const genderVal = after.gender || (after as any).driverGender || 'not_specified';

                const stationId = after.stationId || null;
                const stationName = after.stationName || null;

                 await driverLocationRef.set({ 
                     isTestDriver: afterAny?.isTestDriver === true,
                     approved: afterAny?.approved === true,
                     municipalStatus: afterAny?.municipalStatus || 'pending_review',
                     driverSubtype: afterAny?.driverSubtype || 'express',
                     driverPreferences: finalPreferences,
                     driverGender: genderVal,
                     stationId,
                     stationName,
                     cityKey: afterAny?.cityKey || null,
                     isSuspended: afterAny?.isSuspended === true,
                     activeRideId: afterAny?.activeRideId || null
                 }, { merge: true });

                // Automatically ensure drivers collection has a valid matching-compliant record
                await driverRef.set({
                    driverId: uid,
                    isSuspended: after.isSuspended === true || (after as any).disabled === true,
                    approved: after.approved === true,
                    driverGender: genderVal,
                    stationId,
                    stationName,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                logger.info(`[SYNC_GUARD] Synced driver data, drivers record and station fields (${stationId}) for ${uidPart} | Gender: ${genderVal}`);
            }
        } catch (error: any) {
            logger.error(`[CLAIMS_SYNC_ERR] ${uidPart}`, error);
        }
    }
});

/**
 * [VamO SECURITY] completeDriverOnboardingV1
 * Securely completes the driver onboarding process.
 * Standard Gen 2 v2 Syntax.
 */
export const completeDriverOnboardingV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const data = request.data;
    const uidPart = uid.substring(0, 6);
    logger.info(`[ONBOARDING_START] ${uidPart}`);

    const requiredFields = ['name', 'phone', 'vehicle', 'plateNumber', 'carModelYear', 'driverSubtype', 'photoURL', 'vehiclePhotoFrontUrl'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new HttpsError('invalid-argument', `Missing required field: ${field}`);
        }
    }

    const docs = data.documents || {};
    // Municipal documents are now optional during onboarding (Fase Simplificada)
    // They will be requested later via VamO Muni if needed.

    const firestore = admin.firestore();
    const userRef = firestore.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        logger.error(`[ONBOARDING_ERROR] User profile not found: ${uidPart}`);
        throw new HttpsError('not-found', 'User profile not found. Please register again.');
    }

    const userData = userSnap.data() as UserProfile;

    if (userData.role !== 'driver') {
        throw new HttpsError('permission-denied', 'Only drivers can complete onboarding.');
    }
    if (userData.profileCompleted === true) {
        throw new HttpsError('already-exists', 'Onboarding has already been completed.');
    }

    const finalCityKey = data.cityKey || userData.cityKey || 'rawson';
    const finalCityName = data.cityKey ? (data.cityKey.charAt(0).toUpperCase() + data.cityKey.slice(1)) : (userData.city || 'Rawson');
    const normalizedPhone = normalizePhone(data.phone);

    const hasMercadoPago = !!userData.mpLinked || !!(userData as any).mp_seller_id || !!(userData as any).mercadopago_seller_id;
    let initialPlanBStatus = 'under_review';
    if (!hasMercadoPago) {
        initialPlanBStatus = 'mp_required';
    } else {
        // En Fase 6 se activarán las ciudades. Por ahora quedan en city_waiting_activation o under_review
        initialPlanBStatus = 'city_waiting_activation';
    }

    const extraData: any = {};
    if (featureFlags.vamoParticularModeEnabled) {
        extraData.driverSubtype = PLAN_B_DRIVER_SUBTYPE; // Forzado en Plan B
    }

    const parseExpiry = (dateStr?: string) => {
        if (!dateStr) return null;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const [year, month, day] = parts;
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        return admin.firestore.Timestamp.fromDate(date);
    };

    const updatePayload: any = {
        name: data.name,
        phone: data.phone,
        phoneNormalized: normalizedPhone,
        dni: data.dni,
        photoURL: data.photoURL,
        vehiclePhotoFrontUrl: data.vehiclePhotoFrontUrl,
        vehicle: data.vehicle,
        vehicleBrand: data.vehicle?.brand || null,
        vehicleModel: data.vehicle?.model || null,
        vehicleColor: data.vehicle?.color || null,
        plateNumber: data.plateNumber,
        carModelYear: data.carModelYear,
        ...extraData,
        commissionRate: 0.18,     // Forzado en Plan B
        commissionPercent: 18,    // Forzado en Plan B
        documents: docs,
        vehicleFrontPhotoURL: data.vehiclePhotoFrontUrl,
        vehicleBackPhotoURL: data.vehiclePhotos?.back || null,
        vehicleInteriorPhotoURL: data.vehiclePhotos?.interior || null,
        vehiclePhotos: data.vehiclePhotos || null,
        cityKey: finalCityKey,
        city: finalCityName,
        municipalStatus: 'pending_municipal_review',
        planBStatus: initialPlanBStatus, // Nuevo estado simplificado
        driverStatus: 'offline',
        profileCompleted: true,
        onboardingCompleted: true,
        onboardingIncomplete: false,
        approved: false, // Nunca habilitar como true desde el frontend
        docsStatus: 'under_review', // Changed from municipal_review to under_review
        documentsManagedByMunicipality: false, // We are doing it ourselves for Plan B initially
        licenseExpiry: parseExpiry(data.licenseExpiryStr),
        insuranceExpiry: parseExpiry(data.insuranceExpiryStr),
        criminalRecordExpiry: parseExpiry(data.criminalRecordExpiryStr),
        termsAccepted: true,
        driverTermsAccepted: true,
        acceptedDriverTerms: true,
        termsVersion: data.termsVersion || 'v1.3',
        termsAcceptedAt: FieldValue.serverTimestamp(),
        legalAccepted: true,
        updatedAt: FieldValue.serverTimestamp(),
        claimsVersion: (userData.claimsVersion || 1) + 1
    };

    try {
        await firestore.runTransaction(async (transaction) => {
            const currentSnap = await transaction.get(userRef);
            if (!currentSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
            const currentData = currentSnap.data() as UserProfile;
            
            if (currentData.profileCompleted === true) {
                throw new HttpsError('already-exists', 'Onboarding has already been completed.');
            }

            // [VamO SECURITY] Uniqueness check INSIDE transaction using phone_index
            if (normalizedPhone) {
                const phoneIndexRef = firestore.collection("phone_index").doc(normalizedPhone);
                const phoneSnap = await transaction.get(phoneIndexRef);

                if (phoneSnap.exists && phoneSnap.data()?.uid !== uid) {
                    logger.error(`[PHONE_SECURITY] Onboarding duplicate phone: ${normalizedPhone} for UID ${uid}. Existing UID: ${phoneSnap.data()?.uid}`);
                    throw new HttpsError("already-exists", "Este número de teléfono ya está registrado con otra cuenta.");
                }

                transaction.set(phoneIndexRef, {
                    uid,
                    emailLower: currentData.emailLower || "",
                    role: "driver",
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            transaction.update(userRef, updatePayload);
        });

        logger.info(`[ONBOARDING_SUCCESS] ${uidPart} | City: ${finalCityKey}`);
        return { success: true, cityKey: finalCityKey };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[ONBOARDING_WRITE_ERR] ${uidPart}`, error);
        throw new HttpsError('internal', 'Failed to update driver profile.');
    }
});

/**
 * [VamO PRO] Wallet Balance Sync Trigger
 * Ensures drivers_locations has the latest balance for matching optimization.
 */
export const syncWalletBalanceToLocationV1 = onDocumentUpdated({
    document: "wallets/{userId}",
    region: "us-central1"
}, async (event) => {
    const db = admin.firestore();
    const userId = event.params.userId;
    const newData = event.data?.after.data();
    const oldData = event.data?.before.data();

    if (newData?.cashBalance === oldData?.cashBalance) return;

    const driverLocationRef = db.doc(`drivers_locations/${userId}`);
    
    // [VamO PRO] Risk Update on Balance Change — ALWAYS update user profile
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return;

    const userData = userSnap.data() as UserProfile;
    const riskProfile = computeDriverRiskProfile(userData, { cashBalance: newData?.cashBalance || 0 });

    const batch = db.batch();
    
    // 1. Sync User Profile (Main source of truth for blocking)
    batch.update(userRef, {
        ...riskProfile,
        currentBalance: newData?.cashBalance || 0,
        updatedAt: FieldValue.serverTimestamp()
    });

    // 2. Sync Location (For matching engine optimization)
    const locSnap = await driverLocationRef.get();
    if (locSnap.exists) {
        batch.update(driverLocationRef, {
            walletBalance: newData?.cashBalance || 0,
            driverRiskLevel: riskProfile.driverRiskLevel,
            driverRiskScore: riskProfile.driverRiskScore,
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    await batch.commit();

    logger.info(`[DRIVER_FINANCIAL_UNLOCK_CHECK]`, {
        driverId: userId,
        previousBalance: oldData?.cashBalance,
        newBalance: newData?.cashBalance,
        wasBlocked: userData.driverRiskLevel === 'blocked',
        newLevel: riskProfile.driverRiskLevel,
        unlocked: userData.driverRiskLevel === 'blocked' && riskProfile.driverRiskLevel !== 'blocked',
        reasons: riskProfile.riskReasons
    });
});

/**
 * [VamO SECURITY] updateDriverStatusV1
 * Securely toggles driver online/offline status.
 * Standard Gen 2 v2 Syntax.
 */
export const updateDriverStatusV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const { status, location } = request.data;
    const uidPart = uid.substring(0, 6);

    if (status !== 'online' && status !== 'offline') {
        throw new HttpsError('invalid-argument', 'Invalid status. Must be online or offline.');
    }

    const firestore = admin.firestore();
    const userRef = firestore.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User profile not found.');
    }

    const userData = userSnap.data() as UserProfile;
    if (userData.role !== 'driver') {
        throw new HttpsError('permission-denied', 'Only drivers can change status.');
    }

    // Security check: cannot go online if not approved or if municipal status is not active.
    // MOD: Allow pending_municipal_review to support simplified onboarding express flow.
    if (status === 'online') {
        const canGoOnline = userData.approved || userData.municipalStatus === 'pending_municipal_review' || userData.municipalStatus === 'active';
        if (!canGoOnline) {
            throw new HttpsError('failed-precondition', 'Tu habilitación municipal está siendo revisada.');
        }
        if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
            throw new HttpsError('failed-precondition', 'Necesitamos tu ubicación activa para ponerte en línea.');
        }
    }

    // Fetch stationId and stationName with fallback checks for old drivers
    let stationId = userData.stationId || null;
    let stationName = userData.stationName || null;

    if (!stationId) {
        const dSnap = await firestore.collection('drivers').doc(uid).get();
        if (dSnap.exists && dSnap.data()?.stationId) {
            stationId = dSnap.data()?.stationId;
            stationName = dSnap.data()?.stationName || "Parada";
        }
    }

    if (!stationId) {
        const mpSnap = await firestore.collection('municipal_profiles').doc(uid).get();
        if (mpSnap.exists && mpSnap.data()?.stationId) {
            stationId = mpSnap.data()?.stationId;
            stationName = mpSnap.data()?.stationName || "Parada";
        }
    }

    const batch = firestore.batch();
    
    const driverLocationRef = firestore.collection('drivers_locations').doc(uid);
    
    // Fetch latest balance for sync
    const walletSnap = await firestore.doc(`wallets/${uid}`).get();
    const currentBalance = walletSnap.exists ? (walletSnap.data()?.cashBalance || 0) : 0;

    // [VamO PRO] Risk Update on Status Change
    const riskProfile = computeDriverRiskProfile(userData, { cashBalance: currentBalance });

    batch.update(userRef, { 
        ...riskProfile,
        driverStatus: status, 
        stationId: stationId || null,
        stationName: stationName || null,
        updatedAt: FieldValue.serverTimestamp() 
    });

    const locationUpdate: any = { 
        driverStatus: status, 
        approved: userData.approved === true,
        municipalStatus: userData.municipalStatus || 'pending_review',
        driverSubtype: userData.driverSubtype || 'express',
        walletBalance: currentBalance,
        driverRiskLevel: riskProfile.driverRiskLevel,
        driverRiskScore: riskProfile.driverRiskScore,
        driverGender: userData.gender || (userData as any).driverGender || 'not_specified',
        stationId: stationId || null,
        stationName: stationName || null,
        cityKey: userData.cityKey || null,
        isSuspended: userData.isSuspended === true,
        activeRideId: userData.activeRideId || null,
        updatedAt: FieldValue.serverTimestamp() 
    };

    if (status === 'online' && location) {
        locationUpdate.currentLocation = location;
        locationUpdate.lastSeenAt = FieldValue.serverTimestamp();
        locationUpdate.isStale = false;
    }

    batch.set(driverLocationRef, locationUpdate, { merge: true });

    try {
        await batch.commit();
        logger.info(`[STATUS_SYNC] ${uidPart} -> ${status}`);
        return { success: true, status };
    } catch (error: any) {
        logger.error(`[STATUS_SYNC_ERR] ${uidPart}`, error);
        throw new HttpsError('internal', 'Error al actualizar el estado en la base de datos.');
    }
});
