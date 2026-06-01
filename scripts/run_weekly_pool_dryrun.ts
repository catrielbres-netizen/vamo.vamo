import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO Weekly Pool Dry-Run v2 (Local Admin Version)
 * Replica la lógica del Cloud Function weeklyPool.ts v2.
 * No escribe balances. No resetea.
 * Reglas: Top 30, bloques fijos proporcionales, weeklyTripsCount.
 */

const cityKeyArg = process.argv[2];

if (!cityKeyArg) {
    console.log('\n❌ Error: cityKey es obligatorio.');
    console.log('Uso: npx tsx scripts/run_weekly_pool_dryrun.ts <cityKey>');
    console.log('Ejemplo: npx tsx scripts/run_weekly_pool_dryrun.ts rawson\n');
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

// ── Constantes v2 (deben estar sincronizadas con weeklyPool.ts) ──────────────
const BASE_POOL_AMOUNT = 20000;
const AMOUNT_PER_TRIP  = 100;
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
    const y   = parseInt(parts.find(p => p.type === 'year')?.value  || '0');
    const m   = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value   || '0');
    const argDate       = new Date(y, m, day);
    const firstDayOfYear = new Date(y, 0, 1);
    const pastDays      = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber    = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
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

async function runDryRun() {
    console.log('====================================================');
    console.log('🛠️  VamO Weekly Pool Dry-Run v2 (ADMIN TERMINAL)');
    console.log(`    TOP ${TOP_N} | BASE $${BASE_POOL_AMOUNT} | TOPE $${MAX_POOL_AMOUNT.toLocaleString()}`);
    console.log('====================================================');

    const weekId = getWeekId();
    console.log(`📅 WeekId: ${weekId}`);
    console.log(`📍 City: ${cityKeyArg.toUpperCase()}`);

    const citySnap = await db.doc(`cities/${cityKeyArg}`).get();
    if (!citySnap.exists) {
        console.error(`❌ Ciudad ${cityKeyArg} no encontrada.`);
        return;
    }

    const rewardsConfig = citySnap.data()?.rewardsConfig || {};
    const poolAmount = Math.min(rewardsConfig.weeklyPoolAmount || BASE_POOL_AMOUNT, MAX_POOL_AMOUNT);

    console.log(`💰 Pool Amount: $${poolAmount.toLocaleString()} (tope $${MAX_POOL_AMOUNT.toLocaleString()})`);

    // Fetch Top 30 por weeklyTripsCount (v2)
    let topSnap = await db.collection('driver_points')
        .where('weekId', '==', weekId)
        .where('cityKey', '==', cityKeyArg)
        .where('weeklyTripsCount', '>=', MIN_TRIPS)
        .orderBy('weeklyTripsCount', 'desc')
        .limit(TOP_N + 5) // extra para detectar empates
        .get();

    // Fallback: sin filtro cityKey (docs legados)
    if (topSnap.empty) {
        console.warn(`⚠️  Fallback: sin filtro cityKey.`);
        topSnap = await db.collection('driver_points')
            .where('weekId', '==', weekId)
            .where('weeklyTripsCount', '>=', MIN_TRIPS)
            .orderBy('weeklyTripsCount', 'desc')
            .limit(TOP_N + 5)
            .get();
    }

    if (topSnap.empty) {
        console.warn(`⚠️  No hay conductores con viajes esta semana para ${cityKeyArg}.`);
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

    const cityResults = sorted.map((d, idx) => {
        const rank   = idx + 1;
        const reward = getBlockPayout(rank, poolAmount);
        return {
            rank,
            driverId:   d.id,
            driverName: d.driverName || 'Anónimo',
            trips:      d.weeklyTripsCount || 0,
            points:     d.weeklyPoints || 0,
            reward
        };
    });

    const totalDistributed = cityResults.reduce((a, b) => a + b.reward, 0);

    console.log('\n─────────────────────────────────────────────────────────');
    console.log('Pos | Driver          | Viajes | Puntos | Premio');
    console.log('─────────────────────────────────────────────────────────');
    cityResults.forEach(r => {
        const tier = r.rank <= 3 ? '🥇' : r.rank <= 10 ? '🥈' : r.rank <= 20 ? '🥉' : '  ';
        console.log(
            `${tier} ${String(r.rank).padEnd(3)} | ` +
            `${r.driverName.padEnd(14).substring(0, 14)} | ` +
            `${String(r.trips).padEnd(6)} | ` +
            `${String(r.points).padEnd(6)} | ` +
            `$${r.reward.toLocaleString()}`
        );
    });
    console.log('─────────────────────────────────────────────────────────');
    console.log(`💰 Total Distribuido: $${totalDistributed.toLocaleString()} / $${poolAmount.toLocaleString()}`);
    if (totalDistributed <= poolAmount) {
        console.log('✅ Payout Safety OK');
    } else {
        console.error('❌ ERROR: El total supera el pozo!');
    }

    // Conductores fuera del Top 30
    const outside = topSnap.docs.slice(TOP_N);
    if (outside.length > 0) {
        console.log(`\n⚠️  ${outside.length} conductores fuera del Top 30 (no cobran):`);
        outside.forEach((d, i) => {
            const data = d.data();
            console.log(`   #${TOP_N + 1 + i} - ${data.driverName || d.id} | ${data.weeklyTripsCount || 0} viajes`);
        });
    }

    // Guardar en historial
    const historyId = `dryrun_adm_v2_${weekId}_${cityKeyArg}_${Date.now()}`;
    await db.collection('weekly_pool_history').doc(historyId).set({
        cityKey: cityKeyArg, weekId, poolAmount, totalDistributed,
        isDryRun: true, source: 'admin_script_v2',
        processedAt: admin.firestore.Timestamp.now(),
        poolVersion: 'v2', topN: TOP_N,
        ranking: cityResults
    });

    console.log(`\n🔍 Registro guardado en weekly_pool_history/${historyId}`);
    console.log('====================================================\n');
}

runDryRun().catch(console.error);
