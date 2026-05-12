import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDb } from "./lib/firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

// Valores exactos del Model Garden — gemini-2.0-flash-001
const PROJECT_ID = 'studio-6697160840-7c67f';
const LOCATION   = 'us-central1';
const MODEL_ID   = 'gemini-2.0-flash-001';
const ENDPOINT   = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

const SYSTEM_PROMPT = `Eres el Asistente IA de VamO, plataforma de movilidad urbana en Argentina (Chubut/Rawson).
FUNCIÓN: EXCLUSIVAMENTE INFORMATIVA Y DE GUÍA al usuario.
PUEDES: Explicar VamO, VamO Pay, Pozo Semanal, tarifa dinámica, guiar paso a paso, responder dudas.
NO PUEDES: Modificar dinero, cancelar/crear viajes, aprobar conductores, cambiar tarifas.
Si piden acción crítica, explicá cómo hacerla desde la app.`;

export const askVamoIAV1 = onCall({
    region: 'us-central1',
    maxInstances: 10,
}, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acceso denegado.');

    const { message, chatHistory = [] } = request.data;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Mensaje inválido.');
    }
    if (message.length > 500) {
        throw new HttpsError('invalid-argument', 'Mensaje demasiado largo.');
    }

    const uid = request.auth.uid;
    const db  = getDb();
    const userRef = db.doc(`users/${uid}`);

    try {
        // 1. Contexto del usuario
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
        const userData = userSnap.data()!;

        // 2. Rate limit: 5s
        const now = Date.now();
        const lastQuery = userData.lastAiQueryAt?.toMillis?.() ?? 0;
        if (now - lastQuery < 5000) {
            throw new HttpsError('resource-exhausted', 'Esperá unos segundos antes de otra consulta.');
        }

        // 3. Contexto sanitizado
        const ctx = [
            `Usuario: ${userData.name ?? 'Sin nombre'}`,
            `Rol: ${userData.role ?? 'passenger'}`,
            `Ciudad: ${userData.cityKey ?? 'Rawson'}`,
            ...(userData.municipalStatus ? [`Estado: ${userData.municipalStatus}`] : []),
        ].join(', ');

        // 4. Obtener token IAM para llamada REST directa
        const auth  = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
        const token = await auth.getAccessToken();

        // 5. Construir contenidos del chat
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

        // Historial previo
        for (const h of (chatHistory as Array<{ role: string; content: string }>).slice(-8)) {
            contents.push({
                role:  h.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: h.content }],
            });
        }

        // Mensaje actual del usuario
        contents.push({ role: 'user', parts: [{ text: message }] });

        // 6. Llamada REST directa al endpoint oficial de Vertex AI
        const body = {
            systemInstruction: {
                parts: [{ text: `${SYSTEM_PROMPT}\n\nContexto: ${ctx}.` }],
            },
            contents,
            generationConfig: {
                maxOutputTokens: 512,
                temperature:     0.2,
            },
        };

        const response = await fetch(ENDPOINT, {
            method:  'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text();
            logger.error('[AI_HTTP_ERROR]', { status: response.status, body: errText });
            throw new Error(`Vertex AI HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json() as any;
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No pude generar una respuesta.';

        // 7. Registrar uso
        await userRef.update({ lastAiQueryAt: FieldValue.serverTimestamp() });

        logger.info(`[AI_SUCCESS] uid=${uid} role=${userData.role}`);
        return { reply };

    } catch (error: any) {
        if (error instanceof HttpsError) throw error;

        logger.error('[AI_CRITICAL_FAILURE]', {
            message: error.message,
            code:    error.code ?? error.status,
        });

        throw new HttpsError('internal', 'Error interno del asistente IA.');
    }
});
