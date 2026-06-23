import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";

/**
 * ACCEPT DRIVER TERMS V1
 * Permite a un conductor aceptar digitalmente los términos y condiciones.
 * Crea un registro en legal_acceptances y actualiza el campo legal del usuario.
 */
export const acceptDriverTermsV1 = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const { contractVersion, cityKey, signatureText, fullName, dni } = request.data;

    if (!contractVersion || !cityKey || !signatureText || !fullName || !dni) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    const firestore = admin.firestore();
    const userRef = firestore.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User profile not found.');
    }

    const userData = userSnap.data();
    if (userData?.role !== 'driver') {
        throw new HttpsError('permission-denied', 'Only drivers can accept driver terms.');
    }

    const email = userData?.email || request.auth.token.email || '';
    const now = FieldValue.serverTimestamp();

    // 1. Crear el hash de validación (sha256 del texto firmado + uid + version + timestamp base)
    const crypto = require('crypto');
    const rawData = `${uid}|${contractVersion}|${signatureText}|${Date.now()}`;
    const hash = crypto.createHash('sha256').update(rawData).digest('hex');

    const acceptanceData = {
        contractType: "driver_terms",
        contractVersion,
        uid,
        email,
        fullName,
        dni,
        cityKey,
        acceptedAt: now,
        signatureText,
        userAgent: request.rawRequest?.headers['user-agent'] || 'unknown',
        ip: request.rawRequest?.headers['x-forwarded-for'] || request.rawRequest?.socket?.remoteAddress || 'unknown',
        hash,
        status: "accepted"
    };

    const docId = `${uid}_driver_terms_${contractVersion}`;
    const acceptanceRef = firestore.collection('legal_acceptances').doc(docId);

    const batch = firestore.batch();

    // 2. Guardar en legal_acceptances
    batch.set(acceptanceRef, acceptanceData);

    // 3. Actualizar users/{uid}
    batch.update(userRef, {
        "legal.driverTermsAccepted": true,
        "legal.driverTermsVersion": contractVersion,
        "legal.driverTermsAcceptedAt": now
    });

    await batch.commit();

    return {
        success: true,
        hash
    };
});
