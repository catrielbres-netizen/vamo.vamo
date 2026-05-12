import { FieldValue, Timestamp } from "firebase-admin/firestore";

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { UserProfile } from '../types';

export interface ProgressResult {
    ridesThisWeek: number;
    discountPercent: 0 | 10 | 15;
    currentLevel: 'none' | 'unlocked_10' | 'unlocked_15';
    unlockedBenefit: boolean;
}

/**
 * [FASE 4] Actualiza el progreso semanal del pasajero después de completar un viaje.
 * 
 * FUENTE ÚNICA: passengerProgress.ridesThisWeek
 * IDEMPOTENCIA: protegido por el campo weeklyProgressCountedRideId en el ride.
 * Llamar FUERA de la transacción principal de settlement.
 */
export async function updatePassengerProgress(
    passengerId: string,
    rideId: string
): Promise<ProgressResult | null> {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(passengerId);
    const rideRef = db.collection('rides').doc(rideId);

    try {
        const result = await db.runTransaction(async (tx) => {
            // --- IDEMPOTENCY GUARD ---
            const rideSnap = await tx.get(rideRef);
            if (rideSnap.data()?.weeklyProgressCounted === true) {
                logger.info(`[EXPRESS] updatePassengerProgress skipped (already counted) | rideId=${rideId}`);
                return null;
            }

            const userSnap = await tx.get(userRef);
            const profile = userSnap.data() as UserProfile;

            const now = new Date();
            const weekIdentifier = getWeekIdentifierART(now);

            // --- INITIALIZE with safe defaults ---
            let progress: {
                ridesThisWeek: number;
                weeklySubsidySpent: number;
                weekIdentifier: string;
                currentLevel: 'none' | 'unlocked_10' | 'unlocked_15';
            } = {
                ridesThisWeek: 0,
                weeklySubsidySpent: 0,
                weekIdentifier,
                currentLevel: 'none',
                ...(profile?.passengerProgress || {})
            };

            // --- WEEKLY RESET (lazy, on first ride of new week) ---
            if (progress.weekIdentifier !== weekIdentifier) {
                logger.info(`[EXPRESS] New week detected: ${weekIdentifier}. Resetting progress.`);

                // Level carries over based on prior week performance
                const prevRides = progress.ridesThisWeek || 0;
                let nextLevel: 'none' | 'unlocked_10' | 'unlocked_15' = 'none';
                if (progress.currentLevel === 'none') {
                    nextLevel = prevRides >= 5 ? 'unlocked_10' : 'none';
                } else if (progress.currentLevel === 'unlocked_10') {
                    nextLevel = prevRides >= 10 ? 'unlocked_15' : prevRides >= 5 ? 'unlocked_10' : 'none';
                } else if (progress.currentLevel === 'unlocked_15') {
                    nextLevel = prevRides >= 10 ? 'unlocked_15' : prevRides >= 5 ? 'unlocked_10' : 'none';
                }

                progress = { ridesThisWeek: 0, weeklySubsidySpent: 0, weekIdentifier, currentLevel: nextLevel };
            }

            // --- INCREMENT for this ride ---
            progress.ridesThisWeek = (progress.ridesThisWeek || 0) + 1;

            // --- MID-WEEK UNLOCK (immediate gratification) ---
            if (progress.currentLevel === 'none' && progress.ridesThisWeek >= 5) {
                progress.currentLevel = 'unlocked_10';
            } else if (progress.currentLevel === 'unlocked_10' && progress.ridesThisWeek >= 10) {
                progress.currentLevel = 'unlocked_15';
            }

            // --- DERIVE discount percent from level ---
            const discountPercent: 0 | 10 | 15 =
                progress.currentLevel === 'unlocked_15' ? 15 :
                progress.currentLevel === 'unlocked_10' ? 10 : 0;

            // --- WRITE user progress ---
            tx.set(userRef, {
                passengerProgress: progress,
                passengerExpressBenefitActive: progress.currentLevel !== 'none',
                passengerExpressDiscountPercent: discountPercent,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            // --- MARK ride as counted (idempotency flag) ---
            tx.update(rideRef, { weeklyProgressCounted: true });

            const progressResult: ProgressResult = {
                ridesThisWeek: progress.ridesThisWeek,
                discountPercent,
                currentLevel: progress.currentLevel,
                unlockedBenefit: progress.currentLevel !== 'none'
            };

            logger.info(`[EXPRESS] Progress updated | passengerId=${passengerId} | ridesThisWeek=${progress.ridesThisWeek} | level=${progress.currentLevel} | discountPercent=${discountPercent}%`);
            return progressResult;
        });

        return result;
    } catch (err) {
        logger.error(`[EXPRESS] updatePassengerProgress failed for ${passengerId}/${rideId}:`, err);
        throw err;
    }
}

/**
 * [FASE 7.1] Calcula el porcentaje de descuento Express — escala endurecida.
 * Fuente única: passengerProgress.ridesThisWeek
 *
 * Escala 6 niveles (más exigente que Fase 7):
 *   0–2  viajes/semana →  0%  (sin descuento, usuarios nuevos)
 *   3–5  viajes/semana →  5%
 *   6–9  viajes/semana →  8%
 *   10–14 viajes/semana → 10%
 *   15–24 viajes/semana → 12%
 *   25+  viajes/semana → 15%  (power users)
 *
 * Fallback: sin progress → 0% (subsidio cero por defecto)
 * Cap externo: MAX_EXPRESS_DISCOUNT = $400 en createRideV1
 */
export function getExpressDiscountPercent(passengerProfile: UserProfile): number {
    const rides = passengerProfile?.passengerProgress?.ridesThisWeek ?? 0;
    let discountPercent = 0;
    if (rides >= 25) discountPercent = 15;
    else if (rides >= 15) discountPercent = 12;
    else if (rides >= 10) discountPercent = 10;
    else if (rides >= 6)  discountPercent = 8;
    else if (rides >= 3)  discountPercent = 5;
    logger.info(`[EXPRESS_HARD] ridesThisWeek=${rides} | discount=${discountPercent}%`);
    return discountPercent;
}

/**
 * Calcula el weekIdentifier usando timezone de Argentina (ART = UTC-3).
 * Usa algoritmo ISO week number.
 */
export function getWeekIdentifierART(date: Date): string {
    // Convertir a tiempo de Argentina (UTC-3)
    const argDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    argDate.setHours(0, 0, 0, 0);
    // ISO week: Thursday of the week determines the year
    const dayOfWeek = argDate.getDay() || 7; // Monday=1 ... Sunday=7
    argDate.setDate(argDate.getDate() + 4 - dayOfWeek);
    const yearStart = new Date(argDate.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((argDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${argDate.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}


