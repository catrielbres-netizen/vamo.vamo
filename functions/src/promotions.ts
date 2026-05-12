import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { 
    Promotion, 
    PromotionRedemption, 
    UserProfile, 
    PromotionContext 
} from "./types";
import { getDb } from "./lib/firebaseAdmin";
import { addFunds } from "./lib/wallet";

// Module-level db removed.

/**
 * Internal helper to check if a user qualifies for a specific promotion.
 */
export async function checkPromotionEligibility(
    promotion: Promotion, 
    user: UserProfile, 
    context: { 
        amount?: number; 
        city?: string; 
        isFirstAction?: boolean;
        rideId?: string;
    }
): Promise<{ eligible: boolean; reason?: string }> {
    // 1. Basic Status Checks
    if (!promotion.enabled || promotion.status !== 'active') {
        return { eligible: false, reason: "La promoción no está activa" };
    }

    // 2. Date Checks
    const now = Timestamp.now();
    if (promotion.startsAt && promotion.startsAt.toMillis() > now.toMillis()) {
        return { eligible: false, reason: "La promoción aún no ha comenzado" };
    }
    if (promotion.endsAt && promotion.endsAt.toMillis() < now.toMillis()) {
        return { eligible: false, reason: "La promoción ha vencido" };
    }

    // 3. City Check
    if (promotion.city !== 'global' && context.city && promotion.city !== context.city) {
        return { eligible: false, reason: `Promoción válida solo para ${promotion.city}` };
    }

    // 4. Target Check
    if (promotion.target !== user.role) {
        return { eligible: false, reason: "Tu perfil no es elegible para esta promoción" };
    }

    // 5. Usage Limits Check
    const db = getDb();
    const redemptionsSnap = await db.collection('promotion_redemptions')
        .where('promotionId', '==', promotion.id)
        .where('userId', '==', user.uid)
        .where('status', 'in', ['applied', 'reserved'])
        .get();
    
    if (redemptionsSnap.size >= promotion.limits.maxRedemptionsPerUser) {
        return { eligible: false, reason: "Ya has alcanzado el límite de usos para esta promoción" };
    }

    if (promotion.limits.maxTotalRedemptions) {
        // Warning: This could be slow for global promos, ideally use a counter document
        const totalRedemptionsSnap = await db.collection('promotion_redemptions')
            .where('promotionId', '==', promotion.id)
            .where('status', 'in', ['applied', 'reserved'])
            .count()
            .get();
        
        if (totalRedemptionsSnap.data().count >= promotion.limits.maxTotalRedemptions) {
            return { eligible: false, reason: "La promoción ha alcanzado su límite total de usos" };
        }
    }

    // 6. Context Specific Conditions
    const { conditions } = promotion;

    if (conditions.minAmount && (!context.amount || context.amount < conditions.minAmount)) {
        return { eligible: false, reason: `Monto mínimo requerido: $${conditions.minAmount}` };
    }

    if (conditions.maxAmount && context.amount && context.amount > conditions.maxAmount) {
        return { eligible: false, reason: `Monto máximo superado: $${conditions.maxAmount}` };
    }

    if (conditions.isFirstAction && !context.isFirstAction) {
        return { eligible: false, reason: "Solo válido para tu primera acción" };
    }

    if (conditions.daysInactive && user.lastRideCompletedAt) {
        const lastRide = user.lastRideCompletedAt.toMillis();
        const diffDays = (now.toMillis() - lastRide) / (1000 * 60 * 60 * 24);
        if (diffDays < conditions.daysInactive) {
            return { eligible: false, reason: `Requiere ${conditions.daysInactive} días de inactividad` };
        }
    }

    if (conditions.userLevels && conditions.userLevels.length > 0) {
        const userLevel = user.driverLevel || 'bronce'; 
        if (!conditions.userLevels.includes(userLevel)) {
            return { eligible: false, reason: "Tu nivel no califica para esta promoción" };
        }
    }

    return { eligible: true };
}

/**
 * Fetch all available promotions for a given context and user.
 */
export const getAvailablePromotionsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const { context, amount, city }: { context: PromotionContext, amount?: number, city?: string } = request.data;
    const userId = request.auth.uid;
    const db = getDb();

    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'Usuario no encontrado');
    const user = userSnap.data() as UserProfile;

    // Fetch candidate promotions
    const promosQuery = db.collection('promotions')
        .where('enabled', '==', true)
        .where('status', '==', 'active')
        .where('target', '==', user.role)
        .where('context', '==', context)
        .get();
    
    const promosSnap = await promosQuery;
    const eligiblePromos: Promotion[] = [];

    for (const doc of promosSnap.docs) {
        const promo = { id: doc.id, ...doc.data() } as Promotion;
        
        // Basic context match check (already done in query above, but keeping for logic)
        if (promo.context !== context) continue;

        const eligibility = await checkPromotionEligibility(promo, user, { amount, city });
        if (eligibility.eligible) {
            eligiblePromos.push(promo);
        }
    }

    // Sort by priority (higher first)
    eligiblePromos.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return { success: true, promotions: eligiblePromos };
});

/**
 * Apply a promotion to a user / action.
 * Uses a transaction to ensure idempotency and correct balance/state changes.
 */
export const applyPromotionV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { 
        promotionId, 
        contextId, // e.g. transactionId for topup, or rideId
        amount,
        city
    } = request.data;

    const userId = request.auth.uid;
    const db = getDb();
    const redemptionId = `${promotionId}_${userId}_${contextId || 'general'}`;
    const redemptionRef = db.doc(`promotion_redemptions/${redemptionId}`);

    try {
        const result = await db.runTransaction(async (tx) => {
            const redemptionSnap = await tx.get(redemptionRef);
            if (redemptionSnap.exists) {
                const data = redemptionSnap.data() as PromotionRedemption;
                if (data.status === 'applied') {
                    throw new Error("Esta promoción ya fue aplicada para esta acción.");
                }
            }

            const promoSnap = await tx.get(db.doc(`promotions/${promotionId}`));
            if (!promoSnap.exists) throw new Error("Promoción no encontrada.");
            const promo = { id: promoSnap.id, ...promoSnap.data() } as Promotion;

            const userSnap = await tx.get(db.doc(`users/${userId}`));
            if (!userSnap.exists) throw new Error("Usuario no encontrado.");
            const user = userSnap.data() as UserProfile;

            const eligibility = await checkPromotionEligibility(promo, user, { amount, city });
            if (!eligibility.eligible) {
                throw new Error(eligibility.reason || "No eres elegible para esta promoción.");
            }

            // Calculate Reward Amount
            let rewardApplied = 0;
            if (promo.reward.type === 'fixed') {
                rewardApplied = promo.reward.value;
            } else {
                rewardApplied = Math.floor((amount || 0) * (promo.reward.value / 100));
                if (promo.reward.cap && rewardApplied > promo.reward.cap) {
                    rewardApplied = promo.reward.cap;
                }
            }

            if (rewardApplied <= 0) {
                throw new Error("El beneficio calculado es $0. No se puede aplicar.");
            }

            // --- BUSINESS LOGIC BY CONTEXT ---
            if (promo.context === 'topup') {
                // For topups, we add to the driver balance
                // IMPORTANT: This assumes the topup transaction itself is being processed separately or here.
                // If it's a bonus, we just add it to 'currentBalance'.
                // [STAGE 2A] Unified Wallet Promotion Reward
                // addFunds handles wallets.cashBalance, wallet_transactions and legacy mirror users.currentBalance
                await addFunds(
                    userId,
                    rewardApplied,
                    'topup_bonus', // Using topup_bonus for promo rewards
                    `Promo: ${promo.name}`,
                    tx,
                    redemptionId
                );

            } else if (promo.context === 'ride') {
                // For rides, the reward is usually a discount handled during createRideV1 or settleRide.
                // Here we might just record the intent if it's applied before payment.
            }

            // Create Redemption Record
            const redemption: PromotionRedemption = {
                id: redemptionId,
                promotionId,
                userId,
                role: user.role,
                redeemedAt: FieldValue.serverTimestamp(),
                rewardApplied,
                status: 'applied',
                transactionId: promo.context === 'topup' ? contextId : undefined,
                rideId: promo.context === 'ride' ? contextId : undefined
            };

            tx.set(redemptionRef, redemption);

            return { success: true, rewardApplied, promoName: promo.name };
        });

        logger.info(`[applyPromotionV1] SUCCESS: ${userId} applied ${promotionId} (Reward: ${result.rewardApplied})`);
        return result;

    } catch (error: any) {
        logger.error(`[applyPromotionV1] FAILED: ${userId} for promo ${promotionId}`, error);
        throw new HttpsError('internal', error.message || 'Error al aplicar la promoción.');
    }
});
