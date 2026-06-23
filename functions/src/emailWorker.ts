import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { MailQueueDocument, EmailTemplates, sendEmailWithResend } from './lib/emails';

const db = admin.firestore();

export const processMailQueueV1 = functions
    .runWith({ secrets: ['RESEND_API_KEY'] })
    .firestore
    .document('mail_queue/{docId}')
    .onCreate(async (snap, context) => {
        const docId = context.params.docId;
        const data = snap.data() as MailQueueDocument;

        // Limitar ejecución en Fase 1 (solo procesar si está pendiente y no superó intentos)
        if (data.status !== 'pending') {
            functions.logger.info(`[MAIL_QUEUE] Document ${docId} skipped: status is ${data.status}`);
            return;
        }

        // Check dedupeKey
        if (data.dedupeKey) {
            const existingQuery = await db.collection('mail_queue')
                .where('dedupeKey', '==', data.dedupeKey)
                .where('status', 'in', ['sent', 'processing'])
                .limit(1)
                .get();

            if (!existingQuery.empty && existingQuery.docs[0].id !== docId) {
                functions.logger.warn(`[MAIL_QUEUE] Duplicate found for dedupeKey: ${data.dedupeKey}`);
                await snap.ref.update({
                    status: 'skipped_duplicate',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return;
            }
        }

        // Prevent infinite loops / max attempts
        const attempts = data.attempts || 0;
        if (attempts >= 3) {
            await snap.ref.update({ status: 'failed', error: 'Max attempts reached' });
            return;
        }

        // Marcar como processing
        await snap.ref.update({
            status: 'processing',
            attempts: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        try {
            const templateGenerator = EmailTemplates[data.template];
            if (!templateGenerator) {
                throw new Error(`Template not found: ${data.template}`);
            }

            const html = templateGenerator(data.data || {});
            
            // Enviar con Resend
            const providerMessageId = await sendEmailWithResend({
                to: data.to,
                subject: data.subject || 'VamO Notificación',
                html
            });

            // Marcar como sent
            await snap.ref.update({
                status: 'sent',
                providerMessageId,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            functions.logger.info(`[MAIL_QUEUE] Successfully sent email ${docId} to ${data.to}`);

        } catch (error: any) {
            functions.logger.error(`[MAIL_QUEUE] Error sending email ${docId}:`, error);
            await snap.ref.update({
                status: 'failed',
                error: error.message || 'Unknown error',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
