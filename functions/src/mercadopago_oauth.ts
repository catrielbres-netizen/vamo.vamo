import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { randomBytes } from "crypto";

// Retorna la base de datos de firestore
const getDb = () => getFirestore();

export const createMercadoPagoOAuthUrlV1 = onCall({ secrets: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_REDIRECT_URI"], cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const clientId = process.env.MERCADOPAGO_CLIENT_ID;
    const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        logger.error('Faltan configurar secretos MERCADOPAGO_CLIENT_ID o MERCADOPAGO_REDIRECT_URI');
        throw new HttpsError('failed-precondition', 'La vinculación con Mercado Pago no está configurada actualmente.');
    }

    const driverId = request.auth.uid;
    const db = getDb();

    // Generar un state único y seguro
    const stateId = randomBytes(32).toString('hex');
    
    // Guardar el state en Firestore con expiración (ej. 15 minutos)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    await db.collection('mp_oauth_states').doc(stateId).set({
        id: stateId,
        userId: driverId,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: expiresAt,
        used: false
    });

    const url = new URL('https://auth.mercadopago.com/authorization');
    url.searchParams.append('client_id', clientId);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('platform_id', 'mp');
    url.searchParams.append('state', stateId);
    url.searchParams.append('redirect_uri', redirectUri);

    return { url: url.toString() };
});

export const mercadoPagoOAuthCallbackV1 = onRequest({ secrets: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET", "MERCADOPAGO_REDIRECT_URI"], cors: true, region: 'us-central1' }, async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        logger.error(`[MERCADOPAGO_OAUTH] Error from MP: ${error}`);
        res.status(400).send(`Hubo un error al vincular tu cuenta: ${error}`);
        return;
    }

    if (!code || !state) {
        res.status(400).send('Faltan parámetros requeridos.');
        return;
    }

    const stateId = state as string;
    const db = getDb();

    try {
        const result = await db.runTransaction(async (tx) => {
            const stateRef = db.collection('mp_oauth_states').doc(stateId);
            const stateSnap = await tx.get(stateRef);

            if (!stateSnap.exists) {
                throw new Error('Estado inválido o no encontrado.');
            }

            const stateData = stateSnap.data()!;
            
            if (stateData.used) {
                throw new Error('Este enlace ya fue utilizado.');
            }

            if (stateData.expiresAt.toDate() < new Date()) {
                throw new Error('El enlace ha expirado. Por favor, intentá nuevamente.');
            }

            // Marcar como usado
            tx.update(stateRef, { used: true, usedAt: FieldValue.serverTimestamp() });

            return stateData.userId;
        });

        const driverId = result;

        // Exchange code for tokens
        const clientId = process.env.MERCADOPAGO_CLIENT_ID;
        const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
        const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI;

        const tokenResponse = await fetch('https://api.mercadopago.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: clientId || '',
                client_secret: clientSecret || '',
                grant_type: 'authorization_code',
                code: code as string,
                redirect_uri: redirectUri || ''
            })
        });

        if (!tokenResponse.ok) {
            const errData = await tokenResponse.text();
            logger.error(`[MERCADOPAGO_OAUTH] Token exchange failed: ${errData}`);
            throw new Error('Error al intercambiar el código por el token de Mercado Pago.');
        }

        const tokenData = await tokenResponse.json();

        // Leer el rol del usuario desde Firestore para determinar accountOwnerType
        const userSnap = await db.collection('users').doc(driverId).get();
        const userData = userSnap.data();
        let accountOwnerType: 'passenger' | 'driver' | 'unknown' = 'unknown';
        if (userData?.role === 'passenger' || userData?.userType === 'passenger') {
            accountOwnerType = 'passenger';
        } else if (userData?.role === 'driver' || userData?.userType === 'driver' || userData?.driverSubtype) {
            accountOwnerType = 'driver';
        } else {
            logger.warn(`[MERCADOPAGO_OAUTH] Cannot determine accountOwnerType for userId=${driverId}. Role: ${userData?.role}, UserType: ${userData?.userType}. Defaulting to unknown.`);
        }

        // Save tokens to restricted mp_accounts collection
        const mpAccountRef = db.collection('mp_accounts').doc(driverId);
        await mpAccountRef.set({
            userId: driverId,
            mpUserId: tokenData.user_id,
            status: 'linked',
            accountOwnerType,
            linkedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            publicKey: tokenData.public_key,
            scope: tokenData.scope,
            lastError: null
        });

        // Update public user profile
        const userRef = db.collection('users').doc(driverId);
        await userRef.update({
            mpLinked: true,
            mpAccountStatus: 'linked',
            mpLinkedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        // Redirect to a success page or render HTML
        res.send(`
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>VamO - Mercado Pago Vinculado</title>
                    <style>
                        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f3f4f6; margin: 0; }
                        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
                        h1 { color: #10b981; }
                        p { color: #4b5563; line-height: 1.5; }
                        .btn { display: inline-block; margin-top: 1.5rem; background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>¡Vinculación Exitosa!</h1>
                        <p>Tu cuenta de Mercado Pago se ha vinculado correctamente a VamO.</p>
                        <p>Ya podés volver a la aplicación.</p>
                        <a href="https://vamo.vamo" class="btn">Volver a VamO</a>
                    </div>
                    <script>
                        // Intentar cerrar la ventana automáticamente si fue abierta como popup
                        setTimeout(() => { window.close(); }, 3000);
                    </script>
                </body>
            </html>
        `);

    } catch (e: any) {
        logger.error(`[MERCADOPAGO_OAUTH] Exception:`, e);
        res.status(500).send(`
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>VamO - Error de Vinculación</title>
                    <style>
                        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f3f4f6; margin: 0; }
                        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
                        h1 { color: #ef4444; }
                        p { color: #4b5563; line-height: 1.5; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Error de Vinculación</h1>
                        <p>No pudimos completar la vinculación con Mercado Pago: ${e.message}</p>
                        <p>Por favor, intentá nuevamente desde la aplicación.</p>
                    </div>
                </body>
            </html>
        `);
    }
});

export const refreshMercadoPagoTokenForDriverV1 = onCall({ secrets: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET"], cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const driverId = request.auth.uid;
    const db = getDb();
    
    const mpAccountRef = db.collection('mp_accounts').doc(driverId);
    const accountSnap = await mpAccountRef.get();

    if (!accountSnap.exists) {
        throw new HttpsError('not-found', 'No se encontró cuenta de Mercado Pago vinculada.');
    }

    const accountData = accountSnap.data()!;
    if (!accountData.refreshToken) {
        throw new HttpsError('failed-precondition', 'No hay refresh_token disponible.');
    }

    const clientId = process.env.MERCADOPAGO_CLIENT_ID;
    const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('Faltan configurar secretos MERCADOPAGO_CLIENT_ID o MERCADOPAGO_CLIENT_SECRET');
        throw new HttpsError('internal', 'Error de configuración del servidor.');
    }

    try {
        const tokenResponse = await fetch('https://api.mercadopago.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: accountData.refreshToken
            })
        });

        if (!tokenResponse.ok) {
            const errData = await tokenResponse.text();
            logger.error(`[MERCADOPAGO_OAUTH_REFRESH] Failed: ${errData}`);
            
            // Si falla permanentemente (por ej, el usuario revocó el acceso), actualizar estados
            await mpAccountRef.update({
                status: 'expired',
                updatedAt: FieldValue.serverTimestamp(),
                lastError: 'Fallo al renovar token'
            });
            await db.collection('users').doc(driverId).update({
                mpAccountStatus: 'expired'
            });

            throw new HttpsError('internal', 'No se pudo renovar el token. Debes volver a vincular tu cuenta.');
        }

        const tokenData = await tokenResponse.json();

        await mpAccountRef.update({
            status: 'linked',
            updatedAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            publicKey: tokenData.public_key,
            lastError: null
        });

        await db.collection('users').doc(driverId).update({
            mpAccountStatus: 'linked',
            updatedAt: FieldValue.serverTimestamp()
        });

        return { success: true, message: 'Token renovado exitosamente.' };

    } catch (e: any) {
        logger.error(`[MERCADOPAGO_OAUTH_REFRESH] Exception:`, e);
        throw new HttpsError('internal', 'Excepción al intentar renovar el token.', e.message);
    }
});
