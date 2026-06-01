import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { getDb } from './firebaseAdmin';

export interface CreateNotificationParams {
    userId: string;
    role: 'passenger' | 'driver';
    type: string;
    title: string;
    message: string;
    priority?: 'info' | 'success' | 'warning' | 'critical';
    actionUrl?: string;
    rideId?: string;
    movementId?: string;
    chatId?: string;
}

export async function createNotification(params: CreateNotificationParams) {
    try {
        const db = getDb();
        const notificationRef = db.collection(`notifications/${params.userId}/items`).doc();
        
        const data = {
            id: notificationRef.id,
            userId: params.userId,
            role: params.role,
            type: params.type,
            title: params.title,
            message: params.message,
            priority: params.priority || 'info',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(params.actionUrl && { actionUrl: params.actionUrl }),
            ...(params.rideId && { rideId: params.rideId }),
            ...(params.movementId && { movementId: params.movementId }),
            ...(params.chatId && { chatId: params.chatId })
        };

        await notificationRef.set(data);
        logger.info(`[NOTIFICATION_CREATED] User: ${params.userId}, Type: ${params.type}`);
    } catch (error: any) {
        logger.error(`[CREATE_NOTIFICATION_ERROR]`, error.message);
    }
}
