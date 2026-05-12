
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { PassengerCredit, Referral, UserProfile } from '../types';
import { getDb } from './firebaseAdmin';

/**
 * REGLA FINANCIERA OBLIGATORIA:
 * El sistema de incentivos nunca debe consumir más del 50% de la comisión promedio por viaje.
 */

export const INCENTIVE_CONFIG = {
    CASHBACK_PERCENT: parseInt(process.env.CASHBACK_PERCENT || '5'),        
    MAX_TOTAL_DISCOUNT_PERCENT: parseInt(process.env.MAX_TOTAL_DISCOUNT_PERCENT || '30'),
    FIRST_RIDE_BONUS: parseInt(process.env.FIRST_RIDE_BONUS || '1000'),      
    REFERRAL_REWARD: parseInt(process.env.REFERRAL_REWARD || '500'),        
    CASHBACK_EXPIRY_DAYS: parseInt(process.env.CASHBACK_EXPIRY_DAYS || '7'),
    FIRST_RIDE_EXPIRY_HOURS: parseInt(process.env.FIRST_RIDE_EXPIRY_HOURS || '48'),
    REFERRAL_EXPIRY_DAYS: parseInt(process.env.REFERRAL_EXPIRY_DAYS || '30')
};

/**
 * Calcula y bloquea créditos respetando un presupuesto global de incentivos.
 */
export async function calculateAndLockCredits(
    userId: string, 
    rideId: string,
    totalFare: number, 
    globalIncentiveBudget: number,
    tx: admin.firestore.Transaction
): Promise<{ creditAmount: number, creditIds: string[] }> {
    const db = getDb();
    const now = Timestamp.now();

    // 0. CHECK IDEMPOTENCIA
    const existingLockQuery = db.collection('passenger_credits')
        .where('rideId', '==', rideId)
        .where('status', '==', 'locked');
    
    const existingLockSnap = await tx.get(existingLockQuery);
    if (!existingLockSnap.empty) {
        let totalLocked = 0;
        const ids: string[] = [];
        existingLockSnap.docs.forEach(d => {
            totalLocked += d.data().lockedAmount || 0;
            ids.push(d.id);
        });
        logger.info(`[INCENTIVES_DEBUG] duplicate prevented: credits already locked for ride ${rideId}`);
        return { creditAmount: totalLocked, creditIds: ids };
    }

    // 1. Buscar créditos activos
    const creditsQuery = db.collection('passenger_credits')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .where('expiresAt', '>', now);

    const creditsSnap = await tx.get(creditsQuery);
    if (creditsSnap.empty) return { creditAmount: 0, creditIds: [] };

    let availablePool = 0;
    creditsSnap.docs.forEach(doc => {
        availablePool += doc.data().amount;
    });

    // 2. Aplicar el presupuesto global
    const finalCreditToLock = Math.min(availablePool, Math.max(0, globalIncentiveBudget));
    
    if (finalCreditToLock <= 0) return { creditAmount: 0, creditIds: [] };

    // 3. Bloqueo Proporcional
    let remainingToLock = finalCreditToLock;
    const lockedIds: string[] = [];

    const sortedCandidates = creditsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as PassengerCredit))
        .sort((a, b) => (a.expiresAt.toMillis() - b.expiresAt.toMillis()));

    for (const credit of sortedCandidates) {
        if (remainingToLock <= 0) break;

        const lockAmount = Math.min(credit.amount, remainingToLock);
        tx.update(db.doc(`passenger_credits/${credit.id}`), {
            status: 'locked',
            rideId: rideId,
            lockedAmount: lockAmount
        });
        lockedIds.push(credit.id);
        remainingToLock -= lockAmount;
    }

    logger.info(`[INCENTIVES_DEBUG] credits locked: $${finalCreditToLock} for ride ${rideId}`);
    return { creditAmount: finalCreditToLock, creditIds: lockedIds };
}

/**
 * Libera los créditos bloqueados. 
 * IDEMPOTENCIA: Solo actúa sobre documentos en estado 'locked'.
 */
export async function releaseLockedCredits(rideId: string) {
    const db = getDb();
    const lockedSnap = await db.collection('passenger_credits')
        .where('rideId', '==', rideId)
        .where('status', '==', 'locked')
        .get();

    if (lockedSnap.empty) {
        logger.info(`[INCENTIVES_DEBUG] duplicate prevented: no locked credits found for release on ride ${rideId}`);
        return;
    }

    const batch = db.batch();
    lockedSnap.forEach(doc => {
        batch.update(doc.ref, {
            status: 'active',
            rideId: FieldValue.delete(),
            lockedAmount: FieldValue.delete()
        });
    });
    await batch.commit();
    logger.info(`[INCENTIVES_DEBUG] credits released: for ride ${rideId}`);
}

/**
 * Consume los créditos bloqueados.
 */
export async function finalizeCreditConsumption(rideId: string, tx?: admin.firestore.Transaction) {
    const db = getDb();
    const lockedQuery = db.collection('passenger_credits')
        .where('rideId', '==', rideId)
        .where('status', '==', 'locked');

    const lockedSnap = tx ? await tx.get(lockedQuery) : await lockedQuery.get();

    if (lockedSnap.empty) {
        logger.info(`[INCENTIVES_DEBUG] duplicate prevented: no locked credits to consume for ride ${rideId}`);
        return;
    }

    let totalConsumed = 0;
    lockedSnap.forEach(doc => {
        const data = doc.data();
        const lockedAmount = data.lockedAmount || 0;
        const newAmount = Math.max(0, data.amount - lockedAmount);
        totalConsumed += lockedAmount;

        const updateData = {
            amount: newAmount,
            status: newAmount <= 0 ? 'used' : 'active',
            rideId: FieldValue.delete(),
            lockedAmount: FieldValue.delete(),
            consumedAt: FieldValue.serverTimestamp()
        };

        if (tx) {
            tx.update(doc.ref, updateData);
        } else {
            // we should avoid doing this outside tx, but for compatibility:
            doc.ref.update(updateData);
        }
    });
    logger.info(`[INCENTIVES_DEBUG] credits consumed: $${totalConsumed} for ride ${rideId}`);
}

/**
 * Otorga cashback con ID DETERMINISTICO.
 */
export async function awardCashback(userId: string, rideId: string, fareAmount: number, tx?: admin.firestore.Transaction) {
    const db = getDb();
    const docId = `cashback_${rideId}`;
    const cashbackRef = db.doc(`passenger_credits/${docId}`);

    const existing = tx ? await tx.get(cashbackRef) : await cashbackRef.get();
    if (existing.exists) {
        logger.info(`[INCENTIVES_DEBUG] duplicate prevented: cashback already awarded for ride ${rideId}`);
        return;
    }

    const cashbackAmount = Math.floor(fareAmount * (INCENTIVE_CONFIG.CASHBACK_PERCENT / 100));
    if (cashbackAmount <= 0) return;

    // Acreditar Cashback directamente en promoBalance de Wallet
    const { addFunds } = require('./wallet');
    await addFunds(
        userId, 
        cashbackAmount, 
        'cashback_reward', 
        `Cashback por viaje ${rideId.slice(-6)}`, 
        tx
    );

    logger.info(`[INCENTIVES_DEBUG] cashback awarded: $${cashbackAmount} for ride ${rideId}`);
}

/**
 * Procesa recompensas de referidos.
 */
export async function processReferralCompletion(userId: string, rideId: string, tx?: admin.firestore.Transaction) {
    const db = getDb();
    const referralsQuery = db.collection('referrals')
        .where('referredId', '==', userId)
        .where('status', '==', 'pending')
        .limit(1);

    const referralsSnap = tx ? await tx.get(referralsQuery) : await referralsQuery.get();

    if (referralsSnap.empty) return;

    const referralDoc = referralsSnap.docs[0];
    const referralData = referralDoc.data() as Referral;

    // [CRITICAL FIX] Perform all READS before any WRITES in the transaction.
    // We need to check if credits already exist for both parties before performing any updates.
    const referrerCreditId = `ref_referrer_${rideId}`;
    const referredCreditId = `ref_referred_${rideId}`;
    const referrerCreditRef = db.doc(`passenger_credits/${referrerCreditId}`);
    const referredCreditRef = db.doc(`passenger_credits/${referredCreditId}`);

    const [referrerCreditSnap, referredCreditSnap] = tx 
        ? await Promise.all([tx.get(referrerCreditRef), tx.get(referredCreditRef)])
        : await Promise.all([referrerCreditRef.get(), referredCreditRef.get()]);

    const referralUpdate = {
        status: 'completed' as const,
        completedAt: FieldValue.serverTimestamp(),
        rideId: rideId
    };

    if (tx) {
        tx.update(referralDoc.ref, referralUpdate);
    } else {
        await referralDoc.ref.update(referralUpdate);
    }

    const grant = async (targetId: string, role: 'referrer' | 'referred', existingSnap: admin.firestore.DocumentSnapshot) => {
        if (existingSnap.exists) return;

        const docId = `ref_${role}_${rideId}`;
        const creditRef = db.doc(`passenger_credits/${docId}`);
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + INCENTIVE_CONFIG.REFERRAL_EXPIRY_DAYS);
        const creditData = {
            userId: targetId,
            amount: INCENTIVE_CONFIG.REFERRAL_REWARD,
            initialAmount: INCENTIVE_CONFIG.REFERRAL_REWARD,
            source: 'referral' as const,
            // [FASE 1] rideId here is the ride that triggered the referral unlock, NOT the ride where this credit is used
            triggerRideId: rideId,
            status: 'active' as const,
            maxUsagePercent: INCENTIVE_CONFIG.MAX_TOTAL_DISCOUNT_PERCENT,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt)
        };

        if (tx) {
            tx.set(creditRef, creditData);
        } else {
            await creditRef.set(creditData);
        }

        // [FASE 1 — CORRECCIÓN CRÍTICA]
        // El crédito existe en passenger_credits pero NO se acredita en wallet todavía.
        // El saldo llegará a la billetera solo cuando el crédito se consuma en un viaje real.
        // ELIMINADO: addFunds() que causaba doble acreditación ($500 en credits + $500 en wallet).
        logger.info(`[CREDITS] creditCreated | amount=${INCENTIVE_CONFIG.REFERRAL_REWARD} | passengerId=${targetId} | type=referral | role=${role} | creditId=${docId}`);
    };

    await grant(referralData.referrerId, 'referrer', referrerCreditSnap);
    await grant(referralData.referredId, 'referred', referredCreditSnap);
}
