/**
 * VamO – Pozo Semanal (Weekly Pool) v2 – Backend Completo
 * =====================================================
 * Contiene:
 *  1. distributeWeeklyPoolV1       – Scheduled: lunes 00:10 ART
 *  2. adminDistributeWeeklyPoolV1  – Callable: admin/superadmin
 *  3. initWeeklyPoolDocV1          – Scheduled: lunes 00:01 ART (crea el doc del pozo de la semana)
 *
 * REGLAS v2:
 *  - No tocar: viajes, matching, compartidos, tarifas, settlement, municipal, login.
 *  - Idempotente: nunca duplica pagos.
 *  - weekId canónico: YYYY-Www (ej: 2026-W21)
 *  - Multi-ciudad: por cityKey dinámico
 *
 * FÓRMULA:
 *  poolTotal = baseAmount(20000) + completedValidRides * amountPerRide(100)
 *  Tope: $600.000
 *  Top 30 conductores por weeklyTripsCount (viajes finalizados válidos)
 *  Distribución fija por bloque (proporcional al pozo real):
 *    #1-3   → $50.000 base
 *    #4-10  → $25.000 base
 *    #11-20 → $15.000 base
 *    #21-30 → $12.500 base
 *  Premio = basePrize * (poolReal / 600000)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { getDb } from './lib/firebaseAdmin';

// ─── Constantes ──────────────────────────────────────────────────────────────
import { weeklyPoolConfig, getMultiplierForRank } from './config/weeklyPoolConfig';

const BASE_POOL_AMOUNT = weeklyPoolConfig.initialPoolAmount;
const AMOUNT_PER_TRIP = weeklyPoolConfig.contributionPerCompletedTrip;
const MAX_POOL_AMOUNT = weeklyPoolConfig.maxDisplayedGoal;
const MIN_TRIPS_TO_QUALIFY = 1;
const TOP_N = weeklyPoolConfig.eligibleTopCount;


// ─── Helpers de weekId ───────────────────────────────────────────────────────

/**
 * Devuelve el weekId canónico en formato 2026-W21 para una fecha dada.
 * Usa zona horaria America/Argentina/Buenos_Aires.
 */
export function getWeekIdForDate(date: Date): string {
    const argDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const year = argDate.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

/** WeekId de la semana actual */
export function getCurrentWeekId(): string {
    return getWeekIdForDate(new Date());
}

/** WeekId de la semana anterior */
export function getPreviousWeekId(): string {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getWeekIdForDate(d);
}

/** Lunes de inicio de la semana para un weekId */
function getWeekStartDate(weekId: string): string {
    const [year, wPart] = weekId.split('-W');
    const weekNum = parseInt(wPart, 10);
    const jan1 = new Date(parseInt(year, 10), 0, 1);
    const dayOfWeek = jan1.getDay(); // 0=Sun
    const daysToFirstMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() + daysToFirstMonday - 7);
    firstMonday.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
    return firstMonday.toISOString().slice(0, 10);
}

function getWeekEndDate(weekId: string): string {
    const start = new Date(getWeekStartDate(weekId));
    start.setDate(start.getDate() + 6);
    return start.toISOString().slice(0, 10);
}

// ─── Lógica de distribución ───────────────────────────────────────────────────

interface DistributionResult {
    weekId: string;
    poolTotal: number;
    driversCount: number;
    distributions: DistributionEntry[];
    totalPaid: number;
    skippedReason?: string;
}

interface DistributionEntry {
    driverId: string;
    rank: number;
    multiplier: number;
    weeklyPoints: number;
    weeklyTripsCount: number;
    payoutAmount: number;
}

async function computeDistribution(weekId: string, dryRun: boolean, cityKeyParam?: string): Promise<DistributionResult> {
    const db = getDb();
    const cityKey = cityKeyParam || 'rawson';

    // 1. Verificar que el pozo de esa semana no fue ya distribuido
    const poolDocRef = db.collection('cities').doc(cityKey).collection('weekly_pools').doc(weekId);
    const poolSnap = await poolDocRef.get();

    if (poolSnap.exists && poolSnap.data()?.status === 'distributed') {
        logger.info(`[POOL] Week ${weekId} already distributed. Skipping.`);
        return {
            weekId,
            poolTotal: poolSnap.data()?.totalAmount || 0,
            driversCount: 0,
            distributions: [],
            totalPaid: 0,
            skippedReason: 'already_distributed',
        };
    }

    // 2. Calcular monto del pozo (tope MAX_POOL_AMOUNT = $600.000)
    let poolTotal: number;
    let completedTripsTotal: number;

    if (poolSnap.exists && poolSnap.data()?.currentAmount) {
        poolTotal = poolSnap.data()!.currentAmount;
        completedTripsTotal = poolSnap.data()!.completedTripsTotal || 0;
    } else {
        // Fallback: leer desde cities dinámico por cityKey
        const citySnap = await db.doc(`cities/${cityKey}`).get();
        const rewards = citySnap.data()?.rewardsConfig || {};
        poolTotal = rewards.weeklyPoolAmount ?? BASE_POOL_AMOUNT;
        completedTripsTotal = Math.round((poolTotal - BASE_POOL_AMOUNT) / AMOUNT_PER_TRIP);
    }

    logger.info(`[POOL] weekId=${weekId} | poolTotal=$${poolTotal} | completedTripsTotal=${completedTripsTotal}`);

    // 3. Leer driver_points de la semana → Top N elegibles
    // Filtro: weeklyTripsCount >= MIN_TRIPS_TO_QUALIFY AND weekId === weekId
    // Como weekId puede no estar en todos los docs viejos, filtramos también por ese campo
    // Filtrar por cityKey para separación multi-ciudad
    let candidatesSnap = await db.collection('driver_points')
        .where('weekId', '==', weekId)
        .where('cityKey', '==', cityKey)
        .where('weeklyTripsCount', '>=', MIN_TRIPS_TO_QUALIFY)
        .orderBy('weeklyTripsCount', 'desc')
        .limit(100)
        .get();

    // Fallback: si no hay docs con cityKey (docs legados sin cityKey)
    if (candidatesSnap.empty) {
        logger.warn(`[POOL] No driver_points with weekId=${weekId} cityKey=${cityKey}. Falling back without cityKey filter.`);
        candidatesSnap = await db.collection('driver_points')
            .where('weekId', '==', weekId)
            .where('weeklyTripsCount', '>=', MIN_TRIPS_TO_QUALIFY)
            .orderBy('weeklyTripsCount', 'desc')
            .limit(100)
            .get();
    }

    if (candidatesSnap.empty) {
        logger.warn(`[POOL] No qualified drivers for week ${weekId}.`);
        return {
            weekId,
            poolTotal,
            driversCount: 0,
            distributions: [],
            totalPaid: 0,
            skippedReason: 'no_qualified_drivers',
        };
    }

    // Ordenar: métrica única = weeklyTripsCount desc, desempate por quien se actualizó antes
    const candidates = candidatesSnap.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .sort((a, b) => {
            if (b.weeklyTripsCount !== a.weeklyTripsCount) return b.weeklyTripsCount - a.weeklyTripsCount;
            const aTime = a.lastUpdated?.toMillis?.() || 0;
            const bTime = b.lastUpdated?.toMillis?.() || 0;
            return aTime - bTime;
        })
        .slice(0, TOP_N);

    // 4. Calcular pagos usando distribución proporcional al pozo real con tope del 25% individual
    let totalMultipliers = 0;
    const candidatesWithMultipliers = candidates.map((c, idx) => {
        const rank = idx + 1;
        const multiplier = getMultiplierForRank(rank);
        totalMultipliers += multiplier;
        return { ...c, rank, multiplier };
    });

    const individualCap = poolTotal * weeklyPoolConfig.individualCapPercentage;
    let totalPaid = 0;

    const distributions: DistributionEntry[] = candidatesWithMultipliers.map(c => {
        let payoutAmount = 0;
        if (totalMultipliers > 0) {
            const rawPayout = poolTotal * (c.multiplier / totalMultipliers);
            payoutAmount = Math.floor(Math.min(rawPayout, individualCap));
        }
        totalPaid += payoutAmount;
        return {
            driverId: c.id,
            rank: c.rank,
            multiplier: c.multiplier,
            weeklyPoints: c.weeklyPoints || 0,
            weeklyTripsCount: c.weeklyTripsCount || 0,
            payoutAmount,
        };
    });

    logger.info(`[POOL] Computed distribution: ${distributions.length} drivers | totalPaid=$${totalPaid} | poolTotal=$${poolTotal} | dryRun=${dryRun}`);

    if (dryRun) {
        return { weekId, poolTotal, driversCount: distributions.length, distributions, totalPaid };
    }

    // 5. EJECUTAR pagos (solo si dryRun=false)
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    for (const dist of distributions) {
        const distDocId = `${weekId}_${dist.driverId}`;
        const distRef = db.collection('weekly_pool_distributions').doc(distDocId);

        // Idempotencia: si ya existe, skip
        const existingSnap = await distRef.get();
        if (existingSnap.exists) {
            logger.warn(`[POOL] Distribution ${distDocId} already exists. Skipping driver ${dist.driverId}.`);
            continue;
        }

        // Crear distribution record
        const blockTier = dist.rank <= 2 ? '1-2' : dist.rank <= 6 ? '3-6' : dist.rank <= 10 ? '7-10' : 'Other';
        batch.set(distRef, {
            weekId,
            driverId: dist.driverId,
            rank: dist.rank,
            multiplier: dist.multiplier,
            blockTier,
            poolTotal,
            payoutAmount: dist.payoutAmount,
            weeklyPoints: dist.weeklyPoints,
            weeklyTripsCount: dist.weeklyTripsCount,
            poolVersion: 'v2',
            status: 'paid',
            paidAt: now,
            createdAt: now,
        });

        // Crear wallet movement
        const movRef = db.collection('wallet_movements').doc();
        batch.set(movRef, {
            userId: dist.driverId,
            type: 'weekly_pool_bonus',
            amount: dist.payoutAmount,
            direction: 'credit',
            weekId,
            source: 'weekly_pool',
            description: `Premio Pozo Semanal VamO - Puesto #${dist.rank}`,
            rank: dist.rank,
            multiplier: dist.multiplier,
            createdAt: now,
            processedAt: now,
        });

        // Acreditar en wallet del conductor
        const walletRef = db.doc(`wallets/${dist.driverId}`);
        batch.set(walletRef, {
            balance: FieldValue.increment(dist.payoutAmount),
            lastUpdated: now,
            userId: dist.driverId,
        }, { merge: true });

        // Transacción en platform_transactions para trazabilidad
        const ptRef = db.collection('platform_transactions').doc();
        batch.set(ptRef, {
            userId: dist.driverId,
            type: 'weekly_pool_payout',
            amount: dist.payoutAmount,
            weekId,
            rank: dist.rank,
            note: `Pozo Semanal VamO - Semana ${weekId} - Puesto #${dist.rank}`,
            createdAt: now,
            systemVersion: 'pool_v1',
        });
    }

    // 6. Marcar pozo como distribuido
    const sobrante = Math.max(0, poolTotal - totalPaid);
    batch.set(poolDocRef, {
        weekId,
        cityKey,
        weekStartDate: getWeekStartDate(weekId),
        weekEndDate: getWeekEndDate(weekId),
        baseAmount: BASE_POOL_AMOUNT,
        amountPerTrip: AMOUNT_PER_TRIP,
        maxPoolAmount: MAX_POOL_AMOUNT,
        eligibleDriversCount: TOP_N,
        completedTripsTotal,
        currentAmount: poolTotal,
        totalPaid,
        sobrante, // Record left-over amount
        driversCount: distributions.length,
        status: 'distributed',
        distributedAt: now,
        updatedAt: now,
    }, { merge: true });

    // 7. Resetear el pozo de la ciudad para la nueva semana (dinámico por cityKey)
    const cityRef = db.doc(`cities/${cityKey}`);
    batch.update(cityRef, {
        'rewardsConfig.weeklyPoolAmount': BASE_POOL_AMOUNT + sobrante, // Carry over sobrante
        'rewardsConfig.weeklyPoolLastPaidWeekId': weekId,
        'rewardsConfig.weeklyPoolLastPaidAt': now,
        'rewardsConfig.updatedAt': now,
    });

    await batch.commit();
    logger.info(`[POOL] Distribution committed for week ${weekId}. Paid $${totalPaid} to ${distributions.length} drivers. Sobrante $${sobrante} carried over.`);

    return { weekId, poolTotal, driversCount: distributions.length, distributions, totalPaid };
}

// ─── 1. Función schedulada: Distribución automática ─────────────────────────

/**
 * Corre cada lunes a las 00:10 hora Argentina.
 * Distribuye el pozo de la semana que acaba de terminar (semana anterior).
 */
export const distributeWeeklyPoolV1 = onSchedule({
    schedule: '10 3 * * 1', // lunes 00:10 ART = 03:10 UTC
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'us-central1',
}, async (_event) => {
    const weekId = getPreviousWeekId();
    logger.info(`[POOL_SCHEDULED] Running distribution for previous week: ${weekId}`);

    // Distribuir para todas las ciudades activas
    const db = getDb();
    try {
        const citiesSnap = await db.collection('cities').where('status', '==', 'active').get();
        if (citiesSnap.empty) {
            logger.warn('[POOL_SCHEDULED] No hay ciudades activas – se omite distribución.');
            return;
        }
        for (const cityDoc of citiesSnap.docs) {
            const ck = cityDoc.id;
            const result = await computeDistribution(weekId, false, ck);
            logger.info(`[POOL_SCHEDULED] city=${ck} | weekId=${result.weekId} | paid=${result.totalPaid} | drivers=${result.driversCount} | skipped=${result.skippedReason ?? 'none'}`);
        }
    } catch (err: any) {
        logger.error('[POOL_SCHEDULED] Distribution failed:', err.message);
    }
});

/**
 * Corre cada lunes a las 00:01 hora Argentina.
 * Crea el documento weekly_pools/{weekId} para la semana nueva si no existe.
 */
export const initWeeklyPoolDocV1 = onSchedule({
    schedule: '1 3 * * 1', // lunes 00:01 ART = 03:01 UTC
    timeZone: 'America/Argentina/Buenos_Aires',
    region: 'us-central1',
}, async (_event) => {
    // 1️⃣ Obtener ciudades activas
    const db = getDb();
    const weekId = getCurrentWeekId();
    const citiesSnap = await db.collection('cities').where('status', '==', 'active').get();
    if (citiesSnap.empty) {
        logger.warn('[POOL_INIT] No hay ciudades activas. No se crea ningún pool.');
        return;
    }

    const now = FieldValue.serverTimestamp();
    // 2️⃣ Crear/actualizar pool por cada ciudad
    for (const cityDoc of citiesSnap.docs) {
        const cityKey = cityDoc.id;
        if (!cityKey) {
            logger.warn('[POOL_INIT] cityKey indefinido – se omite creación de pool.');
            continue;
        }
        const poolRef = db.collection('cities').doc(cityKey).collection('weekly_pools').doc(weekId);
        const snap = await poolRef.get();
        if (snap.exists) {
            logger.info(`[POOL_INIT] cities/${cityKey}/weekly_pools/${weekId} ya existe – skip.`);
            continue;
        }
        await poolRef.set({
            cityKey,
            weekId,
            baseAmount: 20000,
            incrementPerRide: 100,
            maxAmount: 600000,
            eligibleDriversCount: 30,
            version: 'v2',
            currentAmount: 20000,
            createdAt: now,
            updatedAt: now,
        });
        logger.info(`[POOL_INIT] Created cities/${cityKey}/weekly_pools/${weekId}`);
    }
});

// ─── 2. Callable admin: distribución manual + dry-run ────────────────────────

export const adminDistributeWeeklyPoolV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

    // Solo superadmin o admin global
    const claims = auth.token;
    const isAdmin = claims.role === 'superadmin' || claims.admin === true || claims.role === 'admin';
    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Solo administradores pueden distribuir el pozo.');
    }

    const { weekId: requestedWeekId, dryRun = true, cityKey: requestedCityKey } = request.data as { weekId?: string; dryRun?: boolean; cityKey?: string };
    const weekId = requestedWeekId || getPreviousWeekId();
    const cityKey = requestedCityKey || 'rawson';

    logger.info(`[POOL_ADMIN] adminDistributeWeeklyPoolV1 | adminUid=${auth.uid} | weekId=${weekId} | cityKey=${cityKey} | dryRun=${dryRun}`);

    try {
        const result = await computeDistribution(weekId, dryRun, cityKey);

        // Audit log
        const db = getDb();
        await db.collection('admin_audit_logs').add({
            action: 'admin_distribute_weekly_pool',
            weekId,
            dryRun,
            adminUid: auth.uid,
            poolTotal: result.poolTotal,
            driversCount: result.driversCount,
            totalPaid: result.totalPaid,
            skippedReason: result.skippedReason ?? null,
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            dryRun,
            weekId: result.weekId,
            poolTotal: result.poolTotal,
            driversCount: result.driversCount,
            totalPaid: result.totalPaid,
            skippedReason: result.skippedReason ?? null,
            distributions: result.distributions,
        };
    } catch (err: any) {
        logger.error('[POOL_ADMIN] Error:', err.message);
        throw new HttpsError('internal', err.message || 'Error distribuyendo el pozo.');
    }
});

// ─── 3. Callable: estado del pozo para el conductor ──────────────────────────

/**
 * Devuelve el estado del pozo para el conductor actual.
 * Incluye si fue distribuido y cuánto le tocó.
 */
export const getPoolStatusForDriverV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

    const db = getDb();
    const weekId = getCurrentWeekId();
    const prevWeekId = getPreviousWeekId();

    // Estado semana actual
    const [currentPoolSnap, prevPoolSnap, myPointsSnap, myPrevDistSnap] = await Promise.all([
        db.collection('cities').doc('rawson').collection('weekly_pools').doc(weekId).get(), // Fallback a rawson para UI legacy (debe ser cityKey pero el context lee driverPoints)
        db.collection('cities').doc('rawson').collection('weekly_pools').doc(prevWeekId).get(),
        db.collection('driver_points').doc(auth.uid).get(),
        db.collection('weekly_pool_distributions').doc(`${prevWeekId}_${auth.uid}`).get(),
    ]);

    const currentPool = currentPoolSnap.data() || null;
    const prevPool = prevPoolSnap.data() || null;
    const myPoints = myPointsSnap.data() || null;
    const prevDist = myPrevDistSnap.data() || null;

    return {
        currentWeekId: weekId,
        previousWeekId: prevWeekId,
        currentPool: currentPool ? {
            status: currentPool.status,
            currentAmount: currentPool.currentAmount,
            completedTripsTotal: currentPool.completedTripsTotal,
        } : null,
        previousPool: prevPool ? {
            status: prevPool.status,
            currentAmount: prevPool.currentAmount,
            distributedAt: prevPool.distributedAt,
        } : null,
        myCurrentWeek: myPoints ? {
            weeklyPoints: myPoints.weeklyPoints || 0,
            weeklyTripsCount: myPoints.weeklyTripsCount || 0,
            weekId: myPoints.weekId,
            lastUpdated: myPoints.lastUpdated,
        } : null,
        myPreviousWeekPayout: prevDist ? {
            payoutAmount: prevDist.payoutAmount,
            rank: prevDist.rank,
            multiplier: prevDist.multiplier,
            paidAt: prevDist.paidAt,
            status: prevDist.status,
        } : null,
    };
});
