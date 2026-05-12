import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { MunicipalProfile, UserProfile, MunicipalChecklistKey, buildMunicipalCode } from "./types";

/**
 * [VamO MUNICIPAL] Atomic Driver Approval
 * Validates everything before enabling the driver.
 */
export const approveDriverV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { driverId } = request.data;
    const operatorUid = request.auth.uid;

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        if (!operator || (operator.role !== 'admin' && operator.role !== 'admin_municipal')) {
            throw new HttpsError('permission-denied', 'No tienes permisos.');
        }

        const result = await db.runTransaction(async (tx) => {
            const muniRef = db.doc(`municipal_profiles/${driverId}`);
            const userRef = db.doc(`users/${driverId}`);
            const [muniSnap, userSnap] = await Promise.all([tx.get(muniRef), tx.get(userRef)]);

            if (!muniSnap.exists || !userSnap.exists) throw new Error('No se encontró el legajo.');
            const muni = muniSnap.data() as MunicipalProfile;
            const user = userSnap.data() as UserProfile;

            if (operator.role === 'admin_municipal' && muni.cityKey !== operator.cityKey) {
                throw new Error('Ciudad no permitida.');
            }

            // Validations
            const now = Timestamp.now().toMillis();
            const checklist = muni.checklist || {};
            const requiredKeys: MunicipalChecklistKey[] = [
                'dniFront', 'dniBack', 'driverLicense', 'vehicleInsurance',
                'vehicleRegistrationCard', 'criminalRecord', 'municipalCanon', 'disinfectionReceipt'
            ];
            
            if (!requiredKeys.every(key => (checklist as any)[key]?.status === 'approved')) {
                throw new Error('Checklist incompleta.');
            }
            if (muni.canonStatus !== 'paid' || (muni.canonExpiry && muni.canonExpiry.toMillis() < now)) {
                throw new Error('Canon vencido o impago.');
            }
            if (!muni.licenseExpiry || muni.licenseExpiry.toMillis() < now) throw new Error('Licencia vencida.');
            if (!muni.insuranceExpiry || muni.insuranceExpiry.toMillis() < now) throw new Error('Seguro vencido.');

            const timestamp = FieldValue.serverTimestamp();

            tx.update(muniRef, {
                municipalStatus: 'active',
                enabledAt: timestamp,
                enabledBy: operatorUid,
                municipalObservation: null,
                updatedAt: timestamp
            });

            tx.update(userRef, {
                approved: true,
                municipalStatus: 'active',
                updatedAt: timestamp
            });

            tx.set(db.collection('municipal_audit_log').doc(), {
                driverId,
                municipalCode: muni.municipalCode,
                cityKey: muni.cityKey,
                actionBy: operatorUid,
                action: 'driver_approved_at_muni',
                createdAt: timestamp
            });

            // [SYNC_FIX] Ensure drivers_locations knows about the approval for matching
            tx.set(db.doc(`drivers_locations/${driverId}`), {
                approved: true,
                updatedAt: timestamp
            }, { merge: true });

            return { driverId, status: 'active' };
        });

        return { success: true, ...result };
    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Update Checklist Item
 */
export const updateMunicipalChecklistItemV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { driverId, key, status, observation, expiryDate } = request.data;
    const operatorUid = request.auth.uid;

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        await db.runTransaction(async (tx) => {
            const muniRef = db.doc(`municipal_profiles/${driverId}`);
            const userRef = db.doc(`users/${driverId}`);
            const [muniSnap, userSnap] = await Promise.all([tx.get(muniRef), tx.get(userRef)]);

            if (!muniSnap.exists) throw new Error('Legajo no encontrado.');
            const muni = muniSnap.data() as MunicipalProfile;

            if (operator.role === 'admin_municipal' && muni.cityKey !== operator.cityKey) throw new Error('Ciudad no permitida.');

            const timestamp = FieldValue.serverTimestamp();
            const muniUpdates: any = {
                [`checklist.${key}.status`]: status,
                [`checklist.${key}.reviewedAt`]: timestamp,
                [`checklist.${key}.reviewedBy`]: operatorUid,
                [`checklist.${key}.observation`]: observation || null,
                updatedAt: timestamp
            };

            const expiryMap: Record<string, string> = {
                driverLicense: "licenseExpiry",
                vehicleInsurance: "insuranceExpiry",
                vehicleRegistrationCard: "itvExpiry",
                criminalRecord: "backgroundCheckExpiry",
            };

            let userUpdates: any = { updatedAt: timestamp };

            if (status === 'approved' && expiryMap[key] && expiryDate) {
                const date = Timestamp.fromDate(new Date(expiryDate + "T12:00:00"));
                muniUpdates[expiryMap[key]] = date;
                userUpdates[expiryMap[key]] = date;
            }
            if (status === 'observed') {
                muniUpdates.municipalStatus = 'municipal_observed';
                userUpdates.municipalStatus = 'municipal_observed';
                
                // Grace Period Logic: 48 hours
                const GRACE_MS = 48 * 60 * 60 * 1000;
                const graceUntil = Timestamp.fromMillis(Date.now() + GRACE_MS);
                
                // Only give grace if already active/approved
                if (muni.municipalStatus === 'active') {
                    muniUpdates.observationGraceUntil = graceUntil;
                    userUpdates.observationGraceUntil = graceUntil;
                    userUpdates.approved = true; // Keep working
                } else {
                    userUpdates.approved = false;
                }
            }

            if (status === 'approved') {
                // If everything is approved now, we might want to clear grace
                // (Optional, but clean)
                // However, let's keep it simple: if status changes to approved, 
                // the global status will be updated later by handleEnable or similar.
            }

            tx.update(muniRef, muniUpdates);
            tx.update(userRef, userUpdates);

            tx.set(db.collection('municipal_audit_log').doc(), {
                driverId,
                municipalCode: muni.municipalCode,
                cityKey: muni.cityKey,
                actionBy: operatorUid,
                action: status === 'approved' ? 'checklist_item_approved' : 'checklist_item_observed',
                checklistKey: key,
                note: observation || null,
                createdAt: timestamp
            });
        });

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Update Global Status (Reject, Suspend, Observe)
 */
export const updateMunicipalStatusV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { driverId, status, observation } = request.data;
    const operatorUid = request.auth.uid;

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        await db.runTransaction(async (tx) => {
            const muniRef = db.doc(`municipal_profiles/${driverId}`);
            const userRef = db.doc(`users/${driverId}`);
            const [muniSnap, userSnap] = await Promise.all([tx.get(muniRef), tx.get(userRef)]);

            if (!muniSnap.exists) throw new Error('Legajo no encontrado.');
            const muni = muniSnap.data() as MunicipalProfile;

            if (operator.role === 'admin_municipal' && muni.cityKey !== operator.cityKey) throw new Error('Ciudad no permitida.');

            const timestamp = FieldValue.serverTimestamp();
            
            const muniUpdates: any = {
                municipalStatus: status,
                municipalObservation: observation || muni.municipalObservation,
                updatedAt: timestamp
            };

            const userUpdates: any = {
                municipalStatus: status,
                updatedAt: timestamp
            };

            if (status === 'municipal_observed') {
                const GRACE_MS = 48 * 60 * 60 * 1000;
                const graceUntil = Timestamp.fromMillis(Date.now() + GRACE_MS);
                
                if (muni.municipalStatus === 'active') {
                    muniUpdates.observationGraceUntil = graceUntil;
                    userUpdates.observationGraceUntil = graceUntil;
                    userUpdates.approved = true;
                } else {
                    userUpdates.approved = false;
                }
            } else if (status === 'active') {
                userUpdates.approved = true;
                muniUpdates.observationGraceUntil = null;
                userUpdates.observationGraceUntil = null;
            } else {
                userUpdates.approved = false;
                muniUpdates.observationGraceUntil = null;
                userUpdates.observationGraceUntil = null;
            }
            
            tx.update(muniRef, muniUpdates);
            tx.update(userRef, userUpdates);

            tx.set(db.collection('municipal_audit_log').doc(), {
                driverId,
                municipalCode: muni.municipalCode,
                cityKey: muni.cityKey,
                actionBy: operatorUid,
                action: 'status_change',
                newStatus: status,
                note: observation || null,
                createdAt: timestamp
            });
        });

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Update Canon
 */
export const updateMunicipalCanonV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { driverId, paid, expiryDate } = request.data;
    const operatorUid = request.auth.uid;

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        await db.runTransaction(async (tx) => {
            const muniRef = db.doc(`municipal_profiles/${driverId}`);
            const muniSnap = await tx.get(muniRef);
            if (!muniSnap.exists) throw new Error('Legajo no encontrado.');
            const muni = muniSnap.data() as MunicipalProfile;

            if (operator.role === 'admin_municipal' && muni.cityKey !== operator.cityKey) throw new Error('Ciudad no permitida.');

            const timestamp = FieldValue.serverTimestamp();
            const canonExpiry = expiryDate ? Timestamp.fromDate(new Date(expiryDate + "T12:00:00")) : null;

            const updateData = {
                canonStatus: paid ? 'paid' : 'overdue',
                canonExpiry,
                updatedAt: timestamp
            };

            tx.update(muniRef, {
                ...updateData,
                canonPaidAt: paid ? timestamp : null,
                canonPaidBy: paid ? operatorUid : null,
            });

            tx.update(db.doc(`users/${driverId}`), updateData);
            
            tx.set(db.collection('municipal_audit_log').doc(), {
                driverId,
                municipalCode: muni.municipalCode,
                cityKey: muni.cityKey,
                actionBy: operatorUid,
                action: paid ? 'canon_marked_paid' : 'canon_marked_overdue',
                expiry: expiryDate || null,
                createdAt: timestamp
            });
        });

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Initialize Profile
 */
export const initializeMunicipalProfileV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { driverId, muniCode, cityKey, cityName } = request.data;
    const operatorUid = request.auth.uid;

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        if (operator.role === 'admin_municipal' && cityKey !== operator.cityKey) {
            throw new Error('Ciudad no permitida.');
        }

        await db.runTransaction(async (tx) => {
            const muniRef = db.doc(`municipal_profiles/${driverId}`);
            const userRef = db.doc(`users/${driverId}`);
            const [muniSnap, userSnap] = await Promise.all([tx.get(muniRef), tx.get(userRef)]);

            if (muniSnap.exists) throw new Error('El legajo ya existe.');
            if (!userSnap.exists) throw new Error('Usuario no encontrado.');
            const user = userSnap.data() as UserProfile;

            const timestamp = FieldValue.serverTimestamp();
            
            const newMp: MunicipalProfile = {
                driverId,
                driverName: user.name || "",
                driverPhone: user.phone || "",
                driverEmail: user.email || "",
                municipalCode: muniCode,
                municipalStatus: "pending_municipal_review",
                cityKey,
                city: cityName,
                checklist: {
                    dniFront: { status: "pending" },
                    dniBack: { status: "pending" },
                    driverLicense: { status: "pending" },
                    vehicleInsurance: { status: "pending" },
                    vehicleRegistrationCard: { status: "pending" },
                    criminalRecord: { status: "pending" },
                    municipalCanon: { status: "pending" },
                    disinfectionReceipt: { status: "pending" },
                } as any,
                createdAt: timestamp,
                updatedAt: timestamp,
            };

            tx.set(muniRef, newMp);
            tx.update(userRef, {
                municipalStatus: "pending_municipal_review",
                canonStatus: "pending",
                updatedAt: timestamp
            });

            tx.set(db.collection('municipal_audit_log').doc(), {
                driverId,
                municipalCode: muniCode,
                cityKey,
                actionBy: operatorUid,
                action: 'file_initialized',
                createdAt: timestamp
            });
        });

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Update Expirations
 */
export const updateMunicipalExpirationsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { driverId, field, dateStr, auditAction } = request.data;
    const operatorUid = request.auth.uid;

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        await db.runTransaction(async (tx) => {
            const muniRef = db.doc(`municipal_profiles/${driverId}`);
            const userRef = db.doc(`users/${driverId}`);
            const muniSnap = await tx.get(muniRef);
            
            if (!muniSnap.exists) throw new Error('Legajo no encontrado.');
            const muni = muniSnap.data() as MunicipalProfile;

            if (operator.role === 'admin_municipal' && muni.cityKey !== operator.cityKey) {
                throw new Error('Ciudad no permitida.');
            }

            const timestamp = FieldValue.serverTimestamp();
            const date = Timestamp.fromDate(new Date(dateStr + "T12:00:00"));

            const updateData = {
                [field]: date,
                updatedAt: timestamp
            };

            tx.update(muniRef, updateData);
            tx.update(userRef, updateData);

            tx.set(db.collection('municipal_audit_log').doc(), {
                driverId,
                municipalCode: muni.municipalCode,
                cityKey: muni.cityKey,
                actionBy: operatorUid,
                action: auditAction || 'expiry_updated',
                field,
                value: dateStr,
                createdAt: timestamp
            });
        });

        return { success: true };
    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});
/**
 * [VamO MUNICIPAL] List Drivers with Pagination and Search
 */
export const listMunicipalDriversV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { cityKey, status, query: search, limit = 20, lastVisibleId } = request.data;
    const operatorUid = request.auth.uid;

    if (!cityKey) throw new HttpsError('invalid-argument', 'cityKey es obligatorio.');

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        if (!operator || (operator.role !== 'admin' && operator.role !== 'admin_municipal')) {
            throw new HttpsError('permission-denied', 'No tienes permisos.');
        }

        if (operator.role === 'admin_municipal' && cityKey !== operator.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes ver conductores de otra ciudad.');
        }

        let q = db.collection('municipal_profiles').where('cityKey', '==', cityKey);

        // 1. Status Filters
        if (status && status !== 'all') {
            if (status === 'pending') {
                q = q.where('municipalStatus', 'in', ['pending_municipal_review', 'municipal_observed', 'renewal_under_review']);
            } else if (status === 'active') {
                q = q.where('municipalStatus', 'in', ['active', 'municipal_approved']);
            } else if (status === 'suspended') {
                q = q.where('municipalStatus', 'in', [
                    'suspended_expired_license', 'suspended_expired_insurance', 
                    'suspended_unpaid_canon', 'suspended_by_municipality', 'rejected_by_municipality'
                ]);
            } else {
                q = q.where('municipalStatus', '==', status);
            }
        }

        // 2. Search Logic (Smart Detection)
        if (search && search.trim().length >= 2) {
            const raw = search.trim();
            if (raw.includes('@')) {
                q = q.where('driverEmail', '==', raw.toLowerCase());
            } else if (/^\d{7,15}$/.test(raw.replace(/\D/g, ''))) {
                q = q.where('driverPhone', '==', raw.replace(/\D/g, ''));
            } else if (raw.toUpperCase().startsWith('MUNI-')) {
                q = q.where('municipalCode', '==', raw.toUpperCase());
            } else {
                // Name prefix (Standard Firestore search)
                // Note: driverName needs to be normalized if possible, but we use the existing field.
                q = q.where('driverName', '>=', raw).where('driverName', '<=', raw + '\uf8ff');
            }
        } else {
            // Default ordering by creation date if no search is active
            q = q.orderBy('createdAt', 'desc');
        }

        const finalLimit = Math.min(limit, 50);
        let firestoreQuery = q.limit(finalLimit);

        if (lastVisibleId) {
            const lastDoc = await db.collection('municipal_profiles').doc(lastVisibleId).get();
            if (lastDoc.exists) firestoreQuery = firestoreQuery.startAfter(lastDoc);
        }

        const snap = await firestoreQuery.get();
        const drivers = await Promise.all(snap.docs.map(async d => {
            const muniData = d.data();
            // Fetch subtype and preferences from user document if missing in muni_profile
            const userSnap = await db.doc(`users/${d.id}`).get();
            const userData = userSnap.data() as UserProfile;
            
            return {
                ...muniData,
                driverId: d.id,
                driverSubtype: userData?.driverSubtype || 'professional',
                driverPreferences: userData?.driverPreferences || {
                    acceptsExpress: true,
                    acceptsDiscountedRides: userData?.driverSubtype === 'express',
                    acceptsPets: false
                }
            };
        }));

        const lastId = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;
        const hasMore = snap.docs.length === finalLimit;

        return {
            drivers,
            lastVisibleId: lastId,
            hasMore,
            count: snap.size
        };

    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Get Dashboard Statistics
 */
export const getMunicipalDashboardStatsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { cityKey } = request.data;
    const operatorUid = request.auth.uid;

    if (!cityKey) throw new HttpsError('invalid-argument', 'cityKey es obligatorio.');

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        if (!operator || (operator.role !== 'admin' && operator.role !== 'admin_municipal')) {
            throw new HttpsError('permission-denied', 'No tienes permisos.');
        }

        if (operator.role === 'admin_municipal' && cityKey !== operator.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes ver datos de otra ciudad.');
        }

        const baseRef = db.collection('municipal_profiles').where('cityKey', '==', cityKey);

        const [total, active, pending, suspended, citySnap] = await Promise.all([
            baseRef.count().get(),
            baseRef.where('municipalStatus', 'in', ['active', 'municipal_approved']).count().get(),
            baseRef.where('municipalStatus', 'in', ['pending_municipal_review', 'municipal_observed', 'renewal_under_review']).count().get(),
            baseRef.where('municipalStatus', 'in', [
                'suspended_expired_license', 'suspended_expired_insurance', 
                'suspended_unpaid_canon', 'suspended_by_municipality', 'rejected_by_municipality'
            ]).count().get(),
            db.doc(`cities/${cityKey}`).get()
        ]);

        const recentPendingSnap = await baseRef
            .where('municipalStatus', 'in', ['pending_municipal_review', 'renewal_under_review', 'municipal_observed'])
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        const recentPending = recentPendingSnap.docs.map(d => {
            const data = d.data();
            return {
                driverId: d.id,
                driverName: data.driverName,
                municipalCode: data.municipalCode,
                municipalStatus: data.municipalStatus,
                createdAt: data.createdAt
            };
        });

        const cityData = citySnap.exists ? citySnap.data() : null;

        return {
            total: total.data().count,
            active: active.data().count,
            pending: pending.data().count,
            suspended: suspended.data().count,
            expired: 0, // Para implementar en fase 2 con campo indexado isExpired
            recentPending,
            cityData: {
                name: cityData?.name || cityKey,
                stats: cityData?.stats || {}
            }
        };

    } catch (error: any) {
        logger.error(`[MUNI_DASHBOARD] Error for ${cityKey}:`, error);
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Update Pricing with Validation and History
 */
export const updateMunicipalPricingV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { cityKey, config } = request.data;
    const operatorUid = request.auth.uid;

    if (!cityKey || !config) throw new HttpsError('invalid-argument', 'Faltan parámetros.');

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        if (!operator || (operator.role !== 'admin' && operator.role !== 'admin_municipal')) {
            throw new HttpsError('permission-denied', 'No tienes permisos.');
        }

        if (operator.role === 'admin_municipal' && cityKey !== operator.cityKey) {
            throw new HttpsError('permission-denied', 'Ciudad no permitida.');
        }

        // --- VALIDATION ---
        const { 
            DAY_BASE_FARE, DAY_PRICE_PER_100M, DAY_WAITING_PER_MIN,
            NIGHT_BASE_FARE, NIGHT_PRICE_PER_100M, NIGHT_WAITING_PER_MIN,
            MINIMUM_FARE 
        } = config;

        // Backend enforcement: no negative or zero values where forbidden
        if (DAY_BASE_FARE <= 0 || DAY_PRICE_PER_100M <= 0 || DAY_WAITING_PER_MIN < 0) {
            throw new Error('Valores diurnos inválidos. La bajada y el precio por km deben ser mayores a cero.');
        }
        if (NIGHT_BASE_FARE <= 0 || NIGHT_PRICE_PER_100M <= 0 || NIGHT_WAITING_PER_MIN < 0) {
            throw new Error('Valores nocturnos inválidos. La bajada y el precio por km deben ser mayores a cero.');
        }
        if (MINIMUM_FARE <= 0) throw new Error('La tarifa mínima debe ser mayor a cero.');

        const timestamp = FieldValue.serverTimestamp();
        const newVersion = (config.version || 0) + 1;

        await db.runTransaction(async (tx) => {
            const pricingRef = db.doc(`municipal_pricing/${cityKey}`);
            const cityRef = db.doc(`cities/${cityKey}`);

            const pricingData = {
                ...config,
                cityKey,
                version: newVersion,
                updatedAt: timestamp,
                updatedBy: operatorUid
            };

            // 1. Update official pricing document
            tx.set(pricingRef, pricingData, { merge: true });
            
            // 2. Sync version in cities collection for fast lookup by mobile apps
            tx.set(cityRef, {
                pricingVersion: newVersion,
                updatedAt: timestamp
            }, { merge: true });

            // 3. Create immutable history snapshot
            const historyRef = pricingRef.collection('history').doc();
            tx.set(historyRef, {
                ...pricingData,
                snapshotAt: timestamp,
                snapshotId: historyRef.id
            });

            // 4. Global Audit Log
            tx.set(db.collection('municipal_audit_log').doc(), {
                cityKey,
                actionBy: operatorUid,
                action: 'pricing_updated',
                version: newVersion,
                createdAt: timestamp
            });
        });

        return { success: true, version: newVersion };
    } catch (error: any) {
        logger.error(`[MUNI_PRICING] Error updating ${cityKey}:`, error);
        throw new HttpsError('failed-precondition', error.message);
    }
});

/**
 * [VamO MUNICIPAL] Trigger: Initialize Legajo on Profile Completion
 * Fired when a driver finishes the onboarding wizard.
 */
export const onDriverProfileCompletedV1 = onDocumentUpdated({ document: "users/{userId}", region: "us-central1" }, async (event) => {
    const db = getDb();
    const before = event.data?.before.data() as UserProfile;
    const after = event.data?.after.data() as UserProfile;

    if (!before || !after) return;

    // Trigger logic: profileCompleted was false, now is true, and user is a driver.
    if (!before.profileCompleted && after.profileCompleted && after.role === 'driver') {
        const userId = event.params.userId;
        const cityKey = after.cityKey || 'rawson';

        logger.info(`[ONBOARDING_TRIGGER] Driver ${userId} completed profile. Initializing legajo in ${cityKey}.`);

        try {
            // 1. Safety check: avoid duplicate legajos
            const muniRef = db.doc(`municipal_profiles/${userId}`);
            const muniSnap = await muniRef.get();
            if (muniSnap.exists) {
                logger.info(`[ONBOARDING_TRIGGER] Driver ${userId} already has a legajo. Skipping.`);
                return;
            }

            // 2. Assign default cityKey if missing (prevent orphan drivers)
            if (!after.cityKey) {
                await db.doc(`users/${userId}`).update({ cityKey });
            }

            // 3. Generate Municipal Code using a transaction on the city counter
            const counterRef = db.doc(`municipal_counters/${cityKey}`);
            const seq = await db.runTransaction(async (tx) => {
                const cSnap = await tx.get(counterRef);
                const nextSeq = (cSnap.exists ? (cSnap.data()?.seq || 0) : 0) + 1;
                tx.set(counterRef, { seq: nextSeq }, { merge: true });
                return nextSeq;
            });

            const muniCode = buildMunicipalCode(cityKey, seq);

            // 4. Create the legajo (Municipal Profile)
            const timestamp = FieldValue.serverTimestamp();
            const newMp: MunicipalProfile = {
                driverId: userId,
                driverName: after.name || "",
                driverPhone: after.phone || "",
                driverEmail: after.email || "",
                municipalCode: muniCode,
                municipalStatus: "pending_municipal_review",
                cityKey,
                checklist: {
                    dniFront: { status: "pending" },
                    dniBack: { status: "pending" },
                    driverLicense: { status: "pending" },
                    vehicleInsurance: { status: "pending" },
                    vehicleRegistrationCard: { status: "pending" },
                    criminalRecord: { status: "pending" },
                    municipalCanon: { status: "pending" },
                    disinfectionReceipt: { status: "pending" },
                } as any,
                createdAt: timestamp,
                updatedAt: timestamp,
            };

            await muniRef.set(newMp);
            
            // 5. Sync the generated code back to the user document
            await db.doc(`users/${userId}`).update({ 
                municipalCode: muniCode,
                municipalStatus: "pending_municipal_review" 
            });

            logger.info(`[ONBOARDING_TRIGGER] SUCCESS: Legajo ${muniCode} created for driver ${userId}.`);
        } catch (error) {
            logger.error(`[ONBOARDING_TRIGGER] FAILED for ${userId}:`, error);
        }
    }
});

/**
 * [VamO MUNICIPAL] List Passengers with Pagination and Search
 * Restricted to admin or admin_municipal (of same city).
 */
export const listMunicipalPassengersV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'No autorizado.');
    
    const db = getDb();
    const { cityKey, query: search, limit = 20, lastVisibleId } = request.data;
    const operatorUid = request.auth.uid;

    if (!cityKey) throw new HttpsError('invalid-argument', 'cityKey es obligatorio.');

    try {
        const operatorSnap = await db.doc(`users/${operatorUid}`).get();
        const operator = operatorSnap.data() as UserProfile;

        if (!operator || (operator.role !== 'admin' && operator.role !== 'admin_municipal')) {
            throw new HttpsError('permission-denied', 'No tienes permisos.');
        }

        if (operator.role === 'admin_municipal' && cityKey !== operator.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes ver pasajeros de otra ciudad.');
        }

        let q = db.collection('users')
            .where('role', '==', 'passenger')
            .where('cityKey', '==', cityKey);

        // Search Logic
        if (search && search.trim().length >= 2) {
            const raw = search.trim();
            if (raw.includes('@')) {
                q = q.where('email', '==', raw.toLowerCase());
            } else if (/^\d{7,15}$/.test(raw.replace(/\D/g, ''))) {
                q = q.where('phone', '==', raw.replace(/\D/g, ''));
            } else {
                q = q.where('name', '>=', raw).where('name', '<=', raw + '\uf8ff');
            }
        } else {
            q = q.orderBy('updatedAt', 'desc');
        }

        const finalLimit = Math.min(limit, 50);
        let firestoreQuery = q.limit(finalLimit);

        if (lastVisibleId) {
            const lastDoc = await db.collection('users').doc(lastVisibleId).get();
            if (lastDoc.exists) firestoreQuery = firestoreQuery.startAfter(lastDoc);
        }

        const snap = await firestoreQuery.get();
        
        // Fetch fraud alerts count and active ride info for these passengers in parallel
        const passengers = await Promise.all(snap.docs.map(async (d) => {
            const data = d.data() as UserProfile;
            const uid = d.id;
            
            // Get open fraud alerts count
            const fraudSnap = await db.collection('fraud_alerts')
                .where('passengerId', '==', uid)
                .where('status', '==', 'open')
                .count()
                .get();

            let activeRideInfo = null;
            if (data.activeRideId) {
                const rideSnap = await db.collection('rides').doc(data.activeRideId).get();
                if (rideSnap.exists) {
                    const ride = rideSnap.data();
                    activeRideInfo = {
                        rideId: data.activeRideId,
                        status: ride?.status,
                        origin: ride?.origin?.address,
                        destination: ride?.destination?.address
                    };
                }
            }
            
            return {
                ...data,
                uid,
                fraudAlertsCount: fraudSnap.data().count,
                activeRideInfo,
                // Partial email/phone for privacy (Muni only sees enough to verify, not full)
                email: data.email ? (data.email.split('@')[0].substring(0, 3) + '***@' + data.email.split('@')[1]) : '—',
                phone: data.phone ? (data.phone.substring(0, 4) + '****' + data.phone.substring(data.phone.length - 2)) : '—'
            };
        }));

        const lastId = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;
        const hasMore = snap.docs.length === finalLimit;

        return {
            passengers,
            lastVisibleId: lastId,
            hasMore,
            count: snap.size
        };

    } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message);
    }
});
