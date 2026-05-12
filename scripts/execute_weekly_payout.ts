import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO Weekly Pool Payout Executor (ADMIN ONLY)
 * This script performs REAL balance increments.
 * ⚠️ WARNING: Money will be moved if --confirm is present.
 */

const cityKeyArg = process.argv[2];
const isConfirmed = process.argv.includes('--confirm');

if (!cityKeyArg) {
    console.log('\n❌ Error: cityKey es obligatorio.');
    console.log('Uso (Preview): npx tsx scripts/execute_weekly_payout.ts <cityKey>');
    console.log('Uso (PAGO REAL): npx tsx scripts/execute_weekly_payout.ts <cityKey> --confirm\n');
    process.exit(1);
}

// 1. Project Detection
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

function getWeekId(): string {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value || '0';
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const argDate = new Date(parseInt(y), m, day);
    const firstDayOfYear = new Date(parseInt(y), 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}

async function executePayout() {
    const weekId = getWeekId();
    console.log('====================================================');
    console.log('💰 VamO Weekly Pool Payout - MODO ADMINISTRADOR');
    console.log('====================================================');
    console.log(`📍 Ciudad: ${cityKeyArg.toUpperCase()}`);
    console.log(`📅 Semana: ${weekId}`);

    // 1. Dry-Run Guard
    const dryRunSnap = await db.collection('weekly_pool_history')
        .where('cityKey', '==', cityKeyArg)
        .where('weekId', '==', weekId)
        .where('isDryRun', '==', true)
        .limit(1)
        .get();

    if (dryRunSnap.empty) {
        console.error('❌ ERROR: No se encontró una simulación (Dry-Run) previa.');
        console.error('Debes ejecutar primero: npx tsx scripts/run_weekly_pool_dryrun.ts ' + cityKeyArg);
        process.exit(1);
    }
    console.log('✅ Simulación previa detectada. Validando ranking...');

    // 2. Fetch Data (Identical to Cloud Function)
    const citySnap = await db.doc(`cities/${cityKeyArg}`).get();
    const poolAmount = citySnap.data()?.rewardsConfig?.weeklyPoolAmount || 0;

    const topDriversSnap = await db.collection('driver_points')
        .where('weeklyTripsCount', '>=', 10)
        .orderBy('weeklyPoints', 'desc')
        .limit(10)
        .get();

    if (topDriversSnap.empty) {
        console.error('❌ Error: No hay conductores calificados.');
        return;
    }

    let totalAdjustedPoints = 0;
    const candidates: any[] = [];
    topDriversSnap.docs.forEach((doc, index) => {
        const data = doc.data();
        const rank = index + 1;
        let mult = 1.0;
        if (rank <= 2) mult = 1.5;
        else if (rank <= 6) mult = 1.2;
        const adj = data.weeklyPoints * mult;
        totalAdjustedPoints += adj;
        candidates.push({ driverId: doc.id, name: data.driverName || 'Anónimo', rank, points: data.weeklyPoints, mult, adj });
    });

    const finalPayouts = candidates.map(c => ({
        ...c,
        reward: totalAdjustedPoints > 0 ? Math.floor((c.adj / totalAdjustedPoints) * poolAmount) : 0
    }));

    console.log('\n📋 RESUMEN DE LIQUIDACIÓN:');
    console.table(finalPayouts.map(p => ({
        Pos: p.rank,
        Nombre: p.name,
        Puntos: p.points,
        Multi: p.mult,
        Premio: `$${p.reward.toLocaleString()}`
    })));
    
    console.log('----------------------------------------------------');
    const totalDist = finalPayouts.reduce((a, b) => a + b.reward, 0);
    console.log(`TOTAL A REPARTIR: $${totalDist.toLocaleString()}`);

    if (!isConfirmed) {
        console.log('\n🔍 MODO PREVIEW: No se realizó ningún pago.');
        console.log('⚠️ Para ejecutar el PAGO REAL, agregá --confirm al final.');
        return;
    }

    // 3. Execution (Real Payout)
    console.log('\n🚀 INICIANDO PAGO REAL...');
    const now = admin.firestore.Timestamp.now();
    const processed = [];

    for (const p of finalPayouts) {
        if (p.reward <= 0) continue;
        const payoutId = `weekly_pool_payout_${weekId}_${cityKeyArg}_${p.driverId}`;
        const transactionRef = db.doc(`platform_transactions/${payoutId}`);
        const userRef = db.doc(`users/${p.driverId}`);

        try {
            await db.runTransaction(async (tx) => {
                const txSnap = await tx.get(transactionRef);
                if (txSnap.exists) return; // Idempotencia

                tx.set(transactionRef, {
                    type: 'reward_payout',
                    category: 'weekly_pool',
                    amount: p.reward,
                    driverId: p.driverId,
                    cityKey: cityKeyArg,
                    weekId,
                    status: 'completed',
                    createdAt: now
                });
                tx.update(userRef, {
                    currentBalance: admin.firestore.FieldValue.increment(p.reward),
                    updatedAt: now
                });
            });
            console.log(`✅ Pago de $${p.reward} acreditado a ${p.name}`);
            processed.push({ ...p, status: 'paid' });
        } catch (e) {
            console.error(`❌ Error pagando a ${p.name}:`, e);
            processed.push({ ...p, status: 'failed' });
        }
    }

    // 4. Record Final Settlement
    const historyId = `settlement_adm_${weekId}_${cityKeyArg}_${Date.now()}`;
    await db.collection('weekly_pool_history').doc(historyId).set({
        cityKey: cityKeyArg, weekId, poolAmount, totalDistributed: totalDist,
        isDryRun: false, source: 'admin_executor', processedAt: now, ranking: processed
    });

    console.log('\n✅ PAGO FINALIZADO.');
    console.log(`🔍 Registro en weekly_pool_history/${historyId}`);
    console.log('====================================================\n');
}

executePayout().catch(console.error);
