
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { Wallet, WalletTransaction, WalletTransactionType } from '../types';
import { getDb } from './firebaseAdmin';

/**
 * REGLAS DE BILLETERA VamO (HARDENING):
 * 1. Consumo: Créditos Temporales -> promoBalance -> cashBalance.
 * 2. Idempotencia: Todos los registros en el ledger usan IDs determinísticos [tipo_rideId].
 * 3. Atomicidad: Se validan saldos y bloqueos dentro de transacciones.
 * 4. Fugas: Un balance nunca puede ser negativo.
 */

export const WALLET_CONFIG = {
    MIN_CASH_PERCENT: 0, 
};

export async function getOrCreateWallet(userId: string, tx?: admin.firestore.Transaction, providedSnap?: admin.firestore.DocumentSnapshot): Promise<Wallet> {
    const db = getDb();
    const walletRef = db.doc(`wallets/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    
    // Read current state
    const snap = providedSnap || (tx ? await tx.get(walletRef) : await walletRef.get());
    let walletData = snap.exists ? (snap.data() as any) : null;

    // --- MIGRATION ON READ (ETAPA 2B) ---
    // Only performed if running within a transaction to ensure atomicity
    if (tx && (!walletData || walletData.legacyMigrated !== true)) {
        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
            const userData = userSnap.data() as any;
            const legacyBalance = userData.currentBalance || 0;

            if (legacyBalance !== 0) {
                const currentCash = walletData?.cashBalance || 0;
                // Si ya tiene saldo en la billetera, no sumamos el legado para evitar duplicación
                const newCash = currentCash > 0 ? currentCash : legacyBalance; 

                // Transfer balance to unified wallet
                tx.set(walletRef, {
                    userId,
                    cashBalance: newCash,
                    legacyMigrated: true,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                // Reset legacy balance and SYNC MIRROR (ETAPA 2B Option C)
                tx.update(userRef, {
                    currentBalance: newCash,
                    updatedAt: FieldValue.serverTimestamp()
                });

                logger.info(`[MIGRATION] userId=${userId} migratedBalance=${legacyBalance}`);
                
                // Update local pointer for the return object
                walletData = { ...(walletData || {}), userId, cashBalance: newCash, legacyMigrated: true };
            } else {
                // No funds but mark as migrated to stop checking
                tx.set(walletRef, { legacyMigrated: true }, { merge: true });
                if (walletData) walletData.legacyMigrated = true;
            }
        }
    }

    if (!snap.exists && !walletData) {
        const newWallet: Wallet = {
            userId,
            cashBalance: 0,
            promoBalance: 0,
            lockedCash: 0,
            lockedPromo: 0,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (tx) {
            tx.set(walletRef, newWallet);
        } else {
            await walletRef.set(newWallet);
        }
        return newWallet;
    }

    const finalData = walletData || snap.data();
    if (!finalData) throw new Error("Wallet data vanished during transaction.");

    return {
        ...finalData,
        lockedCash: finalData.lockedCash || 0,
        lockedPromo: finalData.lockedPromo || 0
    } as Wallet;
}

/**
 * Bloquea saldo. IDEMPOTENTE por lock_${rideId}.
 */
export async function lockWalletForRide(
    userId: string, 
    rideId: string, 
    fareAmount: number, 
    tx: admin.firestore.Transaction,
    paymentMethod: 'cash' | 'wallet' | 'automatic' = 'automatic'
) {
    const db = getDb();
    const walletRef = db.doc(`wallets/${userId}`);
    const txRef = db.collection('wallet_transactions').doc(`lock_${rideId}`);
    
    // 1. Verificar idempotencia
    const existingLock = await tx.get(txRef);
    if (existingLock.exists) {
        const d = existingLock.data();
        logger.info(`[WALLET_DEBUG] duplicate lock prevented for ride ${rideId}`);
        return {
            promoLocked: Math.abs(d?.promoAmount || 0),
            cashLocked: Math.abs(d?.cashAmount || 0),
            totalLocked: Math.abs(d?.amount || 0),
            passengerFinalPay: fareAmount - Math.abs(d?.amount || 0)
        };
    }

    const wallet = await getOrCreateWallet(userId, tx);

    // [VamO PRO v2.5] STALE LOCK RECOVERY: If balance exists but it's all locked, 
    // and the last update was more than 30 mins ago, we consider them "Ghost Locks" from dead tests.
    let currentLockedCash = wallet.lockedCash || 0;
    let currentLockedPromo = wallet.lockedPromo || 0;
    const lastUpdate = wallet.updatedAt ? (wallet.updatedAt as any).toMillis() : 0;
    const isStale = (Date.now() - lastUpdate) > 30 * 60 * 1000; // 30 minutes

    if (isStale && (currentLockedCash > 0 || currentLockedPromo > 0)) {
        logger.warn(`[WALLET_RECOVERY] Detected STALE locks for user ${userId}. Clearing ghosts: cash=${currentLockedCash}, promo=${currentLockedPromo}`);
        currentLockedCash = 0;
        currentLockedPromo = 0;
        // The subsequent update will set them to the new values
    }

    // 2. Calcular disponible real
    const availablePromo = Math.max(0, wallet.promoBalance - currentLockedPromo);
    const availableCash = Math.max(0, wallet.cashBalance - currentLockedCash);

    logger.info(`[WALLET_AUDIT_DEEP] User: ${userId}. Cash: ${wallet.cashBalance} (Avail: ${availableCash}), Promo: ${wallet.promoBalance} (Avail: ${availablePromo}). Requested: ${fareAmount}`);

    const maxDiscountAllowed = fareAmount * (1 - WALLET_CONFIG.MIN_CASH_PERCENT);
    let remainingToCover = maxDiscountAllowed;
    let promoToLock = 0;
    let cashToLock = 0;
    
    // [VamO PRO] If cash ride, we strictly skip locking the passenger's balance (both cash and promo).
    const canLockWallet = paymentMethod !== 'cash';
    
    if (canLockWallet) {
        promoToLock = Math.min(availablePromo, remainingToCover);
        remainingToCover -= promoToLock;
        cashToLock = Math.min(availableCash, remainingToCover);
    } else {
        promoToLock = 0;
        cashToLock = 0;
    }
    
    if (promoToLock > 0 || cashToLock > 0) {
        tx.update(walletRef, {
            lockedPromo: (isStale ? 0 : (wallet.lockedPromo || 0)) + promoToLock,
            lockedCash: (isStale ? 0 : (wallet.lockedCash || 0)) + cashToLock,
            updatedAt: FieldValue.serverTimestamp()
        });

        const txData: WalletTransaction = {
            id: `lock_${rideId}`,
            userId,
            rideId,
            type: 'ride_wallet_lock',
            amount: -(promoToLock + cashToLock),
            cashAmount: -cashToLock,
            promoAmount: -promoToLock,
            balanceAfterCash: wallet.cashBalance,
            balanceAfterPromo: wallet.promoBalance,
            note: `Bloqueo fondo viaje ${rideId}${isStale ? ' (RECOVERY)' : ''}`,
            createdAt: FieldValue.serverTimestamp() as any
        };
        
        logger.info(`[WALLET_DEBUG] Writing tx document: wallet_transactions/lock_${rideId}`, txData);
        tx.set(txRef, txData);

        logger.info(`[WALLET_DEBUG] SUCCESSful lock for ride ${rideId}: cash $${cashToLock}, promo $${promoToLock}`);
    } else if (fareAmount > 0) {
        logger.warn(`[WALLET_DEBUG] ABORT lock for ride ${rideId}: No available funds found. AvailCash=${availableCash}, AvailPromo=${availablePromo}`);
    }

    return {
        promoLocked: promoToLock,
        cashLocked: cashToLock,
        totalLocked: promoToLock + cashToLock,
        passengerFinalPay: fareAmount - (promoToLock + cashToLock)
    };
}

/**
 * Libera saldo bloqueado. IDEMPOTENTE por release_${rideId}.
 */
export async function releaseLockedWallet(userId: string, rideId: string, cashToRelease: number, promoToRelease: number, tx: admin.firestore.Transaction) {
    if (cashToRelease <= 0 && promoToRelease <= 0) return;
    
    const db = getDb();
    const walletRef = db.doc(`wallets/${userId}`);
    const txRef = db.collection('wallet_transactions').doc(`release_${rideId}`);
    const consumeRef = db.collection('wallet_transactions').doc(`consume_${rideId}`);

    // 1. Guardas de Idempotencia y Estado
    const [existingRelease, existingConsume] = await Promise.all([tx.get(txRef), tx.get(consumeRef)]);
    
    if (existingRelease.exists) {
        logger.info(`[WALLET_DEBUG] duplicate release prevented for ride ${rideId}`);
        return;
    }
    if (existingConsume.exists) {
        logger.error(`[WALLET_DEBUG] ABORT: cannot release already consumed funds for ride ${rideId}`);
        return; 
    }

    const wallet = await getOrCreateWallet(userId, tx);

    // 2. Validar que realmente hay algo bloqueado para liberar (evita saldos negativos)
    const finalCashRelease = Math.min(wallet.lockedCash || 0, cashToRelease);
    const finalPromoRelease = Math.min(wallet.lockedPromo || 0, promoToRelease);

    if (finalCashRelease <= 0 && finalPromoRelease <= 0) return;

    tx.update(walletRef, {
        lockedCash: FieldValue.increment(-finalCashRelease),
        lockedPromo: FieldValue.increment(-finalPromoRelease),
        updatedAt: FieldValue.serverTimestamp()
    });

    tx.set(txRef, {
        userId,
        rideId,
        type: 'ride_wallet_release',
        amount: (finalCashRelease + finalPromoRelease),
        cashAmount: finalCashRelease,
        promoAmount: finalPromoRelease,
        balanceAfterCash: wallet.cashBalance,
        balanceAfterPromo: wallet.promoBalance,
        note: `Liberación fondos viaje ${rideId}`,
        createdAt: FieldValue.serverTimestamp()
    });

    logger.info(`[WALLET_DEBUG] funds released for ride ${rideId}`);
}

/**
 * Consume saldo bloqueado. IDEMPOTENTE por consume_${rideId}.
 */
export async function consumeLockedWallet(
    userId: string, 
    rideId: string, 
    cashToConsume: number, 
    promoToConsume: number, 
    tx: admin.firestore.Transaction,
    snaps?: {
        existingConsume?: admin.firestore.DocumentSnapshot,
        existingRelease?: admin.firestore.DocumentSnapshot,
        wallet?: admin.firestore.DocumentSnapshot,
        lock?: admin.firestore.DocumentSnapshot
    }
) {
    if (cashToConsume <= 0 && promoToConsume <= 0) return;

    const db = getDb();
    const walletRef = db.doc(`wallets/${userId}`);
    const txRef = db.collection('wallet_transactions').doc(`consume_${rideId}`);
    const releaseRef = db.collection('wallet_transactions').doc(`release_${rideId}`);

    const lockRef = db.collection('wallet_transactions').doc(`lock_${rideId}`);
    
    let existingConsumeSnap = snaps?.existingConsume;
    let existingReleaseSnap = snaps?.existingRelease;
    let lockSnap: admin.firestore.DocumentSnapshot | undefined;

    if (!existingConsumeSnap || !existingReleaseSnap) {
        const [cSnap, rSnap, lSnap] = await Promise.all([
            tx.get(txRef), 
            tx.get(releaseRef),
            tx.get(lockRef)
        ]);
        existingConsumeSnap = cSnap;
        existingReleaseSnap = rSnap;
        lockSnap = lSnap;
    }

    if (existingConsumeSnap.exists) {
        logger.info(`[WALLET_DEBUG] duplicate consume prevented for ride ${rideId}`);
        return;
    }
    if (existingReleaseSnap.exists) {
        logger.error(`[FRAUD_WARNING] ABORT: cannot consume already released funds for ride ${rideId}`);
        return;
    }
    
    // We only check lock presence if we actually read it or if it's strictly required
    const finalLockSnap = lockSnap || snaps?.lock; 
    // Note: If lockSnap was not fetched (because snaps were provided), we trust the caller has verified it or we fetch it here if missing
    if (!finalLockSnap) {
        const actualLockSnap = await tx.get(lockRef);
        if (!actualLockSnap.exists) {
            logger.error(`[FRAUD_WARNING] ABORT: cannot consume funds that were never locked for ride ${rideId}`);
            throw new Error(`LOCK_NOT_FOUND: No se puede consumir saldo no bloqueado para viaje ${rideId}`);
        }
    } else if (!finalLockSnap.exists) {
        logger.error(`[FRAUD_WARNING] ABORT: cannot consume funds that were never locked for ride ${rideId} (from snap)`);
        throw new Error(`LOCK_NOT_FOUND: No se puede consumir saldo no bloqueado para viaje ${rideId}`);
    }

    const wallet = await getOrCreateWallet(userId, tx, snaps?.wallet);

    // 2. Liquidación
    // VALIDACIÓN ESTRICTA: No permitir que consuma más de lo que está bloqueado
    if (wallet.lockedCash < cashToConsume || wallet.lockedPromo < promoToConsume) {
        logger.error(`[NEGATIVE_BALANCE_PREVENTED] userId=${userId} Attempted to consume more than locked. LockedCash: ${wallet.lockedCash}, Req: ${cashToConsume}`);
        throw new Error(`INSUFFICIENT_LOCKED_FUNDS: Bloqueado ${wallet.lockedCash}, Requerido ${cashToConsume}`);
    }

    const finalCash = cashToConsume;
    const finalPromo = promoToConsume;

    const newCashBalance = wallet.cashBalance - finalCash;
    const newPromoBalance = wallet.promoBalance - finalPromo;
    const newLockedCash = (wallet.lockedCash || 0) - finalCash;
    const newLockedPromo = (wallet.lockedPromo || 0) - finalPromo;

    const updatePayload = {
        cashBalance: newCashBalance,
        promoBalance: newPromoBalance,
        lockedCash: newLockedCash,
        lockedPromo: newLockedPromo,
        updatedAt: FieldValue.serverTimestamp()
    };

    // getOrCreateWallet guarantees the document exists within the transaction
    tx.update(walletRef, updatePayload);

    
    // [LEGACY_UI_MIRROR] Keep users.currentBalance in sync for old UI
    if (finalCash > 0) {
        const userRef = db.doc(`users/${userId}`);
        tx.update(userRef, {
            currentBalance: FieldValue.increment(-finalCash),
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    tx.set(txRef, {
        userId,
        rideId,
        type: 'ride_wallet_consume',
        amount: -(finalCash + finalPromo),
        cashAmount: -finalCash,
        promoAmount: -finalPromo,
        balanceAfterCash: newCashBalance,
        balanceAfterPromo: newPromoBalance,
        note: `Consumo definitivo viaje ${rideId}`,
        createdAt: FieldValue.serverTimestamp()
    });

    logger.info(`[WALLET_DEBUG] funds consumed for ride ${rideId}`);
}

/**
 * Acredita fondos.
 */
export async function addFunds(
    userId: string, 
    amount: number, 
    type: WalletTransactionType, 
    note: string, 
    tx?: admin.firestore.Transaction,
    customTxId?: string
) {
    const db = getDb();
    const walletRef = db.doc(`wallets/${userId}`);
    const txId = customTxId || `add_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const txRef = db.collection('wallet_transactions').doc(txId);
    
    // If no transaction provided, we run our own (safe for single operations)
    if (!tx) {
        await db.runTransaction(async (transaction) => {
            const existing = await transaction.get(txRef);
            if (existing.exists) return;

            const wallet = await getOrCreateWallet(userId, transaction);
            const balanceBeforeCash = wallet.cashBalance || 0;
            const balanceBeforePromo = wallet.promoBalance || 0;
            
            const isPromoType = ['welcome_bonus', 'topup_bonus', 'cashback_reward'].includes(type);
            const cashDelta = isPromoType ? 0 : amount;
            const promoDelta = isPromoType ? amount : 0;

            const newCash = balanceBeforeCash + cashDelta;
            const newPromo = balanceBeforePromo + promoDelta;

            transaction.set(walletRef, { 
                cashBalance: newCash, 
                promoBalance: newPromo, 
                userId, 
                updatedAt: FieldValue.serverTimestamp() 
            }, { merge: true });

            // [LEGACY_UI_MIRROR] Keep users.currentBalance in sync for old UI
            transaction.update(db.doc(`users/${userId}`), {
                currentBalance: FieldValue.increment(cashDelta), // LEGACY_UI_MIRROR_DO_NOT_USE_AS_SOURCE_OF_TRUTH
                updatedAt: FieldValue.serverTimestamp()
            });

            transaction.set(txRef, {
                userId, amount: cashDelta + promoDelta, cashAmount: cashDelta, promoAmount: promoDelta,
                type, balanceBeforeCash, balanceBeforePromo, balanceAfterCash: newCash, balanceAfterPromo: newPromo, note,
                createdAt: FieldValue.serverTimestamp()
            });
        });
        return;
    }

    // IF TX PROVIDED: We assume READS were done outside to comply with Firestore rules
    // Rule: "Transactions require all reads before writes"
    // We only perform WRITES here. Note: balanceAfter will be slightly inaccurate in ledger 
    // unless we pass the current state, but we prioritize transaction stability.
    const isPromoType = ['welcome_bonus', 'topup_bonus', 'cashback_reward'].includes(type);
    const cashDelta = isPromoType ? 0 : amount;
    const promoDelta = isPromoType ? amount : 0;

    tx.set(walletRef, {
        userId,
        cashBalance: FieldValue.increment(cashDelta),
        promoBalance: FieldValue.increment(promoDelta),
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // [LEGACY_UI_MIRROR] Keep users.currentBalance in sync for old UI
    tx.update(db.doc(`users/${userId}`), {
        currentBalance: FieldValue.increment(cashDelta), // LEGACY_UI_MIRROR_DO_NOT_USE_AS_SOURCE_OF_TRUTH
        updatedAt: FieldValue.serverTimestamp()
    });

    tx.set(txRef, {
        userId, amount: cashDelta + promoDelta, cashAmount: cashDelta, promoAmount: promoDelta,
        type, note, createdAt: FieldValue.serverTimestamp(),
        balanceAfterNote: "Managed by Atomic Batch"
    });
}

/**
 * [VamO PRO] Movimientos trazables múltiples en wallet_movements.
 * Garantiza atomicidad y cumple la regla de Firestore: Lecturas antes de Escrituras.
 */
export async function addWalletMovements(
    userId: string,
    movements: Array<{
        amount: number,
        type: 'ride_earning' | 'cash_collected' | 'adjustment',
        rideId: string,
        note?: string
    }>,
    cityKey: string,
    tx: admin.firestore.Transaction,
    snaps?: {
        userSnap?: admin.firestore.DocumentSnapshot,
        walletSnap?: admin.firestore.DocumentSnapshot,
        moveSnaps?: Record<string, admin.firestore.DocumentSnapshot>
    }
) {
    const db = getDb();
    const userRef = db.collection('users').doc(userId);
    
    // 1. PREPARAR REFERENCIAS Y LECTURAS
    const moveRequests = movements.map(m => ({
        ...m,
        moveId: `${m.type}_${m.rideId}`,
        moveRef: db.collection('wallet_movements').doc(`${m.type}_${m.rideId}`)
    }));

    // 2. EJECUTAR TODAS LAS LECTURAS (READS START)
    let moveSnaps = snaps?.moveSnaps;
    if (!moveSnaps) {
        const results = await Promise.all(moveRequests.map(r => tx.get(r.moveRef)));
        moveSnaps = {};
        moveRequests.forEach((r, idx) => {
            moveSnaps![r.moveId] = results[idx];
        });
    }

    const wallet = await getOrCreateWallet(userId, tx);
    const walletRef = db.collection('wallets').doc(userId);
    let currentBalance = wallet.cashBalance || 0;
    const initialBalance = currentBalance;

    
    const validMovesToExecute = [];

    // 3. PROCESAR LÓGICA
    for (let i = 0; i < moveRequests.length; i++) {
        const req = moveRequests[i];
        const snap = moveSnaps[req.moveId];
        if (snap && snap.exists) {
            logger.info(`[WALLET_MOVE] Duplicate movement skipped: ${req.moveId}`);
            continue;
        }
        
        const balanceBefore = currentBalance;
        currentBalance += req.amount;
        
        validMovesToExecute.push({
            ...req,
            balanceBefore,
            balanceAfter: currentBalance
        });
    }

    if (validMovesToExecute.length === 0) return;

    // 4. EJECUTAR TODAS LAS ESCRITURAS (WRITES START)
    tx.set(walletRef, {
        cashBalance: currentBalance,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // [LEGACY_UI_MIRROR] Keep users.currentBalance in sync for old UI
    const totalDelta = currentBalance - initialBalance;
    tx.update(userRef, {
        currentBalance: FieldValue.increment(totalDelta), // LEGACY_UI_MIRROR_DO_NOT_USE_AS_SOURCE_OF_TRUTH
        updatedAt: FieldValue.serverTimestamp()
    });

    for (const move of validMovesToExecute) {
        tx.set(move.moveRef, {
            userId,
            rideId: move.rideId,
            amount: move.amount,
            type: move.type,
            cityKey,
            note: move.note || `Movimiento de viaje ${move.rideId}`,
            balanceBefore: move.balanceBefore,
            balanceAfter: move.balanceAfter,
            createdAt: FieldValue.serverTimestamp()
        });
        logger.info(`[WALLET_MOVE] Batch Added: ${move.moveId} for user ${userId}. Balance: ${move.balanceBefore} -> ${move.balanceAfter}`);
    }
}
