import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, Role } from "./types";
import { logMunicipalAction, MunicipalAction } from "./lib/audit";
import { sendNotification } from "./handlers";

interface CallerAuthInfo {
    role: string;
    cityKey: string;
    isGlobalAdmin: boolean;
}

async function resolveCallerRoleAndCityKey(request: any): Promise<CallerAuthInfo> {
    const db = getDb();
    const token = request.auth?.token || {};
    const uid = request.auth?.uid;

    // 1. Prioritize claims.role
    let role = token.role || "";
    // 2. Prioritize claims.r
    if (!role) {
        role = token.r || "";
    }

    // 3, 4, 5. Profile fallbacks
    let profileRole = "";
    let profileTrafficRole = "";
    let profileMunicipalRole = "";
    let profileCityKey = "";

    if (uid) {
        const callerSnap = await db.doc(`users/${uid}`).get();
        if (callerSnap.exists) {
            const callerData = callerSnap.data() as UserProfile;
            profileRole = callerData.role || "";
            profileTrafficRole = (callerData as any).trafficRole || "";
            profileMunicipalRole = (callerData as any).municipalRole || "";
            profileCityKey = callerData.cityKey || "";
        }
    }

    if (!role) {
        role = profileRole || profileTrafficRole || profileMunicipalRole || "";
    }

    const isGlobalAdmin = role === 'admin' || role === 'superadmin';
    const cityKey = token.ck || profileCityKey || "";

    return { role, cityKey, isGlobalAdmin };
}

/**
 * [VamO MUNI] Get Traffic Dashboard Statistics.
 * Returns counts for drivers, vehicles, and status distributions for a city.
 */
export const getTrafficStatsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;

    const callerSnap = await db.doc(`users/${uid}`).get();
    const caller = callerSnap.data() as UserProfile;

    const authInfo = await resolveCallerRoleAndCityKey(request);
    const callerRole = authInfo.role;
    let cityKey = authInfo.cityKey;
    const isGlobalAdmin = authInfo.isGlobalAdmin;
    if (isGlobalAdmin && request.data?.cityKey) {
        cityKey = request.data.cityKey;
    }

    if (!cityKey) {
        throw new HttpsError('invalid-argument', 'Falta especificar la jurisdicción (cityKey) o el operador no tiene una asignada.');
    }

    // Security check: must be admin or traffic/muni role
    const allowedRoles: Role[] = ['admin', 'superadmin', 'admin_municipal', 'municipal_admin', 'traffic_admin', 'traffic_municipal', 'traffic_operator', 'auditor_municipal'];
    if (!allowedRoles.includes(callerRole as Role)) {
        throw new HttpsError('permission-denied', 'No tienes permiso para ver estadísticas de tránsito.');
    }

    try {
        const driversRef = db.collection('users').where('role', '==', 'driver').where('cityKey', '==', cityKey);
        
        const now = Timestamp.now();
        const [total, active, pending, suspended, expired] = await Promise.all([
            driversRef.count().get(),
            driversRef.where('municipalStatus', 'in', ['active', 'municipal_approved']).count().get(),
            driversRef.where('municipalStatus', 'in', ['pending_municipal_review', 'municipal_observed', 'renewal_under_review']).count().get(),
            driversRef.where('municipalStatus', 'in', ['suspended_expired_license', 'suspended_expired_insurance', 'suspended_unpaid_canon', 'suspended_by_municipality', 'suspended_by_traffic', 'rejected_by_municipality']).count().get(),
            driversRef.where('licenseExpiry', '<', now).count().get()
        ]);

        return {
            total: total.data().count,
            active: active.data().count,
            pending: pending.data().count,
            suspended: suspended.data().count,
            expired: expired.data().count,
            cityKey
        };
    } catch (error: any) {
        logger.error(`[TRAFFIC_STATS] Error:`, error);
        throw new HttpsError('internal', 'Error al obtener estadísticas de tránsito.');
    }
});

/**
 * [VamO MUNI] Search Drivers with Municipal filters.
 */
export const searchTrafficDriversV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { status, subtype, query, limit = 20, lastVisible } = request.data;

    const callerSnap = await db.doc(`users/${uid}`).get();
    const caller = callerSnap.data() as UserProfile;
    
    const authInfo = await resolveCallerRoleAndCityKey(request);
    const callerRole = authInfo.role;
    let cityKey = authInfo.cityKey;
    const isGlobalAdmin = authInfo.isGlobalAdmin;
    if (isGlobalAdmin && request.data?.cityKey) {
        cityKey = request.data.cityKey;
    }

    if (!cityKey) {
        throw new HttpsError('invalid-argument', 'Falta especificar la jurisdicción (cityKey) o el operador no tiene una asignada.');
    }

    const allowedRoles: Role[] = ['admin', 'superadmin', 'admin_municipal', 'municipal_admin', 'traffic_admin', 'traffic_municipal', 'traffic_operator', 'auditor_municipal'];
    if (!allowedRoles.includes(callerRole as Role)) {
        throw new HttpsError('permission-denied', 'No tienes permisos para buscar conductores.');
    }

    let q = db.collection('users')
        .where('role', '==', 'driver')
        .where('cityKey', '==', cityKey);
    let isNameSearch = false;

    if (status) {
        if (status === 'active') {
            q = q.where('municipalStatus', 'in', ['active', 'municipal_approved']);
        } else if (status === 'pending') {
            q = q.where('municipalStatus', 'in', ['pending_municipal_review', 'municipal_observed', 'renewal_under_review']);
        } else if (status === 'suspended') {
            q = q.where('isSuspended', '==', true);
        } else {
            q = q.where('municipalStatus', '==', status);
        }
    }
    if (subtype) q = q.where('driverSubtype', '==', subtype);

    // Multi-field smart search with automatic detection
    if (query && query.trim().length >= 2) {
        const qRaw = query.trim();
        
        if (qRaw.includes('@')) {
            // Case 1: Email (Exact match, normalized)
            q = q.where('email', '==', qRaw.toLowerCase().trim());
        } 
        else if (/^[A-Z0-9\s-]{6,9}$/i.test(qRaw) && !/^\d+$/.test(qRaw.replace(/[-\s]/g, ''))) {
            // Case 2: Plate (Exact match, normalized to uppercase, no spaces/dashes)
            const plate = qRaw.replace(/[-\s]/g, '').toUpperCase();
            q = q.where('plateNumber', '==', plate);
        }
        else if (/^\+?[\d\s-]{8,15}$/.test(qRaw)) {
            // Case 3: Phone (Exact match, digits only)
            const phoneDigits = qRaw.replace(/\D/g, '');
            q = q.where('phone', '==', phoneDigits);
        }
        else if (qRaw.toUpperCase().includes('MUNI-')) {
            // Case 4: Municipal Code (Exact match, normalized)
            q = q.where('municipalCode', '==', qRaw.toUpperCase().trim());
        }
        else {
            // Case 5: Name Prefix (Standard fallback)
            q = q.where('name', '>=', qRaw).where('name', '<=', qRaw + '\uf8ff');
            isNameSearch = true;
        }
    }

    if (!isNameSearch) {
        q = q.orderBy('createdAt', 'desc');
    }

    const finalLimit = Math.min(limit, 50);
    let firestoreQuery = q.limit(finalLimit);
    
    if (lastVisible && typeof lastVisible === 'string') {
        const lastDoc = await db.collection('users').doc(lastVisible).get();
        if (lastDoc.exists) firestoreQuery = firestoreQuery.startAfter(lastDoc);
    }

    const snap = await firestoreQuery.get();
    
    // FILTRADO DE DATOS SENSIBLES PARA TRÁNSITO
    const drivers = snap.docs.map(doc => {
        const data = doc.data() as UserProfile;
        return {
            id: doc.id,
            name: data.name,
            surname: data.surname,
            email: data.email,
            phone: data.phone,
            cityKey: data.cityKey,
            municipalStatus: data.municipalStatus,
            municipalCode: data.municipalCode,
            driverSubtype: data.driverSubtype,
            vehicleType: data.vehicleType,
            carModelYear: data.carModelYear,
            licenseNumber: data.licenseNumber,
            identityStatus: data.identityStatus,
            approved: data.approved,
            isSuspended: data.isSuspended || false,
            trafficSuspended: data.trafficSuspended || false,
            municipalSuspended: data.municipalSuspended || false,
            adminSuspended: data.adminSuspended || false,
            suspensionSource: data.suspensionSource || null
        };
    });

    const lastId = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;
    const hasMore = snap.docs.length === finalLimit;

    return { 
        drivers, 
        count: snap.size, 
        lastVisibleId: lastId, 
        hasMore 
    };
});

/**
 * [VamO MUNI] Update Driver Municipal Status (Sanctions/Habilitation).
 */
export const updateDriverMunicipalStatusV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { targetUid, newStatus, reason } = request.data;

    if (!targetUid || !newStatus) throw new HttpsError('invalid-argument', 'Faltan parámetros.');

    const callerSnap = await db.doc(`users/${uid}`).get();
    const caller = callerSnap.data() as UserProfile;

    const authInfo = await resolveCallerRoleAndCityKey(request);
    const callerRole = authInfo.role;
    const isGlobalAdmin = authInfo.isGlobalAdmin;
    const callerCityKey = authInfo.cityKey;

    const targetSnap = await db.doc(`users/${targetUid}`).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'Conductor no encontrado.');
    const target = targetSnap.data() as UserProfile;

    // Security check
    const allowedRoles: Role[] = ['admin', 'superadmin', 'admin_municipal', 'municipal_admin', 'traffic_admin', 'traffic_municipal'];
    if (!allowedRoles.includes(callerRole as Role)) {
        throw new HttpsError('permission-denied', 'No tienes permisos para cambiar estados municipales.');
    }

    if (!isGlobalAdmin) {
        if (!callerCityKey) {
            throw new HttpsError('permission-denied', 'No tienes una ciudad/jurisdicción asignada.');
        }
        if (callerCityKey !== target.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes gestionar conductores de otra jurisdicción.');
        }
    }

    const calculateSuspensionProperties = (
        updates: {
            adminSuspended?: boolean;
            municipalSuspended?: boolean;
            trafficSuspended?: boolean;
        },
        currentProfile: Partial<UserProfile>
    ) => {
        const admin = updates.adminSuspended !== undefined ? updates.adminSuspended : !!currentProfile.adminSuspended;
        const municipal = updates.municipalSuspended !== undefined ? updates.municipalSuspended : !!currentProfile.municipalSuspended;
        const traffic = updates.trafficSuspended !== undefined ? updates.trafficSuspended : !!currentProfile.trafficSuspended;

        const isSuspended = admin || municipal || traffic;

        let suspensionSource: 'admin' | 'municipal' | 'traffic' | null = null;
        if (admin) {
            suspensionSource = 'admin';
        } else if (municipal) {
            suspensionSource = 'municipal';
        } else if (traffic) {
            suspensionSource = 'traffic';
        }

        return { isSuspended, suspensionSource };
    };

    const timestamp = FieldValue.serverTimestamp();

    if (newStatus === 'suspended_by_traffic') {
        // Suspend driver preventatively by traffic
        await db.runTransaction(async (transaction) => {
            const userRef = db.doc(`users/${targetUid}`);
            const mpRef = db.doc(`municipal_profiles/${targetUid}`);

            // Perform all gets first
            const [userSnap, mpSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(mpRef)
            ]);

            const userData = userSnap.data() as UserProfile;

            const updates = {
                trafficSuspended: true,
                trafficSuspensionReason: reason || 'Suspensión preventiva por Tránsito',
                trafficSuspendedAt: timestamp,
                trafficSuspendedBy: caller.email || uid,
            };

            const { isSuspended, suspensionSource } = calculateSuspensionProperties(updates, userData);

            transaction.update(userRef, {
                ...updates,
                isSuspended,
                suspensionSource,
                suspensionReason: updates.trafficSuspensionReason,
                municipalStatusUpdatedAt: timestamp,
                municipalStatusReason: reason || 'Suspensión preventiva por Tránsito',
                updatedAt: timestamp
            });

            // Sync with drivers_locations
            transaction.set(db.doc(`drivers_locations/${targetUid}`), {
                isSuspended,
                updatedAt: timestamp
            }, { merge: true });

            const mpUpdates = {
                ...updates,
                isSuspended,
                suspensionSource,
                updatedAt: timestamp
            };
            if (mpSnap.exists) {
                transaction.update(mpRef, mpUpdates);
            } else {
                transaction.set(mpRef, {
                    driverId: targetUid,
                    driverName: (userData.name || 'Conductor') + (userData.surname ? ' ' + userData.surname : ''),
                    municipalStatus: userData.municipalStatus || 'pending',
                    cityKey: userData.cityKey || callerCityKey || 'unknown',
                    createdAt: timestamp,
                    ...mpUpdates
                });
            }
        });
    } else if (newStatus === 'active') {
        // Reactivate / lift suspension
        // Security check: Only traffic/admin can lift if source is traffic.
        // If source is municipal or admin, traffic cannot lift it!
        const currentSource = target.suspensionSource;
        if (currentSource && currentSource !== 'traffic' && !isGlobalAdmin) {
            throw new HttpsError('permission-denied', `No tienes permisos para levantar una suspensión de origen '${currentSource}'.`);
        }

        await db.runTransaction(async (transaction) => {
            const userRef = db.doc(`users/${targetUid}`);
            const mpRef = db.doc(`municipal_profiles/${targetUid}`);

            // Perform all gets first
            const [userSnap, mpSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(mpRef)
            ]);

            const userData = userSnap.data() as UserProfile;

            const updates = {
                trafficSuspended: false,
                trafficSuspensionReason: null,
                trafficSuspensionResolvedAt: timestamp,
                trafficSuspensionResolvedBy: caller.email || uid,
            };

            const { isSuspended, suspensionSource } = calculateSuspensionProperties(updates, userData);

            // Fetch current active suspension reason
            let suspensionReason = null;
            if (suspensionSource === 'admin') {
                suspensionReason = userData.adminSuspensionReason;
            } else if (suspensionSource === 'municipal') {
                suspensionReason = userData.municipalSuspensionReason;
            }

            transaction.update(userRef, {
                ...updates,
                isSuspended,
                suspensionSource,
                suspensionReason,
                municipalStatusUpdatedAt: timestamp,
                municipalStatusReason: reason || 'Reactivación de servicio',
                updatedAt: timestamp
            });

            // Sync with drivers_locations
            transaction.set(db.doc(`drivers_locations/${targetUid}`), {
                isSuspended,
                updatedAt: timestamp
            }, { merge: true });

            const mpUpdates = {
                ...updates,
                isSuspended,
                suspensionSource,
                updatedAt: timestamp
            };
            if (mpSnap.exists) {
                transaction.update(mpRef, mpUpdates);
            }
        });
    } else {
        // Standard status change (municipal update)
        await db.doc(`users/${targetUid}`).update({
            municipalStatus: newStatus,
            municipalStatusUpdatedAt: timestamp,
            municipalStatusReason: reason || '',
            updatedAt: timestamp
        });
    }

    // AUDIT LOG
    await logMunicipalAction({
        cityKey: target.cityKey || 'unknown',
        actorUid: uid,
        actorName: caller.name || 'Admin',
        actorEmail: caller.email || '',
        actorRole: callerRole as Role,
        action: "municipal_driver_status_change" as MunicipalAction,
        targetType: "driver",
        targetId: targetUid,
        metadata: { oldStatus: target.municipalStatus, newStatus, reason }
    });

    return { success: true };
});

/**
 * [VamO TRAFFIC] Request Driver Document.
 * Formally requests a document from a driver.
 */
export const requestDriverDocumentV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { targetUid, documentType, reason } = request.data;

    if (!targetUid || !documentType) throw new HttpsError('invalid-argument', 'Faltan parámetros.');

    try {
        const callerSnap = await db.doc(`users/${uid}`).get();
        const caller = callerSnap.data() as UserProfile;

        const authInfo = await resolveCallerRoleAndCityKey(request);
        const callerRole = authInfo.role;
        const isGlobalAdmin = authInfo.isGlobalAdmin;
        const callerCityKey = authInfo.cityKey;

        const targetSnap = await db.doc(`users/${targetUid}`).get();
        if (!targetSnap.exists) throw new HttpsError('not-found', 'Conductor no encontrado.');
        const target = targetSnap.data() as UserProfile;

        // Security check: admin or traffic roles
        const allowedRoles: Role[] = ['admin', 'superadmin', 'admin_municipal', 'municipal_admin', 'traffic_admin', 'traffic_municipal', 'traffic_operator'];
        if (!allowedRoles.includes(callerRole as Role)) {
            throw new HttpsError('permission-denied', 'No tienes permisos para solicitar documentos.');
        }

        if (!isGlobalAdmin) {
            if (!callerCityKey) {
                throw new HttpsError('permission-denied', 'No tienes una ciudad/jurisdicción asignada.');
            }
            if (callerCityKey !== target.cityKey) {
                throw new HttpsError('permission-denied', 'No puedes gestionar conductores de otra jurisdicción.');
            }
        }

        const requestId = `REQ_${Date.now()}`;
        const requestData = {
            requestId,
            documentType,
            reason: reason || 'Documentación requerida por el área de Tránsito.',
            requestedBy: uid,
            requestedByRole: callerRole,
            requestedByName: caller.name || 'Inspector',
            status: 'requested',
            createdAt: FieldValue.serverTimestamp(),
            systemVersion: 'v2_robust_request'
        };

        const targetFullName = (target.name || 'Conductor') + (target.surname ? ' ' + target.surname : '');

        // Update municipal profile
        const mpRef = db.doc(`municipal_profiles/${targetUid}`);
        const mpSnap = await mpRef.get();
        
        if (mpSnap.exists) {
            await mpRef.update({
                [`checklist.${documentType}.status`]: 'pending',
                [`checklist.${documentType}.observation`]: reason || 'Solicitado por Tránsito',
                lastTrafficRequest: requestData,
                updatedAt: FieldValue.serverTimestamp()
            });
        } else {
            // Create minimal profile if it doesn't exist
            await mpRef.set({
                driverId: targetUid,
                driverName: targetFullName,
                municipalStatus: 'pending_municipal_review',
                cityKey: target.cityKey || callerCityKey || 'unknown',
                checklist: {
                    [documentType]: {
                        status: 'pending',
                        observation: reason || 'Solicitado por Tránsito'
                    }
                },
                lastTrafficRequest: requestData,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        // [VamO PRO] AUTO-UPGRADE TO EXPRESS
        // If a municipal request is made, we ensure the driver is tagged as 'express' so they can see the muni-status panel.
        if (target.driverSubtype !== 'express') {
            await db.doc(`users/${targetUid}`).update({
                driverSubtype: 'express',
                updatedAt: FieldValue.serverTimestamp()
            });
            logger.info(`[requestDriverDocumentV1] Auto-upgraded driver ${targetUid} to 'express' subtype.`);
        }

        // AUDIT LOG
        await logMunicipalAction({
            cityKey: target.cityKey || callerCityKey || 'unknown',
            actorUid: uid,
            actorName: caller.name || 'Inspector',
            actorEmail: caller.email || '',
            actorRole: callerRole as Role,
            action: "municipal_document_requested" as MunicipalAction,
            targetType: "driver",
            targetId: targetUid,
            metadata: { documentType, reason }
        });

        // NOTIFICATION
        await sendNotification(
            targetUid,
            "Documentación Requerida",
            `El área de Tránsito solicita: ${documentType}. Por favor, suba el documento a la brevedad.`,
            '/driver/muni-status',
            { type: 'MUNICIPAL_DOC_REQUEST', documentType }
        ).catch(e => logger.warn(`[requestDriverDocumentV1] Failed to send notification to ${targetUid}:`, e));

        return { success: true, requestId };
    } catch (error: any) {
        logger.error(`[requestDriverDocumentV1] Error requesting document for ${targetUid}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error interno al solicitar documento.');
    }
});

/**
 * [VamO TRAFFIC] Suspend or Unsuspend Driver Preventatively by Traffic.
 */
export const updateTrafficSuspensionV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { driverId, action, reason, expiresAt } = request.data;

    if (!driverId || !action) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios: driverId o action.');
    }
    if (action !== 'suspend' && action !== 'unsuspend') {
        throw new HttpsError('invalid-argument', 'La acción debe ser "suspend" o "unsuspend".');
    }

    const callerSnap = await db.doc(`users/${uid}`).get();
    const caller = callerSnap.data() as UserProfile;

    const authInfo = await resolveCallerRoleAndCityKey(request);
    const callerRole = authInfo.role;
    const isGlobalAdmin = authInfo.isGlobalAdmin;
    const callerCityKey = authInfo.cityKey;

    // Security check: roles
    const allowedRoles: Role[] = ['admin', 'superadmin', 'traffic', 'traffic_admin', 'traffic_operator', 'traffic_municipal'];
    if (!allowedRoles.includes(callerRole as Role)) {
        throw new HttpsError('permission-denied', 'No tienes permisos para realizar esta acción de tránsito.');
    }

    const targetSnap = await db.doc(`users/${driverId}`).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'Conductor no encontrado.');
    const target = targetSnap.data() as UserProfile;

    if (!isGlobalAdmin) {
        if (!callerCityKey) {
            throw new HttpsError('permission-denied', 'No tienes una ciudad/jurisdicción asignada.');
        }
        if (callerCityKey !== target.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes gestionar conductores de otra jurisdicción.');
        }
    }

    const timestamp = FieldValue.serverTimestamp();

    const calculateSuspensionProperties = (
        updates: {
            adminSuspended?: boolean | null;
            municipalSuspended?: boolean | null;
            trafficSuspended?: boolean | null;
        },
        currentProfile: Partial<UserProfile>
    ) => {
        const admin = updates.adminSuspended !== undefined ? !!updates.adminSuspended : !!currentProfile.adminSuspended;
        const municipal = updates.municipalSuspended !== undefined ? !!updates.municipalSuspended : !!currentProfile.municipalSuspended;
        const traffic = updates.trafficSuspended !== undefined ? !!updates.trafficSuspended : !!currentProfile.trafficSuspended;

        const isSuspended = admin || municipal || traffic;

        let suspensionSource: 'admin' | 'municipal' | 'traffic' | null = null;
        if (admin) {
            suspensionSource = 'admin';
        } else if (municipal) {
            suspensionSource = 'municipal';
        } else if (traffic) {
            suspensionSource = 'traffic';
        }

        return { isSuspended, suspensionSource };
    };

    try {
        if (action === 'suspend') {
            await db.runTransaction(async (transaction) => {
                const userRef = db.doc(`users/${driverId}`);
                const mpRef = db.doc(`municipal_profiles/${driverId}`);

                // Perform all gets first
                const [userSnap, mpSnap] = await Promise.all([
                    transaction.get(userRef),
                    transaction.get(mpRef)
                ]);

                const userData = userSnap.data() as UserProfile;

                const updates: any = {
                    trafficSuspended: true,
                    trafficSuspensionReason: reason || 'Suspensión preventiva por Tránsito',
                    trafficSuspendedAt: timestamp,
                    trafficSuspendedBy: caller.email || uid,
                };
                if (expiresAt) {
                    updates.trafficSuspensionExpiry = Timestamp.fromDate(new Date(expiresAt));
                } else {
                    updates.trafficSuspensionExpiry = null;
                }

                const { isSuspended, suspensionSource } = calculateSuspensionProperties(updates, userData);

                transaction.update(userRef, {
                    ...updates,
                    isSuspended,
                    suspensionSource,
                    suspensionReason: updates.trafficSuspensionReason,
                    updatedAt: timestamp
                });

                // Sync con drivers_locations para detener matching
                transaction.set(db.doc(`drivers_locations/${driverId}`), {
                    isSuspended,
                    updatedAt: timestamp
                }, { merge: true });

                const mpUpdates = {
                    ...updates,
                    isSuspended,
                    suspensionSource,
                    updatedAt: timestamp
                };
                if (mpSnap.exists) {
                    transaction.update(mpRef, mpUpdates);
                } else {
                    transaction.set(mpRef, {
                        driverId,
                        driverName: (userData.name || 'Conductor') + (userData.surname ? ' ' + userData.surname : ''),
                        municipalStatus: userData.municipalStatus || 'pending_municipal_review',
                        cityKey: userData.cityKey || callerCityKey || 'unknown',
                        createdAt: timestamp,
                        ...mpUpdates
                    });
                }
            });

            // AUDIT LOG
            await logMunicipalAction({
                cityKey: target.cityKey || callerCityKey || 'unknown',
                actorUid: uid,
                actorName: caller.name || 'Inspector',
                actorEmail: caller.email || '',
                actorRole: callerRole as Role,
                action: "driver_suspended" as MunicipalAction,
                targetType: "driver",
                targetId: driverId,
                metadata: { reason, expiresAt, source: 'traffic' }
            });

        } else {
            // action === 'unsuspend'
            const isLegacyTrafficSuspended = target.municipalStatus === 'suspended_by_traffic';
            const currentSource = target.suspensionSource || (isLegacyTrafficSuspended ? 'traffic' : null);
            if (currentSource && currentSource !== 'traffic' && !isGlobalAdmin) {
                throw new HttpsError('permission-denied', `No puedes levantar una suspensión de origen '${currentSource}'.`);
            }

            await db.runTransaction(async (transaction) => {
                const userRef = db.doc(`users/${driverId}`);
                const mpRef = db.doc(`municipal_profiles/${driverId}`);

                // Perform all gets first
                const [userSnap, mpSnap] = await Promise.all([
                    transaction.get(userRef),
                    transaction.get(mpRef)
                ]);

                const userData = userSnap.data() as UserProfile;

                const updates: any = {
                    trafficSuspended: false,
                    trafficSuspensionReason: null,
                    trafficSuspensionExpiry: null,
                    trafficSuspensionResolvedAt: timestamp,
                    trafficSuspensionResolvedBy: caller.email || uid,
                };

                if (userData.municipalStatus === 'suspended_by_traffic') {
                    updates.municipalStatus = 'active';
                }

                const { isSuspended, suspensionSource } = calculateSuspensionProperties(updates, userData);

                let suspensionReason = null;
                if (suspensionSource === 'admin') {
                    suspensionReason = userData.adminSuspensionReason;
                } else if (suspensionSource === 'municipal') {
                    suspensionReason = userData.municipalSuspensionReason;
                }

                transaction.update(userRef, {
                    ...updates,
                    isSuspended,
                    suspensionSource,
                    suspensionReason,
                    updatedAt: timestamp
                });

                // Sync con drivers_locations
                transaction.set(db.doc(`drivers_locations/${driverId}`), {
                    isSuspended,
                    updatedAt: timestamp
                }, { merge: true });

                const mpUpdates = {
                    ...updates,
                    isSuspended,
                    suspensionSource,
                    updatedAt: timestamp
                };
                if (mpSnap.exists) {
                    transaction.update(mpRef, mpUpdates);
                }
            });

            // AUDIT LOG
            await logMunicipalAction({
                cityKey: target.cityKey || callerCityKey || 'unknown',
                actorUid: uid,
                actorName: caller.name || 'Inspector',
                actorEmail: caller.email || '',
                actorRole: callerRole as Role,
                action: "driver_unsuspended" as MunicipalAction,
                targetType: "driver",
                targetId: driverId,
                metadata: { source: 'traffic' }
            });
        }

        return { success: true };
    } catch (error: any) {
        logger.error(`[updateTrafficSuspensionV1] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error interno al procesar suspensión.');
    }
});
