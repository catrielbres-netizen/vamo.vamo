import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, Role } from "./types";
import { logMunicipalAction, MunicipalAction } from "./lib/audit";
import { sendNotification } from "./handlers";
import { calculateBusinessDueAt } from "./lib/date";
import { createNotification } from "./lib/notifications";
import { getDriverOperationalStatus } from "./lib/traffic";

// Helper to centralize suspension calculation logic
export const calculateSuspensionProperties = (
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
        
        const now = new Date();
        const driversSnap = await driversRef.get();
        
        let total = 0, active = 0, pending = 0, suspended = 0, expired = 0, observed = 0;

        driversSnap.docs.forEach(doc => {
            const data = doc.data();
            total++;

            const opStatus = getDriverOperationalStatus(data);

            if (opStatus === 'suspended') suspended++;
            else if (opStatus === 'enabled') active++;
            else if (opStatus === 'observed') observed++;
            else pending++;

            // Documentation expired logic
            let isExpired = false;
            if (data.licenseExpiry && typeof data.licenseExpiry.toDate === 'function') {
                if (data.licenseExpiry.toDate() < now) isExpired = true;
            }
            if (data.expiredDocs && Array.isArray(data.expiredDocs) && data.expiredDocs.length > 0) {
                isExpired = true;
            }
            if (data.documentsExpired === true || data.docsStatus === 'expired') {
                isExpired = true;
            }
            if (isExpired) expired++;
        });

        return {
            total,
            active,
            pending,
            suspended,
            expired,
            cityKey,
            observed
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

    // Remove status filtering from DB query, we will do it in memory using the universal helper.
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
    // Extraemos 200 en vez de finalLimit para poder filtrar en memoria sin perder resultados
    let firestoreQuery = q.limit(200);
    
    if (lastVisible && typeof lastVisible === 'string') {
        const lastDoc = await db.collection('users').doc(lastVisible).get();
        if (lastDoc.exists) firestoreQuery = firestoreQuery.startAfter(lastDoc);
    }

    const snap = await firestoreQuery.get();
    
    // FILTRADO EN MEMORIA Y SELECCION DE CAMPOS
    let filteredResults: any[] = [];
    
    for (const doc of snap.docs) {
        const data = doc.data() as UserProfile;
        
        const opStatus = getDriverOperationalStatus(data);
        
        // Memory Status Filter Match
        if (status) {
            if (status === 'active' && opStatus !== 'enabled') continue;
            if (status === 'pending' && opStatus !== 'pending') continue;
            if (status === 'suspended' && opStatus !== 'suspended') continue;
            if (status === 'observed' && opStatus !== 'observed') continue;
        }
        
        filteredResults.push({
            id: doc.id,
            name: data.name,
            surname: data.surname,
            email: data.email,
            phone: data.phone,
            cityKey: data.cityKey,
            municipalStatus: data.municipalStatus,
            approved: data.approved,
            operationalStatus: opStatus,
            municipalCode: data.municipalCode,
            driverSubtype: data.driverSubtype,
            vehicleType: data.vehicleType,
            carModelYear: data.carModelYear,
            licenseNumber: data.licenseNumber,
            identityStatus: data.identityStatus,
            isSuspended: data.isSuspended,
            trafficSuspended: data.trafficSuspended,
            municipalSuspended: data.municipalSuspended,
            adminSuspended: data.adminSuspended
        });
        
        if (filteredResults.length >= finalLimit) break;
    }

    const nextCursor = filteredResults.length > 0 ? filteredResults[filteredResults.length - 1].id : null;
    const hasMore = filteredResults.length === finalLimit && snap.docs.length > filteredResults.length;

    return { 
        drivers: filteredResults,
        lastVisibleId: nextCursor, 
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

// --- TRAFFIC OBSERVATIONS (INSTITUTIONAL FLOW) ---

export const createTrafficObservationV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { driverId, severity, documentType, reason, note, autoSuspend } = request.data;

    if (!driverId || !severity || !documentType || !reason) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    try {
        const callerSnap = await db.doc(`users/${uid}`).get();
        const caller = callerSnap.data() as UserProfile;

        const authInfo = await resolveCallerRoleAndCityKey(request);
        const callerRole = authInfo.role;
        const isGlobalAdmin = authInfo.isGlobalAdmin;
        const callerCityKey = authInfo.cityKey;

        const targetSnap = await db.doc(`users/${driverId}`).get();
        if (!targetSnap.exists) throw new HttpsError('not-found', 'Conductor no encontrado.');
        const target = targetSnap.data() as UserProfile;

        // Security check
        const allowedRoles: Role[] = ['admin', 'superadmin', 'admin_municipal', 'municipal_admin', 'traffic_admin', 'traffic_municipal', 'traffic_operator', 'traffic'];
        if (!allowedRoles.includes(callerRole as Role)) {
            throw new HttpsError('permission-denied', 'No tienes permisos para crear observaciones.');
        }

        if (!isGlobalAdmin) {
            if (!callerCityKey) throw new HttpsError('permission-denied', 'No tienes una ciudad asignada.');
            if (callerCityKey !== target.cityKey) throw new HttpsError('permission-denied', 'No puedes gestionar conductores de otra jurisdicción.');
        }

        const observationId = `OBS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const timestamp = FieldValue.serverTimestamp();
        
        let dueAt = timestamp;
        let status = 'awaiting_driver_response';
        
        if (severity === 'regularizable') {
            // 24 business hours
            dueAt = Timestamp.fromMillis(calculateBusinessDueAt(Date.now(), 24, target.cityKey || callerCityKey || 'rawson'));
        } else if (severity === 'critical') {
            status = 'awaiting_driver_response'; // Still waiting for doc, but already suspended
        }

        const obsData = {
            observationId,
            driverId,
            cityKey: target.cityKey || callerCityKey || 'unknown',
            createdBy: uid,
            createdByRole: callerRole,
            source: 'traffic',
            type: 'document_request',
            severity,
            status,
            requestedDocumentType: documentType,
            requestedDocumentLabel: documentType, // Could be enriched
            reason,
            note: note || '',
            createdAt: timestamp,
            dueAt,
            dueAtBusiness: severity === 'regularizable',
            businessHours: 24,
            expiresOnBusinessTime: severity === 'regularizable',
            countdownHours: 24,
            affectsMatching: severity === 'critical' || autoSuspend === true,
            autoSuspendAtDueDate: severity === 'regularizable' ? true : !!autoSuspend,
            updatedAt: timestamp
        };

        await db.runTransaction(async (transaction) => {
            // 1. Create observation
            transaction.set(db.doc(`traffic_observations/${observationId}`), obsData);

            // 2. If critical, suspend immediately
            if (severity === 'critical') {
                const userRef = db.doc(`users/${driverId}`);
                const mpRef = db.doc(`municipal_profiles/${driverId}`);
                const locRef = db.doc(`drivers_locations/${driverId}`);

                transaction.update(userRef, {
                    trafficSuspended: true,
                    isSuspended: true,
                    suspensionSource: 'traffic',
                    trafficSuspensionReason: reason,
                    trafficSuspendedAt: timestamp,
                    trafficSuspendedBy: caller.email || uid,
                    updatedAt: timestamp
                });

                transaction.set(locRef, {
                    isSuspended: true,
                    updatedAt: timestamp
                }, { merge: true });

                const mpSnap = await transaction.get(mpRef);
                if (mpSnap.exists) {
                    transaction.update(mpRef, {
                        trafficSuspended: true,
                        isSuspended: true,
                        suspensionSource: 'traffic',
                        updatedAt: timestamp
                    });
                }
            }
        });

        // Notifications
        const pushTitle = severity === 'critical' ? 'Suspensión Preventiva de Tránsito' : 'Tránsito solicitó correcciones';
        const pushBody = severity === 'critical' 
                ? `Fuiste inhabilitado por: ${reason}. Subí el documento requerido para rehabilitarte.`
                : `Tenés 24 horas hábiles para presentar: ${documentType}.`;

        await sendNotification(driverId, pushTitle, pushBody, '/', { screen: 'muni_status' }).catch(e => logger.warn(`Failed to notify driver ${driverId}`, e));

        // Campanita notification for Driver
        await createNotification({
            userId: driverId,
            role: 'driver',
            type: 'traffic_observation_created',
            title: pushTitle,
            message: pushBody,
            priority: severity === 'critical' ? 'critical' : 'warning',
            actionUrl: '/driver/muni-status'
        });

        // Campanita notification for Municipal Admin (Audit)
        // Note: For municipality we don't have a specific ID, but we could broadcast or save it. 
        // Skipping direct campanita to municipality unless there is a global municipal role user, which we don't resolve here easily.


        return { success: true, observationId };
    } catch (error: any) {
        logger.error(`[createTrafficObservationV1] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

export const submitTrafficObservationDocumentV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { observationId, documentType, fileUrl, storagePath, cityKey } = request.data;

    if (!observationId || !fileUrl) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    try {
        const obsRef = db.doc(`traffic_observations/${observationId}`);
        const obsSnap = await obsRef.get();

        if (!obsSnap.exists) {
            throw new HttpsError('not-found', 'Observación no encontrada.');
        }

        const obsData = obsSnap.data() as any;
        if (obsData.driverId !== uid) {
            throw new HttpsError('permission-denied', 'Esta observación no te pertenece.');
        }

        if (obsData.status !== 'awaiting_driver_response' && obsData.status !== 'expired' && obsData.status !== 'rejected') {
            throw new HttpsError('failed-precondition', 'La observación no está en un estado válido para subir documentos.');
        }

        const timestamp = FieldValue.serverTimestamp();

        await db.runTransaction(async (transaction) => {
            // Check again inside transaction to be safe, though rare conflict
            transaction.update(obsRef, {
                status: 'pending_traffic_review',
                driverSubmittedAt: timestamp,
                relatedDocumentId: fileUrl, // use fileUrl or storagePath
                uploadedBy: uid,
                trafficReviewStatus: 'pending',
                requestedDocumentType: documentType || obsData.requestedDocumentType,
                updatedAt: timestamp
            });
        });

        // Notify the Traffic inspector who created it
        if (obsData.createdBy) {
            await createNotification({
                userId: obsData.createdBy,
                role: obsData.createdByRole || 'traffic',
                type: 'traffic_observation_submitted',
                title: 'Documento Recibido',
                message: `El conductor ha subido el documento solicitado para revisión.`,
                priority: 'info',
                actionUrl: `/traffic/drivers/${obsData.driverId}`
            });
        }
        
        return { success: true };
    } catch (error: any) {
        logger.error(`[submitTrafficObservationDocumentV1] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

export const resolveTrafficObservationV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { observationId, resolution, resolutionNote } = request.data; // resolution: 'approved' | 'rejected' | 'resolved'

    if (!observationId || !resolution) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    try {
        const callerSnap = await db.doc(`users/${uid}`).get();
        const caller = callerSnap.data() as UserProfile;
        const authInfo = await resolveCallerRoleAndCityKey(request);
        const callerRole = authInfo.role;
        const isGlobalAdmin = authInfo.isGlobalAdmin;
        const callerCityKey = authInfo.cityKey;

        const obsRef = db.doc(`traffic_observations/${observationId}`);
        const obsSnap = await obsRef.get();

        if (!obsSnap.exists) throw new HttpsError('not-found', 'Observación no encontrada.');
        const obsData = obsSnap.data() as any;

        const allowedRoles: Role[] = ['admin', 'superadmin', 'admin_municipal', 'municipal_admin', 'traffic_admin', 'traffic_municipal', 'traffic_operator', 'traffic'];
        if (!allowedRoles.includes(callerRole as Role)) {
            throw new HttpsError('permission-denied', 'No tienes permisos.');
        }
        if (!isGlobalAdmin && callerCityKey !== obsData.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes gestionar observaciones de otra jurisdicción.');
        }

        const timestamp = FieldValue.serverTimestamp();
        let finalStatus = resolution;
        let resolutionStatus = null;
        if (resolution === 'approved') {
            finalStatus = 'resolved'; // Final state is resolved
            const isLate = obsData.dueAt && Date.now() > obsData.dueAt.toMillis();
            resolutionStatus = isLate ? 'resolved_late' : 'resolved_in_time';
        }

        const isUnsuspendNeeded = obsData.affectsMatching || obsData.severity === 'critical' || obsData.autoSuspendAtDueDate === true;

        await db.runTransaction(async (transaction) => {
            const userRef = db.doc(`users/${obsData.driverId}`);
            const userSnap = await transaction.get(userRef);
            const userData = userSnap.data() as UserProfile;

            // 1. Update observation
            const updatePayload: any = {
                status: finalStatus,
                resolutionNote: resolutionNote || '',
                reviewedAt: timestamp,
                reviewedBy: uid,
                updatedAt: timestamp
            };
            if (finalStatus === 'resolved') {
                updatePayload.resolvedAt = timestamp;
                updatePayload.resolvedBy = uid;
                updatePayload.resolutionStatus = resolutionStatus;
            }
            transaction.update(obsRef, updatePayload);

            // 2. If approved/resolved and needs unsuspension
            if (finalStatus === 'resolved' && isUnsuspendNeeded && userData.trafficSuspended) {
                // Check if there are other critical open observations before lifting suspension
                // We can't query inside a transaction easily without throwing, so we assume if we resolve this, we lift the generic flag.
                // In a perfect system, we'd check `traffic_observations` where status != resolved.
                // For now, we will lift it and let the operator re-suspend if another is open.
                
                const updates: any = {
                    trafficSuspended: false,
                    trafficSuspensionReason: null,
                    trafficSuspensionResolvedAt: timestamp,
                    trafficSuspensionResolvedBy: caller.email || uid,
                };
                
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

                transaction.set(db.doc(`drivers_locations/${obsData.driverId}`), {
                    isSuspended,
                    updatedAt: timestamp
                }, { merge: true });

                const mpRef = db.doc(`municipal_profiles/${obsData.driverId}`);
                const mpSnap = await transaction.get(mpRef);
                if (mpSnap.exists) {
                    transaction.update(mpRef, {
                        ...updates,
                        isSuspended,
                        suspensionSource,
                        updatedAt: timestamp
                    });
                }
            }
        });

        // Notifications
        let title = '';
        let body = '';
        if (resolution === 'rejected') {
            title = 'Corrección Rechazada';
            body = `Tránsito rechazó tu documento. Motivo: ${resolutionNote || 'No válido'}. Volvé a subirlo.`;
        } else {
            title = 'Corrección Aprobada';
            body = `Tu documento fue aprobado por Tránsito. ${isUnsuspendNeeded ? 'Tu cuenta ha sido rehabilitada.' : 'Observación resuelta.'}`;
        }
        await sendNotification(obsData.driverId, title, body, '/', { screen: 'muni_status' }).catch(e => logger.warn(`Push failed`, e));

        await createNotification({
            userId: obsData.driverId,
            role: 'driver',
            type: resolution === 'rejected' ? 'traffic_observation_rejected' : 'traffic_observation_approved',
            title,
            message: body,
            priority: resolution === 'rejected' ? 'warning' : 'success',
            actionUrl: '/driver/muni-status'
        });

        // Notify Traffic inspector who created it
        if (obsData.createdBy) {
            await createNotification({
                userId: obsData.createdBy,
                role: obsData.createdByRole || 'traffic',
                type: 'traffic_observation_resolved',
                title: resolution === 'rejected' ? 'Documento Rechazado' : 'Documento Aprobado',
                message: `La observación del conductor ha sido ${resolution === 'rejected' ? 'rechazada' : 'aprobada y resuelta'}.`,
                priority: resolution === 'rejected' ? 'warning' : 'success',
                actionUrl: `/traffic/drivers/${obsData.driverId}`
            });
        }

        return { success: true };
    } catch (error: any) {
        logger.error(`[resolveTrafficObservationV1] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

export const checkExpiredTrafficObservations = onSchedule('every 5 minutes', async (event) => {
    const db = getDb();
    const now = FieldValue.serverTimestamp();

    try {
        const snapshot = await db.collection('traffic_observations')
            .where('status', 'in', ['awaiting_driver_response', 'open'])
            .where('dueAt', '<=', Timestamp.now())
            .get();

        if (snapshot.empty) return;

        const batch = db.batch();
        const usersToSuspend = new Set<string>();
        const notifications: {driverId: string, title: string, body: string}[] = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            batch.update(doc.ref, {
                status: 'expired',
                updatedAt: now
            });

            if (data.autoSuspendAtDueDate) {
                usersToSuspend.add(data.driverId);
            }
        }

        // Apply suspensions
        for (const driverId of usersToSuspend) {
            const userRef = db.doc(`users/${driverId}`);
            const locRef = db.doc(`drivers_locations/${driverId}`);
            const mpRef = db.doc(`municipal_profiles/${driverId}`);

            const userSnap = await userRef.get();
            if (userSnap.exists) {
                const userData = userSnap.data() as UserProfile;
                
                batch.update(userRef, {
                    trafficSuspended: true,
                    isSuspended: true,
                    suspensionSource: 'traffic',
                    trafficSuspensionReason: 'Plazo vencido para entregar documentación solicitada',
                    trafficSuspendedAt: now,
                    updatedAt: now
                });
                batch.set(locRef, {
                    isSuspended: true,
                    updatedAt: now
                }, { merge: true });
                batch.update(mpRef, {
                    trafficSuspended: true,
                    isSuspended: true,
                    suspensionSource: 'traffic',
                    updatedAt: now
                });

                notifications.push({
                    driverId: driverId,
                    title: 'Plazo vencido - Suspensión preventiva',
                    body: 'Tu plazo para presentar la corrección ha vencido. Tránsito ha inhabilitado tu cuenta operativamente hasta que regularices tu estado.'
                });
            }
        }

        await batch.commit();

        for (const notif of notifications) {
            await sendNotification(notif.driverId, notif.title, notif.body, '/', { screen: 'muni_status' }).catch(() => {});
            await createNotification({
                userId: notif.driverId,
                role: 'driver',
                type: 'traffic_observation_expired',
                title: notif.title,
                message: notif.body,
                priority: 'critical',
                actionUrl: '/driver/muni-status'
            });
        }

        logger.info(`[checkExpiredTrafficObservations] Processed ${snapshot.size} expired observations, suspended ${usersToSuspend.size} drivers.`);

    } catch (error) {
        logger.error(`[checkExpiredTrafficObservations] Error:`, error);
    }
});
