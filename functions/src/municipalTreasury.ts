import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { MunicipalAccount, MunicipalWithdrawRequest, UserProfile } from "./types";

/**
 * [VamO TREASURY] Request a municipal withdrawal.
 * Only accessible by municipal admins.
 * Hardened: Uses transaction to track pending amount.
 */
export const requestMunicipalWithdrawalV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { amount, reason, cityKey } = request.data;
    const uid = request.auth.uid;

    if (!amount || amount <= 0 || !cityKey || !reason) {
        throw new HttpsError('invalid-argument', 'Monto, razón y ciudad son obligatorios.');
    }

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() as UserProfile;

    const isAuthorized = user.role === 'admin' || user.role === 'superadmin' || (user.role === 'admin_municipal' && user.cityKey === cityKey);

    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'No tienes permiso para solicitar retiros en esta ciudad.');
    }

    const accountRef = db.doc(`municipal_accounts/${cityKey}`);
    const requestRef = db.collection('municipal_withdraw_requests').doc();

    await db.runTransaction(async (tx) => {
        const accountSnap = await tx.get(accountRef);
        if (!accountSnap.exists) throw new HttpsError('not-found', 'Cuenta municipal no encontrada.');
        const account = accountSnap.data() as MunicipalAccount;

        const available = account.currentBalance - (account.pendingWithdrawalAmount || 0);
        if (amount > available) {
            throw new HttpsError('failed-precondition', `Saldo disponible insuficiente (${available}). Hay otros retiros pendientes.`);
        }

        const withdrawRequest: MunicipalWithdrawRequest = {
            cityKey,
            requestedAmount: amount,
            requestedBy: uid,
            requestedByName: user.name || 'Admin Municipal',
            requestedByRole: user.role,
            reason,
            status: 'pending',
            availableBalanceSnapshot: account.currentBalance,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            approvals: []
        };

        tx.set(requestRef, withdrawRequest);
        tx.update(accountRef, {
            pendingWithdrawalAmount: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp()
        });
    });
    
    return { success: true, requestId: requestRef.id };
});

/**
 * [VamO TREASURY] Approve a municipal withdrawal.
 */
export const approveMunicipalWithdrawalV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { requestId } = request.data;
    const uid = request.auth.uid;

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() as UserProfile;

    if (user.role !== 'admin_municipal' && user.role !== 'admin' && user.role !== 'superadmin') {
        throw new HttpsError('permission-denied', 'No autorizado.');
    }

    const requestRef = db.doc(`municipal_withdraw_requests/${requestId}`);
    
    await db.runTransaction(async (tx) => {
        const reqSnap = await tx.get(requestRef);
        if (!reqSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
        const req = reqSnap.data() as MunicipalWithdrawRequest;

        if (req.status !== 'pending') throw new HttpsError('failed-precondition', 'La solicitud ya no está pendiente.');
        
        if (req.requestedBy === uid && user.role !== 'admin' && user.role !== 'superadmin') {
            throw new HttpsError('failed-precondition', 'No puedes aprobar tu propia solicitud.');
        }

        const approvals = req.approvals || [];
        if (approvals.some(a => a.userId === uid)) {
            throw new HttpsError('failed-precondition', 'Ya has aprobado esta solicitud.');
        }

        approvals.push({
            userId: uid,
            userName: user.name || 'Aprobador',
            userRole: user.role,
            at: Timestamp.now() as any
        });

        // Double approval rule for municipal admins, single for global admin
        const newStatus = approvals.length >= 2 || user.role === 'admin' || user.role === 'superadmin' ? 'approved' : 'pending';

        tx.update(requestRef, {
            approvals,
            status: newStatus,
            updatedAt: FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});

/**
 * [VamO TREASURY] Reject or Cancel a municipal withdrawal.
 * Hardened: Releases pending amount back to available.
 */
export const rejectMunicipalWithdrawalV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { requestId, reason } = request.data;
    const uid = request.auth.uid;

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() as UserProfile;

    const requestRef = db.doc(`municipal_withdraw_requests/${requestId}`);
    
    await db.runTransaction(async (tx) => {
        const reqSnap = await tx.get(requestRef);
        if (!reqSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
        const req = reqSnap.data() as MunicipalWithdrawRequest;

        if (req.status !== 'pending' && req.status !== 'approved') {
            throw new HttpsError('failed-precondition', 'No se puede rechazar una solicitud ya procesada.');
        }

        // Only requester can cancel, admins can reject
        const isRequester = req.requestedBy === uid;
        const isAuthorized = isRequester || user.role === 'admin_municipal' || user.role === 'admin' || user.role === 'superadmin';

        if (!isAuthorized) throw new HttpsError('permission-denied', 'No tienes permiso para esta acción.');

        const accountRef = db.doc(`municipal_accounts/${req.cityKey}`);
        
        tx.update(requestRef, {
            status: isRequester ? 'cancelled' : 'rejected',
            rejectionReason: reason || 'Rechazado por administrador',
            reviewedBy: uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        tx.update(accountRef, {
            pendingWithdrawalAmount: FieldValue.increment(-req.requestedAmount),
            updatedAt: FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});

/**
 * [VamO TREASURY] Execute a municipal withdrawal.
 * Hardened: Validates status, balance, and handles pending amount release.
 */
export const executeMunicipalWithdrawalV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const { requestId, note } = request.data;
    const uid = request.auth.uid;

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() as UserProfile;

    if (user.role !== 'admin' && user.role !== 'superadmin') {
        throw new HttpsError('permission-denied', 'Solo administradores de plataforma pueden ejecutar retiros.');
    }

    const requestRef = db.doc(`municipal_withdraw_requests/${requestId}`);
    
    await db.runTransaction(async (tx) => {
        const reqSnap = await tx.get(requestRef);
        if (!reqSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
        const req = reqSnap.data() as MunicipalWithdrawRequest;

        if (req.status !== 'approved') throw new HttpsError('failed-precondition', 'La solicitud debe estar aprobada para ejecución.');

        const accountRef = db.doc(`municipal_accounts/${req.cityKey}`);
        const accountSnap = await tx.get(accountRef);
        if (!accountSnap.exists) throw new HttpsError('not-found', 'Cuenta municipal no encontrada.');
        const account = accountSnap.data() as MunicipalAccount;

        if (req.requestedAmount > account.currentBalance) {
            throw new HttpsError('failed-precondition', 'Saldo insuficiente (excedido durante el tiempo de espera).');
        }

        const txRef = db.collection('platform_transactions').doc();
        
        // 1. Create Ledger Entry
        tx.set(txRef, {
            type: 'municipal_withdrawal',
            cityKey: req.cityKey,
            amount: -req.requestedAmount,
            requestId,
            note: note || `Retiro municipal: ${req.reason}`,
            executedBy: uid,
            createdAt: FieldValue.serverTimestamp(),
            balanceBefore: account.currentBalance,
            balanceAfter: account.currentBalance - req.requestedAmount,
            systemVersion: 'v3.1_treasury_hardened'
        });

        // 2. Update Municipal Account (Atomic Balance & Pending release)
        tx.update(accountRef, {
            currentBalance: FieldValue.increment(-req.requestedAmount),
            totalWithdrawn: FieldValue.increment(req.requestedAmount),
            pendingWithdrawalAmount: FieldValue.increment(-req.requestedAmount),
            lastMovementAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        // 3. Mark request as executed
        tx.update(requestRef, {
            status: 'executed',
            executedBy: uid,
            executedAt: FieldValue.serverTimestamp(),
            executionNote: note,
            linkedTransactionId: txRef.id,
            updatedAt: FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});

/**
 * [VamO TREASURY] Sync historical data from cities stats to municipal_accounts.
 * Only accessible by global admin.
 * Used for bootstrapping the treasury module with existing data.
 */
export const syncMunicipalAccountsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const db = getDb();
    const uid = request.auth.uid;

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = (userSnap.data() as UserProfile) || {};

    if (user.role !== 'admin' && user.role !== 'superadmin') {
        throw new HttpsError('permission-denied', 'Solo administradores globales pueden sincronizar cuentas.');
    }

    const citiesSnap = await db.collection('cities').get();
    let syncCount = 0;

    for (const cityDoc of citiesSnap.docs) {
        const rawCityKey = cityDoc.id;
        // Basic normalization for safety
        const cityKey = rawCityKey.toLowerCase().trim();
        const stats = cityDoc.data().stats || {};
        const totalContribution = stats.totalMunicipalContribution || 0;

        if (totalContribution > 0) {
            const accountRef = db.doc(`municipal_accounts/${cityKey}`);
            await db.runTransaction(async (tx) => {
                const accountSnap = await tx.get(accountRef);
                const accountData = accountSnap.exists ? (accountSnap.data() as MunicipalAccount) : null;
                const currentBalance = accountData ? (accountData.currentBalance || 0) : 0;
                
                // Only sync if the stats show MORE than what we have in the account
                // This covers the gap of rides settled before the treasury was live.
                if (currentBalance < totalContribution) {
                    tx.set(accountRef, {
                        cityKey: cityKey,
                        currentBalance: totalContribution,
                        totalAccumulated: totalContribution,
                        lastMovementAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                        status: 'active'
                    }, { merge: true });
                    syncCount++;
                    logger.info(`[SYNC_TREASURY] City ${cityKey} synced to balance ${totalContribution}`);
                }
            });
        }
    }

    return { success: true, syncCount };
});
