import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO Weekly Pool Payout Executor v2 (ADMIN ONLY)
 * Realiza el pago REAL del pozo semanal v2.
 * ⚠️ WARNING: Solo ejecutar con --confirm. Mueve dinero real.
 * Reglas: Top 30, bloques fijos proporcionales, weeklyTripsCount.
 */

const cityKeyArg  = process.argv[2];
const isConfirmed = process.argv.includes('--confirm');

if (!cityKeyArg) {
    console.log('\n❌ Error: cityKey es obligatorio.');
    console.log('Uso (Preview): npx tsx scripts/execute_weekly_payout.ts <cityKey>');
    console.log('Uso (PAGO REAL): npx tsx scripts/execute_weekly_payout.ts <cityKey> --confirm\n');
    process.exit(1);
}

let projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
    try {
        const firebasercPath = path.resolve(process.cwd(), '.firebaserc');
        if (fs.existsSync(firebasercPath)) {
            const rc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
            projectId = rc.projects?.default;
        }
    } catch (e) {}
}

if (!projectId) {
    console.error("❌ No se pudo detectar projectId.");
    process.exit(1);
}

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

// ── Constantes v2 (sincronizadas con weeklyPool.ts) ──────────────────────────
const BASE_POOL_AMOUNT = 20000;
const MAX_POOL_AMOUNT  = 600000;
const TOP_N            = 30;
const MIN_TRIPS        = 1;

function getWeekId(): string {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const y   = parts.find(p => p.type === 'year')?.value  || '0';
    const m   = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value   || '0');
    const argDate        = new Date(parseInt(y), m, day);
    const firstDayOfYear = new Date(parseInt(y), 0, 1);
    const pastDays       = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber     = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
    return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}

function getBlockPayout(rank: number, poolTotal: number): number {
    const ratio = Math.min(1, poolTotal / MAX_POOL_AMOUNT);
    if (rank <= 3)  return Math.floor(50000 * ratio);
    if (rank <= 10) return Math.floor(25000 * ratio);
    if (rank <= 20) return Math.floor(15000 * ratio);
    if (rank <= 30) return Math.floor(12500 * ratio);
    return 0;
}

async function executePayout() {
    const weekId = getWeekId();
    console.log('====================================================');
    console.log('💰 VamO Weekly Pool Payout v2 - MODO ADMINISTRADOR');
    console.log(`   TOP ${TOP_N} | BASE $${BASE_POOL_AMOUNT} | TOPE $${MAX_POOL_AMOUNT.toLocaleString()}`);
    console.log('====================================================');
    console.log(`📍 Ciudad: ${cityKeyArg.toUpperCase()}`);
    console.log(`📅 Semana: ${weekId}`);

    // 1. Guardia: dry-run previo obligatorio
    const dryRunSnap = await db.collection('weekly_pool_history')
        .where('cityKey', '==', cityKeyArg)
        .where('weekId', '==', weekId)
        .where('isDryRun', '==', true)
        .limit(1)
        .get();

    if (dryRunSnap.empty) {
        console.error('❌ ERROR: No se encontró simulación previa (Dry-Run).');
        console.error('Ejecutá primero: npx tsx scripts/run_weekly_pool_dryrun.ts ' + cityKeyArg);
        process.exit(1);
    }
    console.log('✅ Simulación previa detectada.');

    // 2. Guardia: no pagar dos veces
    const existingSnap = await db.collection('weekly_pool_history')
        .where('cityKey', '==', cityKeyArg)
        .where('weekId', '==', weekId)
        .where('isDryRun', '==', false)
        .limit(1)
        .get();

    if (!existingSnap.empty) {
        console.error('❌ ERROR: Ya existe un pago real para esta semana y ciudad.');
        process.exit(1);
    }

    // 3. Calcular distribución (misma lógica que weeklyPool.ts v2)
    const citySnap  = await db.doc(`cities/${cityKeyArg}`).get();
    const poolAmount = Math.min(
        citySnap.data()?.rewardsConfig?.weeklyPoolAmount || BASE_POOL_AMOUNT,
        MAX_POOL_AMOUNT
    );

    let topSnap = await db.collection('driver_points')
        .where('weekId', '==', weekId)
        .where('cityKey', '==', cityKeyArg)
        .where('weeklyTripsCount', '>=', MIN_TRIPS)
        .orderBy('weeklyTripsCount', 'desc')
        .limit(TOP_N + 5)
        .get();

    if (topSnap.empty) {
        console.warn('⚠️  Fallback: sin filtro cityKey (docs legados).');
        topSnap = await db.collection('driver_points')
            .where('weekId', '==', weekId)
            .where('weeklyTripsCount', '>=', MIN_TRIPS)
            .orderBy('weeklyTripsCount', 'desc')
            .limit(TOP_N + 5)
            .get();
    }

    if (topSnap.empty) {
        console.error('❌ No hay conductores calificados.');
        return;
    }

    const sorted = topSnap.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .sort((a, b) => {
            if (b.weeklyTripsCount !== a.weeklyTripsCount) return b.weeklyTripsCount - a.weeklyTripsCount;
            const aT = a.lastUpdated?.toMillis?.() || 0;
            const bT = b.lastUpdated?.toMillis?.() || 0;
            return aT - bT;
        })
        .slice(0, TOP_N);

    const finalPayouts = sorted.map((d, idx) => {
        const rank   = idx + 1;
        const reward = getBlockPayout(rank, poolAmount);
        return { rank, driverId: d.id, name: d.driverName || 'Anónimo', trips: d.weeklyTripsCount || 0, reward };
    });

    const totalDist = finalPayouts.reduce((a, b) => a + b.reward, 0);

    console.log('\n📋 RESUMEN DE LIQUIDACIÓN v2:');
    console.log('─────────────────────────────────────────────────────────');
    finalPayouts.forEach(p => {
        console.log(`  #${String(p.rank).padEnd(3)} ${p.name.padEnd(16)} ${p.trips} viajes → $${p.reward.toLocaleString()}`);
    });
    console.log('─────────────────────────────────────────────────────────');
    console.log(`TOTAL A REPARTIR: $${totalDist.toLocaleString()} / Pozo: $${poolAmount.toLocaleString()}`);

    if (!isConfirmed) {
        console.log('\n🔍 MODO PREVIEW: No se realizó ningún pago.');
        console.log('⚠️  Para el PAGO REAL agregá --confirm al final.');
        return;
    }

    // 4. Ejecución real (con idempotencia)
    console.log('\n🚀 INICIANDO PAGO REAL...');
    const now       = admin.firestore.Timestamp.now();
    const processed = [];

    for (const p of finalPayouts) {
        if (p.reward <= 0) continue;
        const payoutId      = `weekly_pool_payout_v2_${weekId}_${cityKeyArg}_${p.driverId}`;
        const transactionRef = db.doc(`platform_transactions/${payoutId}`);
        const walletRef      = db.doc(`wallets/${p.driverId}`);
        const movRef         = db.collection('wallet_movements').doc();

        try {
            await db.runTransaction(async (tx) => {
                const txSnap = await tx.get(transactionRef);
                if (txSnap.exists) {
                    console.log(`⏭️  ${p.name}: ya pagado (idempotente).`);
                    return;
                }
                tx.set(transactionRef, {
                    type: 'weekly_pool_payout', category: 'weekly_pool',
                    amount: p.reward, driverId: p.driverId,
                    cityKey: cityKeyArg, weekId, rank: p.rank,
                    status: 'completed', poolVersion: 'v2', createdAt: now
                });
                tx.set(walletRef, {
                    balance: admin.firestore.FieldValue.increment(p.reward),
                    lastUpdated: now, userId: p.driverId
                }, { merge: true });
                tx.set(movRef, {
                    userId: p.driverId, type: 'weekly_pool_bonus',
                    amount: p.reward, direction: 'credit',
                    weekId, source: 'weekly_pool', rank: p.rank,
                    description: `Premio Pozo Semanal VamO - Puesto #${p.rank}`,
                    createdAt: now
                });
            });
            console.log(`✅ $${p.reward.toLocaleString()} acreditados a ${p.name} (puesto #${p.rank})`);
            processed.push({ ...p, status: 'paid' });
        } catch (e) {
            console.error(`❌ Error pagando a ${p.name}:`, e);
            processed.push({ ...p, status: 'failed' });
        }
    }

    // 5. Registrar liquidación
    const historyId = `settlement_adm_v2_${weekId}_${cityKeyArg}_${Date.now()}`;
    await db.collection('weekly_pool_history').doc(historyId).set({
        cityKey: cityKeyArg, weekId, poolAmount, totalDistributed: totalDist,
        isDryRun: false, source: 'admin_executor_v2',
        processedAt: now, poolVersion: 'v2', topN: TOP_N, ranking: processed
    });

    console.log('\n✅ PAGO FINALIZADO.');
    console.log(`🔍 Registro en weekly_pool_history/${historyId}`);
    console.log('====================================================\n');
}

executePayout().catch(console.error);
