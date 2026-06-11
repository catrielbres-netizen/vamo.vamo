import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getDb } from './lib/firebaseAdmin';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { addFunds } from './lib/wallet';

// Helper to calculate YYYY-Www based on Argentina Timezone
export function getPassengerWeekIdForDate(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    
    const argDate = new Date(Date.UTC(y, m, day));
    const dayNum = argDate.getUTCDay() || 7;
    argDate.setUTCDate(argDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(argDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((argDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${argDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getCurrentPassengerWeekId(): string {
    return getPassengerWeekIdForDate(new Date());
}

export function getPreviousPassengerWeekId(): string {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getPassengerWeekIdForDate(d);
}

const BASE_AMOUNT = 20000;
const MAX_AMOUNT = 600000;
const AMOUNT_PER_TRIP = 100;

/**
 * INIT PASSENGER WEEKLY POOL
 * Runs every Monday at 00:00 AM ART
 */
export const initPassengerWeeklyPoolDocV1 = onSchedule({
    schedule: '0 0 * * 1', // Cada Lunes a las 00:00
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'us-central1',
}, async (_event) => {
    const db = getDb();
    const weekId = getCurrentPassengerWeekId();
    
    const citiesSnap = await db.collection('cities').where('status', '==', 'active').get();
    if (citiesSnap.empty) {
        logger.warn('[PASSENGER_POOL_INIT] No hay ciudades activas. No se crea ningún pool.');
        return;
    }

    const now = FieldValue.serverTimestamp();
    for (const cityDoc of citiesSnap.docs) {
        const cityKey = cityDoc.id;
        const poolRef = db.collection('cities').doc(cityKey).collection('passenger_weekly_pools').doc(weekId);
        
        const snap = await poolRef.get();
        if (!snap.exists) {
            await poolRef.set({
                cityKey,
                weekId,
                baseAmount: BASE_AMOUNT,
                totalAmount: BASE_AMOUNT,
                completedTripsTotal: 0,
                amountPerTrip: AMOUNT_PER_TRIP,
                status: 'active',
                updatedAt: now,
                createdAt: now
            });
            logger.info(`[PASSENGER_POOL_INIT] Pool creado para la ciudad ${cityKey} (Semana ${weekId}).`);
        }
    }
});

/**
 * DISTRIBUTE PASSENGER WEEKLY POOL
 * Runs every Sunday at 23:55 ART
 */
export const distributePassengerWeeklyPoolV1 = onSchedule({
    schedule: '55 23 * * 0', // Domingos a las 23:55
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'us-central1',
    timeoutSeconds: 540, // Larga duración
}, async (_event) => {
    const db = getDb();
    const weekId = getCurrentPassengerWeekId();
    
    const citiesSnap = await db.collection('cities').where('status', '==', 'active').get();
    if (citiesSnap.empty) return;

    const now = FieldValue.serverTimestamp();

    for (const cityDoc of citiesSnap.docs) {
        const cityKey = cityDoc.id;
        logger.info(`[PASSENGER_POOL_DIST] Evaluando ciudad: ${cityKey} para semana: ${weekId}`);

        const poolDocRef = db.collection('cities').doc(cityKey).collection('passenger_weekly_pools').doc(weekId);
        const poolSnap = await poolDocRef.get();
        
        if (!poolSnap.exists) {
            logger.warn(`[PASSENGER_POOL_DIST] No hay pozo para ${cityKey} en la semana ${weekId}.`);
            continue;
        }

        const poolData = poolSnap.data();
        if (poolData?.status === 'distributed') {
            logger.info(`[PASSENGER_POOL_DIST] Pozo ya distribuido para ${cityKey}.`);
            continue;
        }

        // Obtener Top 100 pasajeros de la semana
        const topPassengersSnap = await db.collection('cities').doc(cityKey).collection('passenger_points')
            .where('weekId', '==', weekId)
            .where('weeklyTripsCount', '>', 0)
            .orderBy('weeklyTripsCount', 'desc')
            .limit(100)
            .get();

        if (topPassengersSnap.empty) {
            logger.info(`[PASSENGER_POOL_DIST] No hubo viajes válidos en ${cityKey} esta semana.`);
            await poolDocRef.update({ status: 'distributed', updatedAt: now });
            continue;
        }

        let rank = 1;
        for (const passengerDoc of topPassengersSnap.docs) {
            const data = passengerDoc.data();
            const passengerId = data.passengerId;
            let payoutAmount = 0;

            if (rank <= 10) payoutAmount = 15000;
            else if (rank <= 30) payoutAmount = 8000;
            else if (rank <= 60) payoutAmount = 5000;
            else if (rank <= 100) payoutAmount = 3500;

            if (payoutAmount > 0) {
                try {
                    // Pagar premio a la billetera
                    await addFunds(passengerId, payoutAmount, 'adjustment', `Premio Pozo Semanal Pasajeros - Puesto #${rank}`);

                    const batch = db.batch();
                    
                    // Notificación In-App
                    const notifRef = db.collection('notifications').doc(passengerId).collection('items').doc();
                    batch.set(notifRef, {
                        userId: passengerId,
                        role: 'passenger',
                        type: 'payment_received',
                        title: '¡Recibiste el Premio del Pozo Semanal!',
                        message: `Felicitaciones por quedar en el Puesto #${rank}. Se te acreditaron $${payoutAmount} de saldo a tu favor para tus próximos viajes.`,
                        read: false,
                        priority: 'success',
                        actionUrl: '/dashboard/rewards',
                        createdAt: now,
                    });

                    // Trazabilidad
                    const ptRef = db.collection('platform_transactions').doc();
                    batch.set(ptRef, {
                        userId: passengerId,
                        amount: payoutAmount,
                        type: 'passenger_weekly_pool_bonus',
                        description: `Premio Pozo Pasajeros VamO - Puesto #${rank}`,
                        status: 'completed',
                        createdAt: now,
                    });

                    await batch.commit();
                    logger.info(`[PASSENGER_POOL_DIST] Premio $${payoutAmount} acreditado a pasajero ${passengerId} (Rank #${rank}).`);
                } catch (err) {
                    logger.error(`[PASSENGER_POOL_DIST] Error acreditando a pasajero ${passengerId}:`, err);
                }
            }
            rank++;
        }

        // Marcar pozo como distribuido
        await poolDocRef.update({
            status: 'distributed',
            distributedAt: now,
            updatedAt: now,
        });
    }
});

/**
 * HELPER: incrementPassengerPoints
 * Llamado desde los handlers de viajes al finalizar un viaje válido.
 */
export async function incrementPassengerPoints(passengerId: string, passengerName: string, cityKey: string) {
    const db = getDb();
    const weekId = getCurrentPassengerWeekId();
    const now = FieldValue.serverTimestamp();

    const pointsRef = db.collection('cities').doc(cityKey).collection('passenger_points').doc(`${passengerId}_${weekId}`);
    const poolRef = db.collection('cities').doc(cityKey).collection('passenger_weekly_pools').doc(weekId);

    const batch = db.batch();

    // Actualizar puntos del pasajero
    batch.set(pointsRef, {
        passengerId,
        passengerName,
        weekId,
        weeklyTripsCount: FieldValue.increment(1),
        lastUpdated: now
    }, { merge: true });

    // Actualizar pozo general (incrementamos 100, la UI lo limita a 600.000 visualmente, pero igual limitaremos en DB si se puede)
    // Usamos merge por si no existe aún el pool
    batch.set(poolRef, {
        cityKey,
        weekId,
        totalAmount: FieldValue.increment(AMOUNT_PER_TRIP),
        completedTripsTotal: FieldValue.increment(1),
        updatedAt: now,
    }, { merge: true });

    await batch.commit();
}
