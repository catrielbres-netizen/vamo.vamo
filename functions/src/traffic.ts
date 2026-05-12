import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { UserProfile, Role } from "./types";
import { logMunicipalAction, MunicipalAction } from "./lib/audit";
import { sendNotification } from "./handlers";

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

    const cityKey = caller.cityKey;
    if (!cityKey) throw new HttpsError('permission-denied', 'El usuario no tiene una ciudad asignada.');

    // Security check: must be admin or traffic/muni role
    const allowedRoles: Role[] = ['admin', 'admin_municipal', 'traffic_municipal', 'auditor_municipal'];
    if (!allowedRoles.includes(caller.role)) {
        throw new HttpsError('permission-denied', 'No tienes permiso para ver estadísticas de tránsito.');
    }

    try {
        const driversRef = db.collection('users').where('role', '==', 'driver').where('cityKey', '==', cityKey);
        
        // In a real high-scale scenario, we'd use a counter document.
        // For current scale, we use query counts.
        const now = Timestamp.now();
        const [total, active, pending, suspended, expired] = await Promise.all([
            driversRef.count().get(),
            driversRef.where('municipalStatus', 'in', ['active', 'municipal_approved']).count().get(),
            driversRef.where('municipalStatus', 'in', ['pending_municipal_review', 'municipal_observed', 'renewal_under_review']).count().get(),
            driversRef.where('municipalStatus', 'in', ['suspended_expired_license', 'suspended_expired_insurance', 'suspended_unpaid_canon', 'suspended_by_municipality', 'rejected_by_municipality']).count().get(),
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
    const cityKey = caller.cityKey;

    if (!cityKey && caller.role !== 'admin') throw new HttpsError('permission-denied', 'No autorizado.');

    let q = db.collection('users')
        .where('role', '==', 'driver');
    
    if (caller.role !== 'admin') {
        q = q.where('cityKey', '==', cityKey);
    }

    if (status) {
        if (status === 'active') {
            q = q.where('municipalStatus', 'in', ['active', 'municipal_approved']);
        } else if (status === 'pending') {
            q = q.where('municipalStatus', 'in', ['pending_municipal_review', 'municipal_observed', 'renewal_under_review']);
        } else if (status === 'suspended') {
            q = q.where('municipalStatus', 'in', ['suspended_expired_license', 'suspended_expired_insurance', 'suspended_unpaid_canon', 'suspended_by_municipality', 'rejected_by_municipality']);
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
        }
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
            approved: data.approved
            // EXCLUIDOS: currentBalance, nonWithdrawableBalance, vamoPoints, referredByCode, stats
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

    const targetSnap = await db.doc(`users/${targetUid}`).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'Conductor no encontrado.');
    const target = targetSnap.data() as UserProfile;

    // Security check
    if (caller.role !== 'admin' && (caller.role !== 'admin_municipal' && caller.role !== 'traffic_municipal')) {
        throw new HttpsError('permission-denied', 'No tienes permisos para cambiar estados municipales.');
    }

    if (caller.role !== 'admin' && caller.cityKey !== target.cityKey) {
        throw new HttpsError('permission-denied', 'No puedes gestionar conductores de otra ciudad.');
    }

    await db.doc(`users/${targetUid}`).update({
        municipalStatus: newStatus,
        municipalStatusUpdatedAt: FieldValue.serverTimestamp(),
        municipalStatusReason: reason || '',
        updatedAt: FieldValue.serverTimestamp()
    });

    // AUDIT LOG
    await logMunicipalAction({
        cityKey: target.cityKey || 'unknown',
        actorUid: uid,
        actorName: caller.name || 'Admin',
        actorEmail: caller.email || '',
        actorRole: caller.role,
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

        const targetSnap = await db.doc(`users/${targetUid}`).get();
        if (!targetSnap.exists) throw new HttpsError('not-found', 'Conductor no encontrado.');
        const target = targetSnap.data() as UserProfile;

        // Security check: admin or traffic_municipal
        const allowedRoles: Role[] = ['admin', 'admin_municipal', 'traffic_municipal'];
        if (!allowedRoles.includes(caller.role)) {
            throw new HttpsError('permission-denied', 'No tienes permisos para solicitar documentos.');
        }

        if (caller.role !== 'admin' && caller.cityKey !== target.cityKey) {
            throw new HttpsError('permission-denied', 'No puedes gestionar conductores de otra ciudad.');
        }

        const requestId = `REQ_${Date.now()}`;
        const requestData = {
            requestId,
            documentType,
            reason: reason || 'Documentación requerida por el área de Tránsito.',
            requestedBy: uid,
            requestedByRole: caller.role,
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
                cityKey: target.cityKey || caller.cityKey || 'unknown',
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
            cityKey: target.cityKey || caller.cityKey || 'unknown',
            actorUid: uid,
            actorName: caller.name || 'Inspector',
            actorEmail: caller.email || '',
            actorRole: caller.role,
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
