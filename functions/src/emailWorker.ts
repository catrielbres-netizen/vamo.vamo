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

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { enqueueTransactionalEmailV1 } from './lib/emails';

export const launchCommunicationsV1 = onSchedule("0 10 * * *", async (event) => {
    functions.logger.info("[LAUNCH_EMAILS] Starting daily check for city launches...");
    
    const now = new Date();
    // Normalizar a inicio del dia (00:00) para calcular dias de diferencia precisos
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const citiesSnap = await db.collection('cities')
        .where('operationalStatus', 'in', ['recruiting_drivers', 'draft'])
        .get();

    if (citiesSnap.empty) {
        functions.logger.info("[LAUNCH_EMAILS] No cities found in recruiting/draft state.");
        return;
    }

    for (const cityDoc of citiesSnap.docs) {
        const cityData = cityDoc.data();
        const cityKey = cityDoc.id;
        const launchDateStr = cityData.driverRecruitment?.estimatedLaunchDate;
        
        if (!launchDateStr) continue;

        const launchDate = new Date(launchDateStr);
        // Ajustar launchDate a 00:00
        const launchDay = new Date(launchDate.getFullYear(), launchDate.getMonth(), launchDate.getDate());
        
        const diffTime = launchDay.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0 || diffDays > 2) {
            // No action needed for this city today
            continue;
        }

        functions.logger.info(`[LAUNCH_EMAILS] City ${cityKey} is launching in ${diffDays} days.`);

        // Find users for this city
        const usersSnap = await db.collection('users')
            .where('cityKey', '==', cityKey)
            .get();

        if (usersSnap.empty) {
            functions.logger.info(`[LAUNCH_EMAILS] No users found for city ${cityKey}.`);
        } else {
            for (const userDoc of usersSnap.docs) {
                const userData = userDoc.data();
                if (!userData.email) continue;
                
                const role = userData.role === 'driver' ? 'driver' : 'passenger';
                const stage = `${diffDays}d`; // '2d', '1d', '0d'
                const dedupeKey = `launch_${cityKey}_${userDoc.id}_minus_${stage}`;
                
                let templateName = '';
                let subject = '';

                if (role === 'passenger') {
                    if (diffDays === 2) { templateName = 'passenger_launch_minus_2d'; subject = 'Faltan 2 días para VamO en tu ciudad'; }
                    if (diffDays === 1) { templateName = 'passenger_launch_minus_1d'; subject = 'Mañana empezamos: VamO en tu ciudad'; }
                    if (diffDays === 0) { templateName = 'passenger_launch_0d'; subject = '¡VamO ya está activo!'; }
                } else {
                    if (diffDays === 2) { templateName = 'driver_launch_minus_2d'; subject = 'Faltan 2 días: prepará tu cuenta'; }
                    if (diffDays === 1) { templateName = 'driver_launch_minus_1d'; subject = 'Mañana empiezan los viajes en VamO'; }
                    if (diffDays === 0) { templateName = 'driver_launch_0d'; subject = '¡Ya podés conectarte a VamO!'; }
                }

                if (!templateName) continue;

                // Encolar email
                await enqueueTransactionalEmailV1({
                    to: userData.email,
                    template: templateName,
                    subject: subject,
                    data: { name: userData.name || userData.displayName || 'Usuario' },
                    dedupeKey: dedupeKey
                });
            }
        }

        // Si es el día 0, activar la ciudad automáticamente
        if (diffDays === 0) {
            functions.logger.info(`[LAUNCH_EMAILS] Activating city ${cityKey} automatically.`);
            await cityDoc.ref.update({
                operationalStatus: 'active',
                'passengerAccess.enabled': true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    functions.logger.info("[LAUNCH_EMAILS] Finished processing city launches.");
});
