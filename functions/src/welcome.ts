import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { INCENTIVE_CONFIG } from "./lib/incentives";
import { addFunds } from "./lib/wallet";

const nodemailer = require('nodemailer');

/**
 * [VamO PRO] Email Transporter
 * Configura esto en Firebase Functions Secrets o Env
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Automáticamente envía un email de bienvenida y verificación cuando se crea el perfil.
 */
export const onUserCreatedWelcomeEmailV1 = onDocumentCreated("users/{userId}", async (event) => {
    const data = event.data?.data();
    if (!data || !data.email) return;

    logger.info(`[WELCOME_SYSTEM] New user detected: ${data.email} (${data.role})`);

    const isDriver = data.role === 'driver';
    const userName = data.name || 'Usuario';
    const email = data.email;

    try {
        if (!process.env.SMTP_USER) {
            logger.warn(`[WELCOME_SYSTEM] SMTP_USER no definido. No se enviará email real (Simulación exitosa).`);
            return;
        }

        // Generate verification link for new users
        const baseUrl = process.env.VAMO_BASE_URL || 'https://vamoapp.online';
        const verificationLink = await admin.auth().generateEmailVerificationLink(email, {
            url: `${baseUrl}/dashboard`,
        });

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; background-color: #0c0c0c; margin: 0; padding: 0; color: #ffffff; }
                .container { max-width: 600px; margin: 40px auto; background: #1a1a1a; border-radius: 32px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
                .header { padding: 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
                .logo { font-size: 32px; font-weight: 900; letter-spacing: -1.5px; color: #ffffff; margin: 0; }
                .content { padding: 50px 40px; }
                .title { font-size: 24px; font-weight: 900; margin-bottom: 16px; letter-spacing: -0.5px; }
                .text { font-size: 16px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
                .button { display: inline-block; padding: 18px 36px; background: #ffffff; color: #000000 !important; text-decoration: none; border-radius: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; font-size: 13px; transition: all 0.2s; }
                .footer { padding: 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); }
                .footer-text { font-size: 12px; color: #52525b; line-height: 1.5; font-weight: 500; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 class="logo">VamO</h1>
                </div>
                <div class="content">
                    <h2 class="title">Hola, ${userName}</h2>
                    <p class="text">Bienvenido a VamO.</p>
                    <p class="text">Para comenzar a usar la aplicación, necesitás verificar tu correo electrónico.</p>
                    
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="${verificationLink}" class="button">Verificar cuenta</a>
                    </div>

                    <p class="text" style="font-size: 13px; color: #52525b;">Si no creaste esta cuenta, podés ignorar este mensaje.</p>
                </div>
                <div class="footer">
                    <p class="footer-text">
                        —<br>
                        <b>VamO</b><br>
                        Movilidad inteligente para tu ciudad
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;

        await transporter.sendMail({
            from: '"VamO" <soporte@vamo.com.ar>',
            to: email,
            subject: 'Verificá tu cuenta en VamO',
            html: htmlContent
        });
        logger.info(`[WELCOME_SYSTEM] Sent to ${email} with verification link.`);
    } catch (error) {
        logger.error(`[WELCOME_SYSTEM] Error:`, error);
    }
});

/**
 * Inicializa a un nuevo pasajero con su bono de bienvenida.
 * Entra como promoBalance en la Billetera VamO.
 */
export const initializePassengerWelcomeV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const db = getDb();
    const userId = request.auth.uid;

    try {
        const userRef = db.doc(`users/${userId}`);
        
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists) return { error: 'User not found' };
            
            const userData = snap.data();
            // Evitar duplicidad (Idempotencia)
            if (userData?.promoCreditGranted) return { alreadyGranted: true };

            // 1. Acreditar Bono en Billetera (promoBalance) con ID DETERMINISTICO
            await addFunds(
                userId, 
                INCENTIVE_CONFIG.FIRST_RIDE_BONUS, 
                'welcome_bonus', 
                '🎁 ¡Bienvenido a VamO! Bonus de regalo', 
                tx,
                `welcome_${userId}`
            );

            logger.info(`[INCENTIVES_DEBUG] welcome bonus granted to user ${userId}`);

            // 2. Marcar perfil para no repetir
            tx.update(userRef, { promoCreditGranted: true });

            return { success: true };
        });

        if (result.alreadyGranted) return { success: true, message: 'Welcome bonus already active.' };
        if (result.error) throw new HttpsError('not-found', result.error);

        logger.info(`[WELCOME] Granted $${INCENTIVE_CONFIG.FIRST_RIDE_BONUS} welcome bonus to user ${userId}`);
        return { success: true, message: 'Welcome package active in wallet!' };

    } catch (error: any) {
        logger.error(`[WELCOME] Fatal error user ${userId}:`, error);
        throw new HttpsError('internal', `Error en bienvenida: ${error.message}`);
    }
});

/**
 * Inicializa a un nuevo CONDUCTOR con su bono de bienvenida de $2000.
 * Este saldo va directo a currentBalance para que pueda pagar comisiones.
 */
export const initializeDriverWelcomeV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const db = getDb();
    const userId = request.auth.uid;
    const WELCOME_BONUS_AMOUNT = 2000;

    try {
        const userRef = db.doc(`users/${userId}`);
        
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists) return { error: 'User not found' };
            
            const userData = snap.data() as any;
            if (userData.role !== 'driver') return { error: 'User is not a driver' };
            
            // Evitar duplicidad (Idempotencia)
            if (userData.promoCreditGranted) return { alreadyGranted: true };

            // 1. Acreditar Bono en Billetera Unificada (Stage 2A)
            // addFunds se encarga de actualizar wallets.cashBalance, wallet_transactions
            // y mantener el espejo en users.currentBalance para la UI.
            await addFunds(
                userId,
                WELCOME_BONUS_AMOUNT,
                'welcome_bonus',
                '🎁 Bono de Bienvenida VamO (Crédito para Comisiones)',
                tx,
                `welcome_driver_${userId}`
            );

            tx.update(userRef, { 
                promoCreditGranted: true,
                updatedAt: FieldValue.serverTimestamp()
            });

            return { success: true };

            return { success: true };
        });

        if (result.alreadyGranted) return { success: true, message: 'Welcome bonus already active.' };
        if (result.error) throw new HttpsError('invalid-argument', result.error);

        logger.info(`[WELCOME_DRIVER] Granted $${WELCOME_BONUS_AMOUNT} welcome bonus to driver ${userId}`);
        return { success: true, message: '¡Bono de bienvenida acreditado!' };

    } catch (error: any) {
        logger.error(`[WELCOME_DRIVER] Fatal error user ${userId}:`, error);
        throw new HttpsError('internal', `Error en bienvenida conductor: ${error.message}`);
    }
});
