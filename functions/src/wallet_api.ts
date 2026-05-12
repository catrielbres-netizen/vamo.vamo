import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { addFunds, getOrCreateWallet, WALLET_CONFIG } from "./lib/wallet";

/**
 * Fase 1: Crear Intención de Recarga (Orden)
 */
export const createWalletTopupOrderV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const { amount } = request.data;
    if (typeof amount !== 'number' || amount < 500) {
        throw new HttpsError('invalid-argument', 'Monto mínimo $500.');
    }

    const db = getDb();
    const orderId = `vtop_${Date.now()}_${request.auth.uid.slice(0, 5)}`;
    
    const orderData = {
        userId: request.auth.uid,
        amount,
        status: 'pending_payment',
        createdAt: FieldValue.serverTimestamp(),
        paymentLink: `https://pay.vamo.com/simulated/${orderId}` // Demo link
    };

    await db.collection('wallet_topup_orders').doc(orderId).set(orderData);

    return { orderId, paymentLink: orderData.paymentLink };
});

/**
 * Fase 2: Confirmación de Recarga (Blindada)
 */
export const confirmWalletTopupV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión para confirmar recarga.');
    
    const { orderId } = request.data;
    logger.info(`[WALLET_TOPUP] Start confirmation flow for orderId: ${orderId}`);

    if (!orderId) throw new HttpsError('invalid-argument', 'ERROR: orderId es obligatorio.');

    const db = getDb();
    const orderRef = db.collection('wallet_topup_orders').doc(orderId);
    // Deterministic IDs for ledger locks
    const cashTxId = `topup_${orderId}`;
    const bonusTxId = `bonus_${orderId}`;

    try {
        const result = await db.runTransaction(async (tx) => {
            // STEP 1: ALL READS FIRST (Strict Firestore Rule)
            const [orderSnap, cashTxSnap, bonusTxSnap] = await Promise.all([
                tx.get(orderRef),
                tx.get(db.collection('wallet_transactions').doc(cashTxId)),
                tx.get(db.collection('wallet_transactions').doc(bonusTxId))
            ]);
            
            // STEP 2: LOGIC & VALIDATION
            if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
            
            const order = orderSnap.data();
            if (order?.status === 'completed') return { status: 'ALREADY_COMPLETED' };

            const amount = order?.amount;
            const userId = order?.userId;
            if (!amount || !userId) throw new Error("INVALID_ORDER_DATA");

            // STEP 3: WRITES (Atomic)
            // Idempotency: skip if tx already exists in ledger
            if (!cashTxSnap.exists) {
                await addFunds(userId, amount, 'topup_cash', `Recarga VamO Pay: Orden ${orderId}`, tx, cashTxId);
            }

            let bonusAmount = 0;
            if (amount >= 20000) bonusAmount = Math.floor(amount * 0.30);
            else if (amount >= 10000) bonusAmount = Math.floor(amount * 0.25);
            else if (amount >= 5000) bonusAmount = Math.floor(amount * 0.20);

            if (bonusAmount > 0 && !bonusTxSnap.exists) {
                await addFunds(userId, bonusAmount, 'topup_bonus', `Bono Recarga VamO Pay: ${orderId}`, tx, bonusTxId);
            }

            tx.update(orderRef, { 
                status: 'completed', 
                completedAt: FieldValue.serverTimestamp() 
            });

            return { status: 'SUCCESS' };
        });

        return { success: true, result: result.status };
    } catch (error: any) {
        logger.error(`[WALLET_TOPUP] CRITICAL FAILURE for order ${orderId}:`, error);
        if (error.message === "ORDER_NOT_FOUND") throw new HttpsError('not-found', 'Orden no encontrada.');
        if (error.message === "INVALID_ORDER_DATA") throw new HttpsError('failed-precondition', 'Datos de orden inválidos.');
        throw new HttpsError('internal', `Error: ${error.message}`);
    }
});

/**
 * Consulta de estado de Billetera (Unificado)
 */
export const getMyWalletV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const userId = request.auth.uid;
    const db = getDb();

    try {
        const wallet = await getOrCreateWallet(userId);
        
        // Fetch active platform credits (incentives, referals, etc)
        let activeCreditsAmount = 0;
        try {
            const creditsSnap = await db.collection('passenger_credits')
                .where('userId', '==', userId)
                .where('status', '==', 'active')
                .where('expiresAt', '>', Timestamp.now())
                .get();
            
            creditsSnap.forEach(doc => {
                activeCreditsAmount += (doc.data().amount || 0);
            });
        } catch (creditError) {
            logger.warn(`[WALLET] Error fetching credits for ${userId}:`, creditError);
        }

        // Ledger de movimientos (Soporta fallback si falla el índice en dev)
        let transactions: any[] = [];
        try {
            const txSnap = await db.collection('wallet_transactions')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .get();

            transactions = txSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (idxError) {
            logger.warn(`[WALLET] Index missing for transactions for ${userId}. Returning balance only.`);
        }

        return { wallet, transactions, activeCreditsAmount };
    } catch (error: any) {
        logger.error(`[WALLET] Fatal error getMyWalletV1 for ${userId}:`, error);
        throw new HttpsError('internal', 'No se pudo cargar la billetera. Reintentá.');
    }
});
