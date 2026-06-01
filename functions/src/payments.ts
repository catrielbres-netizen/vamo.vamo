import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { getDb } from "./lib/firebaseAdmin";
import { Ride, UserProfile } from "./types";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";

export const createRidePaymentPreferenceV1 = onCall(
    { secrets: ["MERCADOPAGO_WEBHOOK_URL"], cors: true, region: 'us-central1' },
    async (request: CallableRequest<{ rideId: string }>) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated.');
        }

        const db = getDb();
        const passengerId = request.auth.uid;
        const { rideId } = request.data;

        if (!rideId) {
            throw new HttpsError('invalid-argument', 'Missing rideId.');
        }

        const rideRef = db.collection('rides').doc(rideId);
        const rideSnap = await rideRef.get();

        if (!rideSnap.exists) {
            throw new HttpsError('not-found', 'Ride not found.');
        }

        const rideData = rideSnap.data() as Ride;

        if ((rideData as any).passengerId !== passengerId && rideData.passengerId !== passengerId) {
            throw new HttpsError('permission-denied', 'You do not own this ride.');
        }

        if (rideData.paymentMethod === 'cash' || (rideData.paymentMethod as any) === 'efectivo' || (rideData as any).selectedPaymentMethod === 'cash') {
            throw new HttpsError('failed-precondition', 'Este viaje fue configurado para pago en efectivo.');
        }

        const validStatuses = ['in_progress', 'ongoing', 'completed', 'finished'];
        if (!validStatuses.includes(rideData.status)) {
            throw new HttpsError('failed-precondition', 'El pago digital estará disponible cuando el viaje inicie.');
        }

        if (!rideData.driverId) {
            throw new HttpsError('failed-precondition', 'Ride does not have a driver assigned yet.');
        }

        const driverRef = db.collection('users').doc(rideData.driverId);
        const driverSnap = await driverRef.get();
        const driverData = driverSnap.data() as UserProfile;

        if (!driverData.mpLinked) {
            throw new HttpsError('failed-precondition', 'Driver has not linked a Mercado Pago account.');
        }

        const mpAccountRef = db.collection('mp_accounts').doc(rideData.driverId);
        const mpAccountSnap = await mpAccountRef.get();

        if (!mpAccountSnap.exists) {
            throw new HttpsError('failed-precondition', 'Driver MP account details not found.');
        }

        const mpAccountData = mpAccountSnap.data();
        if (mpAccountData?.status !== 'linked') {
            throw new HttpsError('failed-precondition', 'Driver MP account is not fully linked.');
        }

        // Support both naming conventions: 'accessToken' (OAuth saves) and 'access_token' (legacy)
        const driverAccessToken = mpAccountData?.accessToken || mpAccountData?.access_token;

        if (!driverAccessToken) {
            throw new HttpsError('failed-precondition', 'Driver access token missing. Please re-link Mercado Pago.');
        }

        // Fetch system config
        const paymentConfigSnap = await db.collection('system_config').doc('payment_config').get();
        const paymentConfigData = paymentConfigSnap.data() || {};
        
        if (!paymentConfigData.MP_SINGLE_DRIVER_MODE) {
            throw new HttpsError('unimplemented', 'System is not configured for MP_SINGLE_DRIVER_MODE.');
        }

        const commissionPercent = paymentConfigData.VAMO_COMMISSION_PERCENT || 18;

        // Total amount (passenger pays)
        const totalAmount = (rideData.pricing as any)?.finalPrice || (rideData.pricing as any)?.total || rideData.pricing?.estimatedTotal || rideData.completedRide?.totalFare || 0;
        if (totalAmount <= 0) {
            throw new HttpsError('invalid-argument', 'Monto inválido para generar el pago.');
        }

        // Calculate commission
        const vamoCommissionAmount = Math.round(totalAmount * (commissionPercent / 100));
        
        // Detect if the driver is Eduardo/owner
        const isOwnerDriver = 
            rideData.driverId === paymentConfigData.ownerDriverUid || 
            String(mpAccountData?.mpUserId) === String(paymentConfigData.marketplaceOwnerMpUserId);

        const paymentMode = isOwnerDriver ? "single_driver_no_split" : "marketplace_split";
        const splitApplied = !isOwnerDriver;
        const commissionCollectionStatus = isOwnerDriver ? "internal_only" : "automatic_marketplace_fee";
        const marketplaceFeeApplied = isOwnerDriver ? 0 : vamoCommissionAmount;
        const driverGrossAmount = isOwnerDriver ? totalAmount : totalAmount - vamoCommissionAmount;

        const notificationUrl = process.env.MERCADOPAGO_WEBHOOK_URL;
        if (!notificationUrl) {
            logger.warn("MERCADOPAGO_WEBHOOK_URL is not set. Webhooks may not arrive.");
        }

        // Create MP Preference using Driver's Access Token
        const driverMpClient = new MercadoPagoConfig({ accessToken: driverAccessToken });
        const preferenceClient = new Preference(driverMpClient);

        const preferenceRequest = {
            items: [{
                id: rideId,
                title: `Viaje VamO - ${rideId}`,
                quantity: 1,
                currency_id: "ARS",
                unit_price: totalAmount,
            }],
            payer: {
                email: request.auth.token.email,
            },
            external_reference: rideId,
            metadata: {
                type: "ride_payment",
                ride_id: rideId,
                driver_id: rideData.driverId,
                passenger_id: passengerId,
            },
            notification_url: notificationUrl || undefined,
            binary_mode: true,
            auto_return: "approved",
            back_urls: {
                success: `https://studio-6697160840-7c67f.web.app/dashboard/history/${rideId}?payment=success`,
                pending: `https://studio-6697160840-7c67f.web.app/dashboard/history/${rideId}?payment=pending`,
                failure: `https://studio-6697160840-7c67f.web.app/dashboard/history/${rideId}?payment=failure`
            }
        };

        if (!isOwnerDriver && vamoCommissionAmount > 0) {
            (preferenceRequest as any).marketplace_fee = vamoCommissionAmount;
        }

        try {
            logger.log(`Creating MP Preference for ride ${rideId} using Driver Token.`);
            const response = await preferenceClient.create({ body: preferenceRequest });

            if (!response.id) {
                throw new Error("No se recibió ID de preferencia de Mercado Pago.");
            }

            const isSandboxToken = driverAccessToken.startsWith('TEST-');

            await rideRef.update({
                paymentProvider: "mercadopago",
                paymentMode: paymentMode,
                paymentStatus: "pending",
                mpPreferenceId: response.id,
                mpIsSandbox: isSandboxToken,
                mpCheckoutUrl: isSandboxToken && response.sandbox_init_point ? response.sandbox_init_point : response.init_point,
                vamoCommissionPercent: commissionPercent,
                vamoCommissionAmount: vamoCommissionAmount,
                driverGrossAmount: driverGrossAmount,
                splitApplied: splitApplied,
                marketplaceFeeApplied: marketplaceFeeApplied,
                commissionCollectionStatus: commissionCollectionStatus,
                updatedAt: FieldValue.serverTimestamp()
            });

            return {
                init_point: response.init_point,
                sandbox_init_point: response.sandbox_init_point,
                checkout_url: isSandboxToken && response.sandbox_init_point ? response.sandbox_init_point : response.init_point,
                preferenceId: response.id
            };
        } catch (error: any) {
            let errorMsg = error.message || "Error desconocido";
            
            if (error.response) {
                const mpStatus = error.response.status;
                const mpError = error.response.body?.error || error.response.error;
                const mpMessage = error.response.body?.message || error.response.message;
                const mpCause = error.response.body?.cause || [];
                
                logger.error(`[MP ERROR] Ride ${rideId}:`, {
                    status: mpStatus,
                    error: mpError,
                    message: mpMessage,
                    cause: mpCause,
                    rideId,
                    driverId: rideData.driverId,
                    passengerId,
                    paymentMethod: rideData.paymentMethod,
                    rideStatus: rideData.status,
                    amount: totalAmount,
                    mpUserId: mpAccountData?.mpUserId,
                    mpIsSandbox: driverAccessToken.startsWith('TEST-'),
                    external_reference: rideId
                });

                errorMsg = `Mercado Pago rechazó la preferencia: ${mpMessage || mpError || "Error de configuración"}`;
            } else {
                logger.error(`[MP ERROR - Unknown] Ride ${rideId}:`, error);
                errorMsg = `No se pudo generar el pago por configuración de Mercado Pago: ${error.message}`;
            }

            throw new HttpsError('invalid-argument', errorMsg);
        }
    }
);

export const mercadoPagoWebhookV5 = onRequest(async (req, res) => {
    try {
        const { type, action, data, user_id } = req.body;
        logger.log(`[MP Webhook V5] Received type: ${type || action}, body:`, JSON.stringify(req.body));

        let paymentId: string | null = null;
        if (type === 'payment') {
            paymentId = data?.id;
        } else if (action === 'payment.created' || action === 'payment.updated') {
            paymentId = data?.id;
        } else if (req.query.type === 'payment' || req.query.topic === 'payment') {
            paymentId = req.query['data.id'] as string || req.query.id as string;
        }

        if (!paymentId) {
            logger.log('[MP Webhook V5] Not a payment event or missing payment ID. Ignoring.');
            res.status(200).send('OK');
            return;
        }

        // Send 200 OK immediately to acknowledge receipt
        res.status(200).send('OK');

        const db = getDb();
        let accessTokenToUse: string | null = null;

        // Try to find the driver's access token using the user_id from the webhook payload
        // Support both naming conventions: 'accessToken' (OAuth saves) and 'access_token' (legacy)
        if (user_id) {
            const mpAccountsSnap = await db.collection('mp_accounts').where('mpUserId', '==', user_id).limit(1).get();
            if (!mpAccountsSnap.empty) {
                const d = mpAccountsSnap.docs[0].data();
                accessTokenToUse = d.accessToken || d.access_token || null;
            } else {
                // mpUserId might be saved as a string
                const mpAccountsSnapStr = await db.collection('mp_accounts').where('mpUserId', '==', String(user_id)).limit(1).get();
                if (!mpAccountsSnapStr.empty) {
                    const d = mpAccountsSnapStr.docs[0].data();
                    accessTokenToUse = d.accessToken || d.access_token || null;
                }
            }
        }

        // If we still don't have it, we can't reliably fetch the payment in single driver mode
        if (!accessTokenToUse) {
            logger.error(`[MP Webhook V5] Cannot find access_token for user_id: ${user_id}. Unable to verify payment.`);
            return;
        }

        // Fetch payment details from MP
        const mpClient = new MercadoPagoConfig({ accessToken: accessTokenToUse });
        const paymentClient = new Payment(mpClient);
        
        const paymentInfo = await paymentClient.get({ id: paymentId });
        
        if (!paymentInfo || !paymentInfo.external_reference) {
            logger.error(`[MP Webhook V5] Payment ${paymentId} has no external_reference.`);
            return;
        }

        const rideId = paymentInfo.external_reference;
        const rideRef = db.collection('rides').doc(rideId);
        const rideSnap = await rideRef.get();

        if (!rideSnap.exists) {
            logger.error(`[MP Webhook V5] Ride ${rideId} not found for payment ${paymentId}.`);
            return;
        }

        // Validate we don't accidentally split or mess with marketplace fee
        // In this Single Driver Phase, we only update the status
        
        await rideRef.update({
            paymentStatus: paymentInfo.status === 'approved' ? 'approved' : 'pending',
            mpPaymentId: paymentId,
            paymentProvider: "mercadopago",
            mpPaymentStatus: paymentInfo.status,
            mpPaymentStatusDetail: paymentInfo.status_detail,
            paidAt: paymentInfo.status === 'approved' ? FieldValue.serverTimestamp() : null,
            paymentConfirmedAt: paymentInfo.status === 'approved' ? FieldValue.serverTimestamp() : null,
            updatedAt: FieldValue.serverTimestamp()
        });

        logger.log(`[MP Webhook V5] Successfully updated ride ${rideId} to paymentStatus: ${paymentInfo.status}`);

    } catch (error) {
        logger.error('[MP Webhook V5] Error processing webhook:', error);
        // We already sent 200 OK so MP won't retry on our internal errors here, 
        // which is safer in single driver mode to avoid looping.
    }
});

// Verificación manual de pago de contingencia
export const verifyRidePaymentV1 = onCall(
    { enforceAppCheck: true },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated.');
        }

        const rideId = request.data.rideId;
        if (!rideId) {
            throw new HttpsError('invalid-argument', 'Missing rideId.');
        }

        const db = getDb();
        const rideRef = db.collection('rides').doc(rideId);
        const rideSnap = await rideRef.get();

        if (!rideSnap.exists) {
            throw new HttpsError('not-found', 'Ride not found.');
        }

        const rideData = rideSnap.data() as any;
        if (rideData.passengerId !== request.auth.uid && rideData.driverId !== request.auth.uid) {
            throw new HttpsError('permission-denied', 'Unauthorized.');
        }

        if (rideData.paymentStatus === 'approved') {
            return { status: 'approved', already_approved: true };
        }

        if (!rideData.mpPreferenceId) {
            throw new HttpsError('failed-precondition', 'No Mercado Pago preference found for this ride.');
        }

        const mpAccountsSnap = await db.collection('mp_accounts').doc(rideData.driverId).get();
        if (!mpAccountsSnap.exists) {
            throw new HttpsError('not-found', 'Driver MP account not found.');
        }
        
        const mpData = mpAccountsSnap.data();
        const driverAccessToken = mpData?.accessToken || mpData?.access_token;
        if (!driverAccessToken) {
            throw new HttpsError('failed-precondition', 'Driver has no MP access token.');
        }

        const mpClient = new MercadoPagoConfig({ accessToken: driverAccessToken });
        // Para buscar pagos asociados a una preferencia, usamos la API de Payments search
        // En Mercado Pago SDK v2: Payment.search({ qs: { external_reference: rideId } })
        const paymentClient = new Payment(mpClient);
        
        try {
            const searchResult = await paymentClient.search({
                options: {
                    external_reference: rideId
                }
            });

            const payments = searchResult.results || [];
            // Buscar si hay alguno aprobado
            const approvedPayment = payments.find((p: any) => p.status === 'approved');
            const paymentToUse = approvedPayment || payments[0]; // usar el aprobado o el más reciente

            if (paymentToUse) {
                await rideRef.update({
                    paymentStatus: paymentToUse.status === 'approved' ? 'approved' : 'pending',
                    mpPaymentId: String(paymentToUse.id),
                    paymentProvider: "mercadopago",
                    mpPaymentStatus: paymentToUse.status,
                    mpPaymentStatusDetail: paymentToUse.status_detail,
                    paidAt: paymentToUse.status === 'approved' ? FieldValue.serverTimestamp() : null,
                    paymentConfirmedAt: paymentToUse.status === 'approved' ? FieldValue.serverTimestamp() : null,
                    updatedAt: FieldValue.serverTimestamp()
                });

                return {
                    status: paymentToUse.status,
                    payment_id: paymentToUse.id
                };
            } else {
                return { status: rideData.paymentStatus || 'pending', message: 'No payments found yet.' };
            }
        } catch (error: any) {
            logger.error(`Error verifying payment for ride ${rideId}:`, error);
            throw new HttpsError('internal', 'Error fetching payment status from Mercado Pago.');
        }
    }
);
