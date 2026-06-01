import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { Ride, UserProfile, RideChatMessage, RideChatSummary } from "./types";

import { getDb } from "./lib/firebaseAdmin";

// Module-level db removed.

/**
 * [VamO PRO v1.0] Enviar mensaje de chat vinculado a un viaje
 */
export const sendRideMessageV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const { rideId, text } = request.data;
    if (!rideId || !text || text.trim() === '') {
        throw new HttpsError('invalid-argument', 'Datos de mensaje inválidos.');
    }

    const senderId = request.auth.uid;
    const sanitizedText = text.trim().substring(0, 500); // Límite de 500 caracteres

    try {
        const db = getDb();
        const result = await db.runTransaction(async (tx: admin.firestore.Transaction) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);

            if (!rideSnap.exists) throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data() as Ride;

            // 1. VALIDACIÓN: Participante
            const isPassenger = rideData.passengerId === senderId;
            const isDriver = rideData.driverId === senderId;

            if (!isPassenger && !isDriver) {
                throw new Error('No tienes permiso para enviar mensajes en este viaje.');
            }

            // 2. VALIDACIÓN: Estado del chat
            const writableStates = ['driver_assigned', 'driver_arrived', 'in_progress', 'paused'];
            if (!writableStates.includes(rideData.status)) {
                throw new Error('El chat está cerrado para este viaje.');
            }

            const senderRole = isPassenger ? 'passenger' : 'driver';
            const recipientId = isPassenger ? rideData.driverId : rideData.passengerId;

            if (!recipientId) {
                throw new Error('Esperando a que un conductor sea asignado.');
            }

            // 3. CREAR MENSAJE
            const messageRef = rideRef.collection('messages').doc();
            const newMessage: RideChatMessage = {
                id: messageRef.id,
                rideId,
                senderId,
                senderRole,
                text: sanitizedText,
                createdAt: FieldValue.serverTimestamp(),
                type: 'text',
                status: 'sent'
            };

            tx.set(messageRef, newMessage);

            // 4. ACTUALIZAR SUMMARY DEL RIDE
            const currentSummary: RideChatSummary = rideData.chatSummary || {
                unreadCountPassenger: 0,
                unreadCountDriver: 0,
                chatAuditEligible: true,
                chatEnabled: true
            };

            const updatedSummary: RideChatSummary = {
                ...currentSummary,
                unreadCountPassenger: isDriver ? ((currentSummary.unreadCountPassenger || 0) + 1) : (currentSummary.unreadCountPassenger || 0),
                unreadCountDriver: isPassenger ? ((currentSummary.unreadCountDriver || 0) + 1) : (currentSummary.unreadCountDriver || 0),
                lastMessageText: text.substring(0, 50),
                lastMessageAt: FieldValue.serverTimestamp(),
                lastMessageSenderId: senderId,
                chatEnabled: true
            };

            tx.update(rideRef, { chatSummary: updatedSummary });

            return { 
                senderRole, 
                recipientId, 
                senderName: isPassenger ? (rideData.passengerName || 'Pasajero') : (rideData.driverName || 'Conductor') 
            };
        });

        // 5. NOTIFICACIÓN PUSH (Fuera de la transacción para evitar lentitud)
        if (result && result.recipientId) {
            // Importación dinámica para evitar dependencia circular si existe
            const { sendNotification } = require('./handlers');
            const { createNotification } = require('./lib/notifications');
            const deepLink = result.senderRole === 'passenger' 
                ? `/driver/rides?activeRideId=${rideId}&openChat=true` 
                : `/dashboard/ride?rideId=${rideId}&openChat=true`;

            await sendNotification(
                result.recipientId,
                `Mensaje de ${result.senderName}`,
                sanitizedText,
                deepLink,
                { event: 'NEW_CHAT_MESSAGE', rideId, openChat: 'true' }
            );

            await createNotification({
                userId: result.recipientId,
                role: result.senderRole === 'passenger' ? 'driver' : 'passenger',
                type: 'new_message',
                title: `Mensaje de ${result.senderName}`,
                message: sanitizedText,
                priority: 'info',
                actionUrl: deepLink,
                rideId
            });
        }

        return { success: true };
    } catch (error: any) {
        logger.error(`[sendRideMessageV1] Error:`, error.message);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * [VamO PRO v1.0] Marcar mensajes como leídos
 */
export const markRideMessagesReadV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const { rideId } = request.data;
    if (!rideId) throw new HttpsError('invalid-argument', 'Falta rideId.');

    const userId = request.auth.uid;

    try {
        const db = getDb();
        await db.runTransaction(async (tx: admin.firestore.Transaction) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);

            if (!rideSnap.exists) throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data() as Ride;

            if (!rideData.chatSummary) return;

            const isPassenger = rideData.passengerId === userId;
            const isDriver = rideData.driverId === userId;

            if (!isPassenger && !isDriver) return;

            const updates: any = {};
            if (isPassenger) {
                updates['chatSummary.unreadCountPassenger'] = 0;
            } else {
                updates['chatSummary.unreadCountDriver'] = 0;
            }

            tx.update(rideRef, updates);
        });

        return { success: true };
    } catch (error: any) {
        logger.error(`[markRideMessagesReadV1] Error:`, error.message);
        throw new HttpsError('internal', error.message);
    }
});
