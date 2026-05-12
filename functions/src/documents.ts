import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

interface SubmitDocumentRequest {
    ownerUid: string;
    docType: string;
    category: 'identity' | 'municipal' | 'traffic';
    cityKey?: string;
    storagePath: string;
    downloadURL: string;
    contentType: string;
    originalFilename?: string;
}

/**
 * submitDocumentV1
 * Single authority for document registration in users/{uid}/documents/{docId}
 */
export const submitDocumentV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth) {
        logger.warn("[SUBMIT_DOCUMENT_V1_DENIED] Unauthenticated request");
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const data = request.data as SubmitDocumentRequest;
    const uid = auth.uid;
    const isAdmin = auth.token.r === 'admin';

    // 1. Validaciones de Inputs
    if (!data.ownerUid || !data.docType || !data.category || !data.storagePath || !data.downloadURL || !data.contentType) {
        throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.');
    }

    if (!['identity', 'municipal', 'traffic'].includes(data.category)) {
        throw new HttpsError('invalid-argument', 'Categoría de documento inválida.');
    }

    // 2. Validación de Ownership
    if (!isAdmin && data.ownerUid !== uid) {
        logger.warn(`[SUBMIT_DOCUMENT_V1_DENIED] User ${uid} tried to submit document for ${data.ownerUid}`);
        throw new HttpsError('permission-denied', 'No tienes permiso para subir documentos a este usuario.');
    }

    // 3. Validación de Path (Seguridad básica de Storage Path)
    // El path debe contener el ownerUid para asegurar que no están registrando archivos de otros
    if (!data.storagePath.includes(data.ownerUid)) {
        logger.warn(`[SUBMIT_DOCUMENT_V1_DENIED] storagePath mismatch for user ${data.ownerUid}. Path: ${data.storagePath}`);
        throw new HttpsError('permission-denied', 'El archivo no pertenece a tu carpeta de usuario.');
    }

    // 4. Validación de ContentType (Seguridad Reforzada)
    const ALLOWED_TYPES = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp', 
        'application/pdf', 
        'image/heic', 
        'image/heif'
    ];
    
    // Si no es un tipo MIME explícitamente permitido, lo rechazamos
    if (!ALLOWED_TYPES.includes(data.contentType.toLowerCase())) {
        logger.warn(`[SUBMIT_DOCUMENT_V1_REJECTED] Invalid ContentType: ${data.contentType} for user ${data.ownerUid}`);
        throw new HttpsError('invalid-argument', 'Tipo de archivo no permitido.');
    }

    logger.info(`[SUBMIT_DOCUMENT_V1_START] Submitting ${data.docType} for user ${data.ownerUid}`);

    const db = admin.firestore();
    const userRef = db.collection('users').doc(data.ownerUid);

    // 5. CityKey Resolution (Multi-tier fallback)
    let resolvedCityKey = data.cityKey || auth.token.ck;
    let source = data.cityKey ? 'payload' : (auth.token.ck ? 'token' : 'none');

    if (!resolvedCityKey) {
        const userSnap = await userRef.get();
        resolvedCityKey = userSnap.data()?.cityKey;
        if (resolvedCityKey) source = 'firestore';
    }

    // [VamO PRO] Fallback for onboarding: If still no cityKey, default to 'rawson' for drivers/passengers
    if (!resolvedCityKey) {
        resolvedCityKey = 'rawson';
        source = 'default_fallback';
    }

    logger.info(`[SUBMIT_DOCUMENT_CITYKEY_SOURCE]: ${source} (${resolvedCityKey})`);

    const docRef = userRef.collection('documents').doc(data.docType);

    try {
        const docData = {
            ownerUid: data.ownerUid,
            docType: data.docType,
            category: data.category,
            cityKey: resolvedCityKey,
            storagePath: data.storagePath,
            downloadURL: data.downloadURL,
            contentType: data.contentType,
            originalFilename: data.originalFilename || null,
            uploadedAt: FieldValue.serverTimestamp(),
            uploadedBy: uid,
            status: 'pending_review',
            source: 'submitDocumentV1',
            version: 1
        };

        await docRef.set(docData);

        logger.info(`[SUBMIT_DOCUMENT_V1_SUCCESS] ${data.docType} registered for user ${data.ownerUid}`);
        return { success: true, docId: data.docType };

    } catch (err: any) {
        logger.error(`[SUBMIT_DOCUMENT_V1_ERROR] Failed to register document: ${err.message}`);
        throw new HttpsError('internal', 'Error interno al registrar el documento.');
    }
});
