import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { DocumentRequest, DocumentRequestDocType, DocumentRequestStatus } from "./types";

/**
 * Re-evalúa el flag `hasMandatoryPendingDocs` del usuario basado en sus requerimientos.
 * Debe ser llamada siempre que se cree, actualice o apruebe/rechace un requerimiento.
 */
async function reevaluateMandatoryDocs(uid: string): Promise<void> {
    const db = admin.firestore();
    const requestsSnap = await db.collection(`users/${uid}/document_requests`)
        .where('isMandatory', '==', true)
        .get();

    let hasPending = false;
    requestsSnap.forEach(doc => {
        const req = doc.data() as DocumentRequest;
        // Si hay al menos un obligatorio que NO esté aprobado, bloquea.
        if (req.status !== 'approved') {
            hasPending = true;
        }
    });

    await db.collection('users').doc(uid).update({
        hasMandatoryPendingDocs: hasPending
    });
    logger.info(`[DOC_REQUESTS] Reevaluated uid=${uid}, hasMandatoryPendingDocs=${hasPending}`);
}

export const adminCreateDocumentRequestV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth || auth.token.r !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo administradores pueden crear requerimientos.');
    }

    const { driverId, docType, isMandatory, adminNote } = request.data;
    if (!driverId || !docType) {
        throw new HttpsError('invalid-argument', 'driverId y docType son requeridos.');
    }

    const db = admin.firestore();
    const reqRef = db.collection(`users/${driverId}/document_requests`).doc();

    const newRequest: DocumentRequest = {
        id: reqRef.id,
        userId: driverId,
        docType: docType as DocumentRequestDocType,
        status: 'pending',
        isMandatory: !!isMandatory,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        requestedBy: auth.uid,
        adminNote: adminNote || ''
    };

    await reqRef.set(newRequest);
    await reevaluateMandatoryDocs(driverId);

    return { success: true, requestId: reqRef.id };
});

export const submitDocumentRequestV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const { driverId, requestId, uploadedUrl } = request.data;
    if (!requestId || !uploadedUrl) {
        throw new HttpsError('invalid-argument', 'requestId y uploadedUrl son requeridos.');
    }
    
    // Un conductor puede subir los suyos; un admin puede subir en nombre del conductor.
    if (auth.uid !== driverId && auth.token.r !== 'admin') {
        throw new HttpsError('permission-denied', 'No puedes subir documentos para otro usuario.');
    }

    const db = admin.firestore();
    const reqRef = db.collection(`users/${driverId}/document_requests`).doc(requestId);

    await reqRef.update({
        status: 'uploaded',
        uploadedUrl: uploadedUrl,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Reevaluar por si el status cambió (aunque 'uploaded' sigue bloqueando si es mandatory)
    await reevaluateMandatoryDocs(driverId);

    return { success: true };
});

export const adminReviewDocumentRequestV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth || auth.token.r !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo administradores.');
    }

    const { driverId, requestId, status, adminNote } = request.data;
    if (!driverId || !requestId || !['approved', 'rejected'].includes(status)) {
        throw new HttpsError('invalid-argument', 'driverId, requestId y un status válido son requeridos.');
    }

    const db = admin.firestore();
    const reqRef = db.collection(`users/${driverId}/document_requests`).doc(requestId);

    await reqRef.update({
        status: status,
        approvedAt: status === 'approved' ? admin.firestore.FieldValue.serverTimestamp() : null,
        approvedBy: auth.uid,
        adminNote: adminNote || ''
    });

    await reevaluateMandatoryDocs(driverId);

    return { success: true };
});
