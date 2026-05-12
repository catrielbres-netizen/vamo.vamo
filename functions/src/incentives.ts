import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { Referral, UserProfile } from "./types";
import { INCENTIVE_CONFIG } from "./lib/incentives";

/**
 * Permite a un usuario ingresar un código de referido.
 * Vincula al nuevo usuario con el que lo invitó.
 * INCLUYE LOGICA ANTI-FRAUDE.
 */
// HANDLER COMPARTIDO PARA REFERIDOS
async function handleReferralCodeSubmit(request: any) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const { code, referralCode } = request.data;
    const inputCode = (code || referralCode || '').trim().toUpperCase(); 
    
    if (!inputCode) throw new HttpsError('invalid-argument', 'El código es obligatorio.');

    const db = getDb();
    const userId = request.auth.uid;

    try {
        const referrerQuery = await db.collection('users')
            .where('referralCode', '==', inputCode)
            .limit(1)
            .get();

        if (referrerQuery.empty) throw new Error('Código de referido inválido.');

        const referrerDoc = referrerQuery.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data() as UserProfile;

        if (referrerId === userId) throw new Error('No puedes referirte a ti mismo.');

        const userSnap = await db.doc(`users/${userId}`).get();
        if (!userSnap.exists) throw new Error('Usuario no encontrado.');
        const userData = userSnap.data() as UserProfile;

        // Comprobación de identidad básica (Mismo Teléfono)
        if (userData.phone && referrerData.phone && userData.phone === referrerData.phone) {
            throw new Error('Fraude detectado: Misma identidad telefónica.');
        }

        // Comprobación de historial
        if ((userData.stats?.ridesCompleted || 0) > 0) {
            throw new Error('Solo los usuarios nuevos pueden usar códigos de referido.');
        }

        const existingReferral = await db.collection('referrals')
            .where('referredId', '==', userId)
            .get();

        if (!existingReferral.empty) throw new Error('Ya has ingresado un código de referido anteriormente.');

        const referral: Omit<Referral, 'id'> = {
            referrerId,
            referredId: userId,
            status: 'pending',
            rewardAmountReferrer: INCENTIVE_CONFIG.REFERRAL_REWARD,
            rewardAmountReferred: INCENTIVE_CONFIG.REFERRAL_REWARD,
            createdAt: FieldValue.serverTimestamp()
        };

        await db.collection('referrals').add(referral);
        logger.info(`[REFERRALS] User ${userId} referred by ${referrerId}`);
        
        return { success: true, message: '¡Código vinculado con éxito!' };
    } catch (error: any) {
        logger.error(`[REFERRALS] Error:`, error.message);
        throw new HttpsError('internal', error.message);
    }
}

export const applyReferralCodeV1 = onCall({ cors: true, region: 'us-central1' }, handleReferralCodeSubmit);
export const submitReferralCodeV1 = onCall({ cors: true, region: 'us-central1' }, handleReferralCodeSubmit);

/**
 * Función que permite al usuario consultar su balance y su propio código para compartir.
 */
export const checkWelcomeIncentivesV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const db = getDb();
    const userId = request.auth.uid;
    const now = Timestamp.now();

    const userSnap = await db.doc(`users/${userId}`).get();
    let referralCode = userSnap.data()?.referralCode;

    // Generar código si no existe
    if (!referralCode) {
        const namePart = (userSnap.data()?.name || 'V').split(' ')[0].substring(0, 4).toLowerCase();
        const randomPart = Math.random().toString(36).substring(2, 6);
        referralCode = `${namePart}${randomPart}`;
        await userSnap.ref.update({ referralCode });
    }

    const creditsSnap = await db.collection('passenger_credits')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .where('expiresAt', '>', now)
        .get();

    const credits = creditsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { 
        hasActiveCredits: credits.length > 0,
        credits: credits,
        referralCode: referralCode || null,
        config: INCENTIVE_CONFIG
    };
});

/**
 * Permite al usuario generar su propio código de referido manualmente.
 */
export const generateReferralCodeV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const db = getDb();
    const userId = request.auth.uid;

    try {
        const userRef = db.doc(`users/${userId}`);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new Error('Usuario no encontrado.');

        let referralCode = userSnap.data()?.referralCode;
        if (!referralCode) {
            const namePart = (userSnap.data()?.name || 'V').split(' ')[0].substring(0, 4).toLowerCase();
            const randomPart = Math.random().toString(36).substring(2, 6);
            referralCode = `${namePart}${randomPart}`.toUpperCase();
            await userRef.update({ referralCode });
        }

        return { success: true, referralCode };
    } catch (error: any) {
        logger.error(`[REFERRALS] Error generating code for ${userId}:`, error.message);
        throw new HttpsError('internal', error.message);
    }
});

export const onDriverApprovedBonusV1 = onDocumentUpdated("users/{driverId}", async (event) => {
    const db = getDb();
    if (!event.data) return;
    const before = event.data.before.data() as UserProfile;
    const after = event.data.after.data() as UserProfile;
    const driverId = event.params.driverId;

    if (before.approved === false && after.approved === true && after.role === 'driver') {
        const bonusAmount = 2000; // Standar driver bonus
        const txId = `driver_bonus_${driverId}`;
        const { addFunds } = require('./lib/wallet');
        await db.runTransaction(async (tx) => {
             await addFunds(driverId, bonusAmount, 'topup_bonus', 'Bono bienvenida conductor aprobado', tx, txId);
        });
        logger.info(`[BONUS] Driver ${driverId} received approval bonus.`);
    }
});
