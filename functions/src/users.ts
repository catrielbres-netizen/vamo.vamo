import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { featureFlags, PLAN_B_DRIVER_SUBTYPE } from "./config/features";
import * as logger from "firebase-functions/logger";
import { UserProfile } from "./types";
import { computeDriverRiskProfile } from "./lib/driverRisk";
import { normalizePhone } from "./lib/phone";
import { canonicalCityKey } from "./lib/city";
import { enqueueTransactionalEmailV1 } from "./lib/emails";

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

    const requiredFields = ['name', 'phone', 'vehicle', 'plateNumber', 'carModelYear', 'driverSubtype'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new HttpsError('invalid-argument', `Missing required field: ${field}`);
        }
    }

    const docs = data.documents || {};
    // Documents are completely optional during onboarding.

    const firestore = admin.firestore();
    const userRef = firestore.collection('users').doc(uid);
    const userSnap = await userRef.get();

    let userData: Partial<UserProfile> = {};
    if (userSnap.exists) {
        userData = userSnap.data() as UserProfile;
        
        if (userData.profileCompleted === true) {
            throw new HttpsError('already-exists', 'Onboarding has already been completed.');
        }

        const sensibleRoles = ['admin', 'admin_municipal', 'traffic_municipal', 'passenger'];
        if (userData.role && sensibleRoles.includes(userData.role)) {
            logger.error(`[ONBOARDING_ERROR] UID ${uidPart} exists with sensitive role ${userData.role}`);
            throw new HttpsError('permission-denied', 'No pudimos completar el registro de conductor para esta cuenta. Contactá a soporte.');
        }
        if (userData.role && userData.role !== 'driver') {
            throw new HttpsError('permission-denied', 'No pudimos completar el registro de conductor para esta cuenta. Contactá a soporte.');
        }
    }

    const finalCityKey = canonicalCityKey(data.cityKey) || null;
    const finalCityName = data.cityLabel || (finalCityKey ? (finalCityKey.charAt(0).toUpperCase() + finalCityKey.slice(1)) : null);
    const normalizedPhone = normalizePhone(data.phone);

    const hasMercadoPago = !!userData.mpLinked || !!(userData as any).mp_seller_id || !!(userData as any).mercadopago_seller_id;
    let initialPlanBStatus = 'under_review';
    if (!hasMercadoPago) {
        initialPlanBStatus = 'mp_required';
    } else {
        initialPlanBStatus = 'city_waiting_activation';
    }

    if (data.driverSubtype === 'fleet_driver') {
        logger.error(`[ONBOARDING_ERROR] User ${uidPart} attempted to register as fleet_driver publicly`);
        throw new HttpsError('permission-denied', 'fleet_driver solo se crea por createFleetDriverV1 por el titular del vehículo.');
    }

    const extraData: any = {
        driverSubtype: data.driverSubtype,
    };

    const parseExpiry = (dateStr?: string) => {
        if (!dateStr) return null;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const [year, month, day] = parts;
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        return admin.firestore.Timestamp.fromDate(date);
    };

    const updatePayload: any = {
        role: 'driver',
        uid: uid,
        email: request.auth.token.email || null,
        emailLower: request.auth.token.email?.toLowerCase() || null,
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
        commissionRate: 0.18,
        commissionPercent: 18,
        documents: docs,
        vehicleFrontPhotoURL: data.vehiclePhotoFrontUrl,
        vehicleBackPhotoURL: data.vehiclePhotos?.back || null,
        vehicleInteriorPhotoURL: data.vehiclePhotos?.interior || null,
        vehiclePhotos: data.vehiclePhotos || null,
        registrationCityKey: canonicalCityKey(data.registrationCityKey) || null,
        cityKey: finalCityKey,
        operatingAreaId: finalCityKey,
        city: finalCityName,
        municipalStatus: 'pending_documents',
        planBStatus: initialPlanBStatus,
        driverStatus: 'offline',
        profileCompleted: true,
        onboardingCompleted: true,
        onboardingIncomplete: false,
        registrationStatus: 'active',
        active: true,
        registrationLocation: data.registrationLocation || null,
        cityResolutionStatus: data.cityResolutionStatus || 'resolved',
        cityResolutionSource: data.cityResolutionSource || 'legacy_query_param',

        isDriver: true,
        approved: false, // Nunca habilitar como true desde el frontend
        docsStatus: 'pending_upload', 
        documentsStatus: 'pending_upload',
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

    const normalizedDni = String(data.dni).replace(/\D/g, '');

    // [VamO BUGFIX] Remove undefined and NaN values from payload deeply to prevent Firestore crash
    const sanitizePayload = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(key => {
            if (obj[key] === undefined || Number.isNaN(obj[key])) {
                delete obj[key];
            } else if (obj[key] !== null && typeof obj[key] === 'object' && !(obj[key] instanceof admin.firestore.Timestamp) && !(obj[key] instanceof admin.firestore.FieldValue)) {
                sanitizePayload(obj[key]);
            }
        });
    };
    sanitizePayload(updatePayload);

    try {
        const currentData = await firestore.runTransaction(async (transaction) => {
            // --- 1. ALL READS FIRST ---
            const currentSnap = await transaction.get(userRef);
            
            const phoneIndexRef = normalizedPhone ? firestore.collection("phone_index").doc(normalizedPhone) : null;
            const phoneSnap = phoneIndexRef ? await transaction.get(phoneIndexRef) : null;
            
            const dniIndexRef = normalizedDni ? firestore.collection("dni_index").doc(normalizedDni) : null;
            const dniSnap = dniIndexRef ? await transaction.get(dniIndexRef) : null;

            // --- 2. VALIDATION ---
            const currentData = currentSnap.exists ? currentSnap.data() as UserProfile : {} as Partial<UserProfile>;
            
            if (currentSnap.exists && currentData.profileCompleted === true) {
                throw new HttpsError('already-exists', 'Onboarding has already been completed.');
            }

            if (phoneSnap && phoneSnap.exists && phoneSnap.data()?.uid !== uid) {
                logger.error(`[PHONE_SECURITY] Onboarding duplicate phone: ${normalizedPhone} for UID ${uid}. Existing UID: ${phoneSnap.data()?.uid}`);
                throw new HttpsError("already-exists", "Este número de teléfono ya está registrado en VamO.");
            }

            if (dniSnap && dniSnap.exists && dniSnap.data()?.uid !== uid) {
                logger.error(`[DNI_SECURITY] Onboarding duplicate DNI: ${normalizedDni} for UID ${uid}. Existing UID: ${dniSnap.data()?.uid}`);
                throw new HttpsError("already-exists", "Este DNI ya está registrado en VamO.");
            }

            // --- 3. ALL WRITES LAST ---
            const currentEmail = currentData.emailLower || currentData.email || request.auth?.token?.email || "";

            if (phoneIndexRef) {
                transaction.set(phoneIndexRef, {
                    uid,
                    email: currentEmail,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: "completeDriverOnboardingV1"
                }, { merge: true });
            }

            if (dniIndexRef) {
                transaction.set(dniIndexRef, {
                    uid,
                    email: currentEmail,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: "completeDriverOnboardingV1"
                }, { merge: true });
            }

            if (!currentSnap.exists) {
                transaction.set(userRef, {
                    ...updatePayload,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
                });
            } else {
                transaction.update(userRef, updatePayload);
            }
            return currentData;
        });

        const currentEmail = currentData.emailLower || currentData.email || request.auth?.token?.email || "";
        const currentName = currentData.name || data.name || "Conductor";

        if (currentEmail) {
            await enqueueTransactionalEmailV1({
                to: currentEmail,
                template: 'driver_registration_created',
                subject: 'Tu registro en VamO fue creado',
                data: {
                    name: currentName,
                    cityName: finalCityName || ""
                },
                dedupeKey: `driver_registration_created_${uid}`
            });

            await enqueueTransactionalEmailV1({
                to: currentEmail,
                template: 'driver_pending_documents',
                subject: 'Acción requerida: completá tu habilitación',
                data: { name: currentName },
                dedupeKey: `driver_pending_documents_${uid}`
            });
        }

        logger.info(`[ONBOARDING_SUCCESS] ${uidPart} | City: ${finalCityKey}`);
        return { success: true, cityKey: finalCityKey };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        logger.error(`[ONBOARDING_WRITE_ERR] ${uidPart}`, error);
        throw new HttpsError('internal', `Failed to update driver profile: ${error.message}`);
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
        const currentDriverTermsVersion = "2026-06-rio-gallegos-v1";
        const userLegal = userData.legal || {};
        if (!userLegal.driverTermsAccepted || userLegal.driverTermsVersion !== currentDriverTermsVersion) {
            throw new HttpsError('permission-denied', 'Debés aceptar el contrato de conductor antes de poder operar en VamO.');
        }

        const canGoOnline = userData.approved || userData.municipalStatus === 'pending_municipal_review' || userData.municipalStatus === 'active';
        if (!canGoOnline) {
            throw new HttpsError('failed-precondition', 'Tu habilitación municipal está siendo revisada.');
        }

        // [VamO PRO] Fleet Driver Check - STRICT ONLINE RULES
        if (userData.driverSubtype === 'fleet_driver') {
            const uDataAny = userData as any;
            if (userData.fleetApprovalStatus !== 'approved' && !uDataAny.approvedByFleetOwner) {
                throw new HttpsError('failed-precondition', 'El dueño todavía no habilitó este chofer.');
            }
            if (userData.municipalStatus !== 'active' && uDataAny.municipalApprovalStatus !== 'approved') {
                throw new HttpsError('failed-precondition', 'Falta aprobación municipal.');
            }
            if (!uDataAny.profileImageUrl && !userData.photoURL) {
                throw new HttpsError('failed-precondition', 'Falta cargar foto de perfil.');
            }
            if (!uDataAny.dniUrl) {
                throw new HttpsError('failed-precondition', 'Falta DNI del chofer.');
            }
            if (!uDataAny.licenseUrl) {
                throw new HttpsError('failed-precondition', 'Falta licencia de conducir.');
            }
            if (!userData.vehicleOwnerId || (!uDataAny.vehicleId && !userData.vehicle)) {
                throw new HttpsError('failed-precondition', 'No hay vehículo asignado.');
            }
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
    const vehicleShiftLogsRef = firestore.collection('vehicle_shift_logs');
    
    // Fetch latest balance for sync
    const walletSnap = await firestore.doc(`wallets/${uid}`).get();
    const currentBalance = walletSnap.exists ? (walletSnap.data()?.cashBalance || 0) : 0;

    // [VamO PRO] Single Fleet Driver Per Vehicle Shift Logic
    const uDataAny = userData as any;
    if (status === 'online' && userData.driverSubtype === 'fleet_driver' && uDataAny.vehicleId) {
        const ownerId = userData.vehicleOwnerId || uDataAny.settlementOwnerId;
        
        if (ownerId) {
            // Find other online drivers with the same vehicle
            const activeDriversSnap = await firestore.collection('users')
                .where('vehicleId', '==', uDataAny.vehicleId)
                .where('vehicleOwnerId', '==', ownerId)
                .where('driverStatus', '==', 'online')
                .get();

            activeDriversSnap.forEach(doc => {
                if (doc.id !== uid) {
                    // Force offline other driver
                    batch.update(doc.ref, {
                        driverStatus: 'offline',
                        lastOfflineAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    
                    // Update location status for other driver
                    batch.update(firestore.collection('drivers_locations').doc(doc.id), {
                        driverStatus: 'offline',
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    
                    // Log the forced offline shift change
                    batch.set(vehicleShiftLogsRef.doc(), {
                        eventType: 'shift_change_auto_offline',
                        driverId: doc.id,
                        vehicleId: uDataAny.vehicleId,
                        vehicleOwnerId: ownerId,
                        settlementOwnerId: uDataAny.settlementOwnerId || ownerId,
                        cityKey: userData.cityKey || 'rawson',
                        triggeredByDriverId: uid,
                        timestamp: FieldValue.serverTimestamp(),
                        source: 'updateDriverStatusV1'
                    });
                }
            });

            // Log the new driver going online
            batch.set(vehicleShiftLogsRef.doc(), {
                eventType: 'online',
                driverId: uid,
                vehicleId: uDataAny.vehicleId,
                vehicleOwnerId: ownerId,
                settlementOwnerId: uDataAny.settlementOwnerId || ownerId,
                cityKey: userData.cityKey || 'rawson',
                triggeredByDriverId: uid,
                previousDriverId: activeDriversSnap.empty ? null : activeDriversSnap.docs.find(d => d.id !== uid)?.id || null,
                timestamp: FieldValue.serverTimestamp(),
                source: 'updateDriverStatusV1'
            });
        }
    } else if (status === 'offline' && userData.driverSubtype === 'fleet_driver' && uDataAny.vehicleId) {
        // Log manual offline
        const ownerId = userData.vehicleOwnerId || uDataAny.settlementOwnerId;
        if (ownerId) {
            batch.set(vehicleShiftLogsRef.doc(), {
                eventType: 'offline',
                driverId: uid,
                vehicleId: uDataAny.vehicleId,
                vehicleOwnerId: ownerId,
                settlementOwnerId: uDataAny.settlementOwnerId || ownerId,
                cityKey: userData.cityKey || 'rawson',
                triggeredByDriverId: uid,
                timestamp: FieldValue.serverTimestamp(),
                source: 'updateDriverStatusV1'
            });
        }
    }

    // [VamO PRO] Risk Update on Status Change
    const riskProfile = computeDriverRiskProfile(userData, { cashBalance: currentBalance });

    const userUpdate: any = {
        ...riskProfile,
        driverStatus: status, 
        stationId: stationId || null,
        stationName: stationName || null,
        updatedAt: FieldValue.serverTimestamp() 
    };

    if (status === 'online') {
        userUpdate.lastOnlineAt = FieldValue.serverTimestamp();
        if (uDataAny.vehicleId) userUpdate.currentVehicleId = uDataAny.vehicleId;
        if (userData.vehicleOwnerId) userUpdate.currentVehicleOwnerId = userData.vehicleOwnerId;
    } else {
        userUpdate.lastOfflineAt = FieldValue.serverTimestamp();
    }

    batch.update(userRef, userUpdate);

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

/**
 * [VamO PRO] manageFleetDriverV1
 * Allows a vehicleOwner to approve, suspend, or unlink a fleet driver.
 */
export const manageFleetDriverV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated.');
    
    const ownerId = request.auth.uid;
    const { driverId, action } = request.data; // action: 'approve', 'suspend', 'unlink'

    if (!driverId || !action) {
        throw new HttpsError('invalid-argument', 'Missing driverId or action.');
    }

    const validActions = ['approve', 'suspend', 'unlink'];
    if (!validActions.includes(action)) {
        throw new HttpsError('invalid-argument', 'Invalid action.');
    }

    const firestore = admin.firestore();
    const driverRef = firestore.collection('users').doc(driverId);
    
    const result = await firestore.runTransaction(async (tx) => {
        const driverSnap = await tx.get(driverRef);
        if (!driverSnap.exists) throw new HttpsError('not-found', 'Driver profile not found.');

        const driverData = driverSnap.data() as UserProfile;
        
        if (driverData.vehicleOwnerId !== ownerId) {
            throw new HttpsError('permission-denied', 'No tenés permisos sobre este conductor.');
        }

        if (driverData.driverSubtype !== 'fleet_driver') {
            throw new HttpsError('failed-precondition', 'El usuario no es un chofer de flota.');
        }

        const updateData: any = { updatedAt: FieldValue.serverTimestamp() };

        if (action === 'approve') {
            updateData.fleetApprovalStatus = 'approved';
        } else if (action === 'suspend') {
            updateData.fleetApprovalStatus = 'suspended';
            updateData.driverStatus = 'offline'; // Force offline
        } else if (action === 'unlink') {
            updateData.fleetApprovalStatus = 'unlinked';
            updateData.vehicleOwnerId = null;
            updateData.driverStatus = 'offline';
        }

        tx.update(driverRef, updateData);

        // Also force driver location offline if suspended or unlinked
        if (action === 'suspend' || action === 'unlink') {
            const locRef = firestore.collection('drivers_locations').doc(driverId);
            // using update because driver_locations might not exist, but we assume it does if they are a driver
            tx.set(locRef, { driverStatus: 'offline', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }

        return { success: true, action, newStatus: updateData.fleetApprovalStatus || 'unlinked' };
    });

    return result;
});

/**
 * [VamO PRO] listFleetDriversV1
 * Securely lists drivers owned by the calling vehicleOwner, bypassing direct Firestore reads on users.
 */
export const listFleetDriversV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated.');
    
    const ownerId = request.auth.uid;
    const firestore = admin.firestore();

    try {
        const driversQuery = await firestore.collection('users')
            .where('vehicleOwnerId', '==', ownerId)
            .get();

        const drivers = driversQuery.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                uid: doc.id,
                name: data.name,
                surname: data.surname,
                email: data.email,
                phone: data.phone,
                dni: data.dni,
                vehicleId: data.vehicleId,
                fleetApprovalStatus: data.fleetApprovalStatus,
                approved: data.approved,
                driverStatus: data.driverStatus,
                createdAt: data.createdAt,
                profileImageUrl: data.profileImageUrl || data.photoURL || null,
                driverSharePercent: data.driverSharePercent || null,
                role: data.role,
                driverSubtype: data.driverSubtype
            };
        });

        return { drivers };
    } catch (error: any) {
        logger.error('[LIST_FLEET_DRIVERS_ERR]', error);
        throw new HttpsError('internal', 'Error al cargar los choferes.');
    }
});

/**
 * [VamO PRO] createFleetDriverV1
 * Allows a vehicleOwner to create a new fleet driver account.
 */
export const createFleetDriverV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated.');
    
    const ownerId = request.auth.uid;
    const { name, surname, dni, phone, email, password, vehicleId, approved } = request.data;

    if (!name || !dni || !phone || !email || !password || !vehicleId) {
        throw new HttpsError('invalid-argument', 'Faltan campos obligatorios. La patente del vehículo es requerida.');
    }

    const firestore = admin.firestore();
    const auth = admin.auth();

    // Ensure phone is normalized for Firebase Auth
    const finalPhone = phone.startsWith('+') ? phone : `+54${phone}`;
    const normalizedFleetPhone = normalizePhone(finalPhone);
    const normalizedDni = String(dni).replace(/\D/g, '');

    // 1. Check if DNI or Phone already exists in indexes
    const phoneIndexRef = firestore.collection('phone_index').doc(normalizedFleetPhone);
    const dniIndexRef = firestore.collection('dni_index').doc(normalizedDni);

    const [phoneSnap, dniSnap] = await Promise.all([phoneIndexRef.get(), dniIndexRef.get()]);

    if (phoneSnap.exists) {
        logger.error(`[PHONE_SECURITY] Mi Taxi duplicate phone: ${normalizedFleetPhone}`);
        throw new HttpsError('already-exists', 'Este número de teléfono ya está registrado en VamO.');
    }

    if (dniSnap.exists) {
        logger.error(`[DNI_SECURITY] Mi Taxi duplicate DNI: ${normalizedDni}`);
        throw new HttpsError('already-exists', 'Este DNI ya está registrado en VamO.');
    }

    // 1.b Fetch Owner Profile for inheritance (cityKey is critical)
    const ownerDoc = await firestore.collection('users').doc(ownerId).get();
    const ownerData = ownerDoc.data();
    
    const inheritedCityKey = ownerData?.cityKey || 'rawson';
    const inheritedCityName = ownerData?.city || 'Rawson';
    const inheritedOperatingAreaId = ownerData?.operatingAreaId || inheritedCityKey;

    // 1.c Extract Owner Vehicle Data for inheritance
    const inheritedVehicleMake = ownerData?.vehicleBrand || ownerData?.vehicle?.brand || ownerData?.vehicle?.make || '';
    const inheritedVehicleModel = ownerData?.vehicleModel || ownerData?.vehicle?.model || '';
    const inheritedVehicleYear = ownerData?.carModelYear || ownerData?.vehicleYear || ownerData?.vehicle?.year || '';
    const inheritedVehicleColor = ownerData?.vehicleColor || ownerData?.vehicle?.color || '';
    const inheritedVehicleImage = ownerData?.vehicleFrontPhotoURL || ownerData?.vehiclePhotoFrontUrl || ownerData?.vehiclePhotos?.front || ownerData?.vehicleImage || ownerData?.vehiclePhotoUrl || ownerData?.vehicle?.photoUrl || '';
    const inheritedServiceType = ownerData?.serviceType || ownerData?.vehicle?.serviceType || 'taxi';

    // 2. Create user in Firebase Auth
    let userRecord;
    try {
        userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: `${name} ${surname || ''}`.trim(),
            phoneNumber: finalPhone
        });
    } catch (error: any) {
        logger.error(`[CREATE_FLEET_DRIVER_AUTH_ERR]`, error);
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Ese email ya está registrado. Usá otro correo o vinculá una cuenta existente.');
        }
        if (error.code === 'auth/phone-number-already-exists') {
            throw new HttpsError('already-exists', 'El teléfono ya está registrado en VamO o es inválido.');
        }
        throw new HttpsError('internal', `Error al crear la cuenta de autenticación: ${error.message}`);
    }

    // 3. Create document in Firestore
    try {
        const now = FieldValue.serverTimestamp();
        const isApproved = approved === true;
        
        const driverData: any = {
            role: 'driver',
            driverSubtype: 'fleet_driver',
            name,
            surname: surname || '',
            dni,
            phone: finalPhone,
            email,
            cityKey: inheritedCityKey,
            city: inheritedCityName,
            operatingAreaId: inheritedOperatingAreaId,
            municipalityId: inheritedCityKey,
            vehicleOwnerId: ownerId,
            settlementOwnerId: ownerId,
            vehicleId: vehicleId,
            plateNumber: vehicleId,
            createdByFleetOwnerId: ownerId,
            fleetApprovalStatus: isApproved ? 'approved' : 'pending',
            approved: false, // Strict municipal logic: driver is NOT globally approved until municipal approval
            driverStatus: 'offline',
            accountOrigin: 'fleet_owner_created',
            documentsStatus: 'pending_upload', // They MUST upload DNI, license, profile photo
            municipalStatus: 'pending_municipal_review', // Strict municipal review required
            municipalApprovalStatus: 'pending',
            createdAt: now,
            updatedAt: now,
            onboardingCompleted: true, // Skip onboarding UI
            profileCompleted: true, // Skip onboarding UI
            registrationStatus: 'active',
            onboardingIncomplete: false,
            active: true,
            isDriver: true,
            isVehicleOwner: false,
            vehicleBrand: inheritedVehicleMake,
            vehicleModel: inheritedVehicleModel,
            vehicleYear: inheritedVehicleYear,
            vehicleColor: inheritedVehicleColor,
            vehicleImage: inheritedVehicleImage,
            serviceType: inheritedServiceType,
            assignedVehicle: {
                plate: vehicleId,
                make: inheritedVehicleMake,
                model: inheritedVehicleModel,
                year: inheritedVehicleYear,
                color: inheritedVehicleColor,
                serviceType: inheritedServiceType,
                vehiclePhotoUrl: inheritedVehicleImage
            },
            paymentAgreement: {
                mode: 'manual',
                driverSharePercent: null,
                ownerSharePercent: null,
                notes: ''
            }
        };

        const batch = firestore.batch();
        const userRef = firestore.collection('users').doc(userRecord.uid);
        batch.set(userRef, driverData);
        
        // Marcar al creador explícitamente como dueño del vehículo
        const ownerDocRef = firestore.collection('users').doc(ownerId);
        batch.update(ownerDocRef, { isVehicleOwner: true });
        
        // Crear la billetera para el chofer
        const walletRef = firestore.collection('wallets').doc(userRecord.uid);
        batch.set(walletRef, {
            userId: userRecord.uid,
            balance: 0,
            currentBalance: 0,
            currency: 'ARS',
            createdAt: now,
            updatedAt: now
        });

        // Registrar el teléfono en phone_index
        if (normalizedFleetPhone) {
            batch.set(phoneIndexRef, {
                uid: userRecord.uid,
                email: email.toLowerCase().trim(),
                createdAt: now,
                source: 'createFleetDriverV1'
            }, { merge: true });
        }

        // Registrar el DNI en dni_index
        if (normalizedDni) {
            batch.set(dniIndexRef, {
                uid: userRecord.uid,
                email: email.toLowerCase().trim(),
                createdAt: now,
                source: 'createFleetDriverV1'
            }, { merge: true });
        }

        // Inicializar drivers_locations
        const locRef = firestore.collection('drivers_locations').doc(userRecord.uid);
        batch.set(locRef, {
            driverStatus: 'offline',
            approved: isApproved,
            cityKey: inheritedCityKey,
            driverSubtype: 'fleet_driver',
            walletBalance: 0,
            isSuspended: false,
            updatedAt: now
        }, { merge: true });

        await batch.commit();
        
        logger.info(`[FLEET_DRIVER_CREATED] Driver ${userRecord.uid} created by Owner ${ownerId} in ${inheritedCityKey}`);
        return { success: true, uid: userRecord.uid };
        
    } catch (error: any) {
        logger.error(`[CREATE_FLEET_DRIVER_DB_ERR]`, error);
        // Rollback
        try {
            await auth.deleteUser(userRecord.uid);
            logger.info(`[FLEET_DRIVER_ROLLBACK] Deleted Auth user ${userRecord.uid}`);
        } catch (rollbackError) {
            logger.error(`[FLEET_DRIVER_ROLLBACK_ERR] Failed to delete Auth user ${userRecord.uid}`, rollbackError);
        }
        throw new HttpsError('internal', 'Error al crear el perfil del conductor en base de datos. Se deshicieron los cambios.');
    }
});

