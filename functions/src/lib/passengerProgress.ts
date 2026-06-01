import { FieldValue, Timestamp } from "firebase-admin/firestore";

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { UserProfile } from '../types';

export interface ProgressResult {
    ridesThisWeek: number;
    discountPercent: number;
    currentLevel: 'none' | 'unlocked_10' | 'unlocked_15';
    unlockedBenefit: boolean;
    expressUsesThisWeek: number;
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
    rideId: string,
    expressBenefitApplied: boolean = false
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
                expressUsesThisWeek: number;
            } = {
                ridesThisWeek: 0,
                weeklySubsidySpent: 0,
                weekIdentifier,
                currentLevel: 'none',
                expressUsesThisWeek: 0,
                ...(profile?.passengerProgress || {})
            };

            // --- WEEKLY RESET (lazy, on first ride of new week) ---
            if (progress.weekIdentifier !== weekIdentifier) {
                logger.info(`[EXPRESS] New week detected: ${weekIdentifier}. Resetting progress (no carryover).`);
                progress = { ridesThisWeek: 0, weeklySubsidySpent: 0, weekIdentifier, currentLevel: 'none', expressUsesThisWeek: 0 };
            }

            // --- INCREMENT for this ride ---
            progress.ridesThisWeek = (progress.ridesThisWeek || 0) + 1;
            if (expressBenefitApplied) {
                progress.expressUsesThisWeek = (progress.expressUsesThisWeek || 0) + 1;
            }

            // --- DERIVE discount percent and level using canonical 6-level scale ---
            const discountPercent = getExpressDiscountPercent({ passengerProgress: progress } as any);
            progress.currentLevel = 
                discountPercent >= 15 ? 'unlocked_15' :
                discountPercent >= 10 ? 'unlocked_10' : 'none';

            // --- WRITE user progress ---
            tx.set(userRef, {
                passengerProgress: progress,
                passengerExpressBenefitActive: discountPercent > 0,
                passengerExpressDiscountPercent: discountPercent,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            // --- MARK ride as counted (idempotency flag) ---
            tx.update(rideRef, { weeklyProgressCounted: true });

            const progressResult: ProgressResult = {
                ridesThisWeek: progress.ridesThisWeek,
                discountPercent,
                currentLevel: progress.currentLevel,
                unlockedBenefit: progress.currentLevel !== 'none',
                expressUsesThisWeek: progress.expressUsesThisWeek
            };

            logger.info(`[EXPRESS] Progress updated | passengerId=${passengerId} | ridesThisWeek=${progress.ridesThisWeek} | expressUses=${progress.expressUsesThisWeek}`);
            return progressResult;
        });

        return result;
    } catch (err) {
        logger.error(`[EXPRESS] updatePassengerProgress failed for ${passengerId}/${rideId}:`, err);
        throw err;
    }
}

/**
 * [FASE B] Calcula el porcentaje de descuento Express — regla del 20%.
 * El Beneficio Express se activa cuando el pasajero completa 5 viajes válidos semanales.
 * Límite semanal: Máximo 3 viajes con Beneficio Express.
 * Descuento: 20% (con tope de $2000 en createRideV1)
 */
export function getExpressDiscountPercent(passengerProfile: UserProfile): number {
    const currentWeekId = getWeekIdentifierART(new Date());
    const isCurrentWeek = passengerProfile?.passengerProgress?.weekIdentifier === currentWeekId;
    
    if (!isCurrentWeek) {
        return 0; // Semana vencida, reseteo de beneficio
    }
    
    const rides = passengerProfile?.passengerProgress?.ridesThisWeek ?? 0;
    const expressUsesThisWeek = passengerProfile?.passengerProgress?.expressUsesThisWeek ?? 0;
    
    if (rides < 5) {
        return 0; // No llegó a 5 viajes
    }
    
    if (expressUsesThisWeek >= 3) {
        return 0; // Ya consumió sus 3 usos semanales
    }

    return 20; // 20% de descuento
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


