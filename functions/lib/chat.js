"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.markRideMessagesReadV1 = exports.sendRideMessageV1 = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firebaseAdmin_1 = require("./lib/firebaseAdmin");
// Module-level db removed.
/**
 * [VamO PRO v1.0] Enviar mensaje de chat vinculado a un viaje
 */
exports.sendRideMessageV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const { rideId, text } = request.data;
    if (!rideId || !text || text.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'Datos de mensaje inválidos.');
    }
    const senderId = request.auth.uid;
    const sanitizedText = text.trim().substring(0, 500); // Límite de 500 caracteres
    try {
        const db = (0, firebaseAdmin_1.getDb)();
        const result = await db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists)
                throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data();
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
            const newMessage = {
                id: messageRef.id,
                rideId,
                senderId,
                senderRole,
                text: sanitizedText,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                type: 'text',
                status: 'sent'
            };
            tx.set(messageRef, newMessage);
            // 4. ACTUALIZAR SUMMARY DEL RIDE
            const currentSummary = rideData.chatSummary || {
                unreadCountPassenger: 0,
                unreadCountDriver: 0,
                chatAuditEligible: true,
                chatEnabled: true
            };
            const updatedSummary = {
                ...currentSummary,
                lastMessageText: sanitizedText,
                lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessageSenderId: senderId,
                unreadCountPassenger: isDriver ? (currentSummary.unreadCountPassenger + 1) : currentSummary.unreadCountPassenger,
                unreadCountDriver: isPassenger ? (currentSummary.unreadCountDriver + 1) : currentSummary.unreadCountDriver,
            };
            tx.update(rideRef, { chatSummary: updatedSummary });
            return { senderRole, recipientId, senderName: isPassenger ? (rideData.passengerName || 'Pasajero') : (rideData.driverName || 'Conductor') };
        });
        // 5. NOTIFICACIÓN PUSH (Fuera de la transacción para evitar lentitud)
        if (result && result.recipientId) {
            // Importación dinámica para evitar dependencia circular si existe
            const { sendNotification } = require('./handlers');
            await sendNotification(result.recipientId, `Mensaje de ${result.senderName}`, sanitizedText, result.senderRole === 'passenger' ? '/driver' : `/dashboard/ride`, { event: 'NEW_CHAT_MESSAGE', rideId });
        }
        return { success: true };
    }
    catch (error) {
        logger.error(`[sendRideMessageV1] Error:`, error.message);
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * [VamO PRO v1.0] Marcar mensajes como leídos
 */
exports.markRideMessagesReadV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }
    const { rideId } = request.data;
    if (!rideId)
        throw new https_1.HttpsError('invalid-argument', 'Falta rideId.');
    const userId = request.auth.uid;
    try {
        const db = (0, firebaseAdmin_1.getDb)();
        await db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists)
                throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data();
            if (!rideData.chatSummary)
                return;
            const isPassenger = rideData.passengerId === userId;
            const isDriver = rideData.driverId === userId;
            if (!isPassenger && !isDriver)
                return;
            const updates = {};
            if (isPassenger) {
                updates['chatSummary.unreadCountPassenger'] = 0;
            }
            else {
                updates['chatSummary.unreadCountDriver'] = 0;
            }
            tx.update(rideRef, updates);
        });
        return { success: true };
    }
    catch (error) {
        logger.error(`[markRideMessagesReadV1] Error:`, error.message);
        throw new https_1.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=chat.js.map