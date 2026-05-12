import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { Ride, UserProfile, PanicAlert } from "./types";
import { sendNotification } from "./handlers";

/**
 * [VamO SAFETY] Trigger Panic Alert.
 * Atomically records an emergency and notifies the control center.
 */
export const triggerPanicAlertV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { rideId, role, location } = request.data;
    const cityKeyOverride = request.data.cityKey; // Optional override from client

    logger.info(`🚨 [PANIC_TRIGGER] Iniciando alerta. User: ${uid}, Role: ${role}, Ride: ${rideId}`);

    if (!rideId || typeof rideId !== 'string') {
        logger.warn(`[PANIC_GUARD] Intentó disparar pánico sin rideId válido. User: ${uid}`);
        throw new HttpsError('failed-precondition', 'No se pudo enviar alerta. Verificá que el viaje esté activo.');
    }

    if (!role || !['passenger', 'driver'].includes(role)) {
        throw new HttpsError('invalid-argument', 'Rol inválido o ausente en la alerta.');
    }

    try {
        // 1. Get Ride Data to identify City and involved parties
        const rideSnap = await db.doc(`rides/${rideId}`).get();
        if (!rideSnap.exists) {
            throw new HttpsError('not-found', 'Viaje no encontrado. La alerta se registrará de forma aislada.');
        }
        const rideData = rideSnap.data() as Ride;
        const cityKey = rideData.cityKey || 'unknown';

        // 2. Create the Panic Alert Document
        const alertId = `PANIC_${Date.now()}_${uid}`;
        const panicData: Partial<PanicAlert> = {
            id: alertId,
            rideId,
            driverId: rideData.driverId || 'unknown',
            passengerId: rideData.passengerId,
            location: location || { lat: 0, lng: 0 },
            triggeredByRole: role as 'passenger' | 'driver',
            triggeredByUserId: uid,
            rideStatus: rideData.status,
            resolved: false,
            cityKey: cityKey,
            createdAt: FieldValue.serverTimestamp(),
        };

        await db.collection('panic_alerts').doc(alertId).set(panicData);
        logger.error(`🚨 [PANIC_ALERT] Emergency triggered in city ${cityKey}! Ride: ${rideId}. User: ${uid}`);

        // 3. Update Ride status to 'escalated' (Optional/Audit)
        await db.doc(`rides/${rideId}`).update({
            isEscalated: true,
            updatedAt: FieldValue.serverTimestamp()
        }).catch(e => logger.warn(`Could not flag ride ${rideId} as escalated`, e));

        // 4. Notify Control Center (Muni Admins and Traffic Operators)
        try {
            const muniUsersSnap = await db.collection('users')
                .where('cityKey', '==', cityKey)
                .where('role', 'in', ['admin_municipal', 'traffic_municipal'])
                .get();

            const globalAdminsSnap = await db.collection('users')
                .where('role', '==', 'admin')
                .get();

            const alertTitle = `🚨 EMERGENCIA: ${role.toUpperCase()}`;
            const alertBody = `Alerta de pánico activada en viaje ${rideId}. Ubicación disponible.`;
            const mapsLink = location ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : 'Ubicación no disponible';
            const externalMessage = `🚨 ALERTA DE EMERGENCIA VamO: ${(request.auth as any).token.name || 'Un usuario'} activó el botón antipánico durante un viaje. Ubicación: ${mapsLink}. Viaje: ${rideId}. Contactá asistencia inmediatamente.`;

            // Merge all recipients
            const recipients = new Set<string>();
            muniUsersSnap.forEach(doc => recipients.add(doc.id));
            globalAdminsSnap.forEach(doc => recipients.add(doc.id));

            if (recipients.size > 0) {
                const notifyPromises = Array.from(recipients).map(targetUid => {
                    return sendNotification(
                        targetUid, 
                        alertTitle, 
                        alertBody, 
                        role === 'driver' ? `/admin/driver-detail?id=${uid}` : `/admin/alerts`,
                        { type: 'PANIC_ALERT', rideId, alertId, externalMessage }
                    ).catch(e => logger.warn(`[PANIC_NOTIFY_ERROR] No se pudo notificar al operador ${targetUid}:`, e));
                });
                await Promise.all(notifyPromises);
                logger.info(`[PANIC_SYSTEM] Notified ${recipients.size} platform operators.`);
            }

            // 4.1 Notify Security Contacts (External Notification Logging)
            const userSnap = await db.collection('users').doc(uid).get();
            const userData = userSnap.data() as UserProfile;
            const contacts = userData.emergencyContacts || [];

            if (contacts.length > 0) {
                logger.info(`[PANIC_SECURITY_CONTACTS] User has ${contacts.length} emergency contacts. Recording for manual or future SMS/WA dispatch.`);
                // In this version, we record the message in the alert document so operators can send it manually via WhatsApp
                // or a background worker can pick it up if an SMS gateway is integrated.
                await db.collection('panic_alerts').doc(alertId).update({
                    emergencyContacts: contacts,
                    preparedEmergencyMessage: externalMessage
                });
            }

        } catch (queryError: any) {
            // CRITICAL: If the index is missing or query fails, we still want the panic alert to succeed!
            logger.error(`[PANIC_QUERY_ERROR] Error al buscar operadores para notificar. ¿Falta índice?`, queryError);
        }

        // 5. High-Priority Platform Log
        await db.collection('platform_logs').add({
            type: 'EMERGENCY_PANIC',
            severity: 'CRITICAL',
            rideId,
            cityKey,
            triggeredBy: uid,
            role,
            location,
            preparedEmergencyMessage: `ALERTA VamO: Emergencia en viaje ${rideId}`,
            createdAt: FieldValue.serverTimestamp()
        });

        return { success: true, alertId };

    } catch (error: any) {
        logger.error(`[PANIC_FATAL_ERROR] Fallo crítico al procesar pánico (Ride: ${rideId}):`, {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Si ya es un HttpsError (como el not-found), lo lanzamos tal cual para que el cliente vea el error real
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', `Error interno en el servidor de seguridad: ${error.message || 'Desconocido'}`);
    }
});

/**
 * [VamO SAFETY] Resolve Panic Alert.
 * Marks an emergency as handled by an operator.
 */
export const resolvePanicAlertV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;
    const { alertId } = request.data;

    if (!alertId) {
        throw new HttpsError('invalid-argument', 'Se requiere el ID de la alerta para resolverla.');
    }

    try {
        const callerSnap = await db.doc(`users/${uid}`).get();
        const caller = callerSnap.data() as UserProfile;

        // Security: Only admins or safety operators
        const allowedRoles = ['admin', 'admin_municipal', 'traffic_municipal'];
        if (!allowedRoles.includes(caller.role)) {
            throw new HttpsError('permission-denied', 'No tienes permisos para resolver alertas de emergencia.');
        }

        const alertRef = db.collection('panic_alerts').doc(alertId);
        const alertSnap = await alertRef.get();

        if (!alertSnap.exists) {
            throw new HttpsError('not-found', 'La alerta no existe.');
        }

        await alertRef.update({
            resolved: true,
            resolvedAt: FieldValue.serverTimestamp(),
            resolvedBy: uid,
            resolvedByName: caller.name || 'Operador'
        });

        logger.info(`✅ [PANIC_RESOLVED] Alert ${alertId} resolved by ${uid} (${caller.role}).`);

        return { success: true };

    } catch (error: any) {
        logger.error(`[PANIC_RESOLVE_ERROR] Failed to resolve alert ${alertId}:`, error);
        throw new HttpsError('internal', 'Error al cerrar el incidente.');
    }
});
