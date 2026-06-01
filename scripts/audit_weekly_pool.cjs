/**
 * AUDITORÍA COMPLETA v2: Pozo Semanal VamO
 * Formato weekId canónico: YYYY-Www
 *
 * Uso: node scripts/audit_weekly_pool.cjs
 */
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function getWeekIdForDate(date) {
    const tz = 'America/Argentina/Buenos_Aires';
    const argStr = date.toLocaleString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const [m, d, y] = argStr.split('/').map(Number);
    const argDate = new Date(y, m - 1, d);
    const firstDayOfYear = new Date(y, 0, 1);
    const pastDays = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
    return `${y}-W${String(weekNum).padStart(2, '0')}`;
}

function getCurrentWeekId() { return getWeekIdForDate(new Date()); }
function getPreviousWeekId() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getWeekIdForDate(d);
}

async function audit() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  AUDITORÍA POZO SEMANAL VAMO v2');
    console.log('═══════════════════════════════════════════════════════\n');

    const weekId = getCurrentWeekId();
    const prevWeekId = getPreviousWeekId();
    console.log(`WeekId actual:   ${weekId}`);
    console.log(`WeekId anterior: ${prevWeekId}\n`);

    // 1. weekly_pools
    console.log('─── 1. DOCUMENTOS weekly_pools ───');
    const poolsSnap = await db.collection('weekly_pools').orderBy('createdAt', 'desc').limit(5).get().catch(() => null);
    if (!poolsSnap || poolsSnap.empty) {
        console.log('  ⚠️  Colección weekly_pools vacía');
    } else {
        poolsSnap.docs.forEach(doc => {
            const d = doc.data();
            console.log(`  [${doc.id}] status=${d.status} | total=$${d.totalAmount} | trips=${d.completedTripsTotal} | dist=${d.distributedAt?.toDate?.()?.toISOString() ?? 'pendiente'}`);
        });
    }

    // 2. cities/rawson
    console.log('\n─── 2. CONFIG cities/rawson ───');
    const citySnap = await db.doc('cities/rawson').get();
    if (citySnap.exists) {
        const rewards = citySnap.data().rewardsConfig || {};
        console.log(`  weeklyPoolAmount:       $${rewards.weeklyPoolAmount}`);
        console.log(`  contributionPerRide:    $${rewards.weeklyPoolContributionPerRide}`);
        console.log(`  lastPaidWeekId:         ${rewards.weeklyPoolLastPaidWeekId ?? 'NUNCA'}`);
        console.log(`  lastPaidAt:             ${rewards.weeklyPoolLastPaidAt?.toDate?.()?.toISOString() ?? 'N/A'}`);
    }

    // 3. driver_points
    console.log('\n─── 3. DRIVER POINTS (Top 15 por weeklyPoints) ───');
    const pointsSnap = await db.collection('driver_points').orderBy('weeklyPoints', 'desc').limit(15).get().catch(() => null);
    if (!pointsSnap || pointsSnap.empty) {
        console.log('  ⚠️  Colección vacía');
    } else {
        console.log(`  Total: ${pointsSnap.size} docs`);
        const top10 = [];
        pointsSnap.docs.forEach((doc, i) => {
            const d = doc.data();
            const isReal = !doc.id.startsWith('test_') && !doc.id.startsWith('sim_');
            const weekOk = d.weekId === weekId ? '✅' : `⚠️ weekId=${d.weekId}`;
            const q = (d.weeklyTripsCount || 0) >= 10 ? '✅' : `❌ (${d.weeklyTripsCount} viajes)`;
            console.log(`  ${isReal ? '👤' : '🤖'} #${i+1} ${doc.id.slice(0,12)}... | pts=${d.weeklyPoints} | trips=${d.weeklyTripsCount} | weekId=${weekOk} | elegible=${q}`);
            if (i < 10) top10.push({ id: doc.id, ...d });
        });

        // Calcular distribución teórica
        const elegibles = top10.filter(d => (d.weeklyTripsCount || 0) >= 10);
        if (elegibles.length > 0) {
            console.log(`\n  📊 TOP 10 ELEGIBLES: ${elegibles.length} conductores`);
            const poolAmount = citySnap.data()?.rewardsConfig?.weeklyPoolAmount || 20000;
            let totalWeight = 0;
            const ranked = elegibles.map((c, i) => {
                const rank = i + 1;
                const mult = rank <= 2 ? 1.5 : rank <= 6 ? 1.2 : 1.0;
                totalWeight += mult;
                return { ...c, rank, mult };
            });
            console.log(`  Pozo actual: $${poolAmount} | pesoTotal: ${totalWeight.toFixed(1)}`);
            ranked.forEach(c => {
                const payout = Math.floor((c.mult / totalWeight) * poolAmount);
                console.log(`    #${c.rank} ${c.id.slice(0,12)}... | x${c.mult} | ≈ $${payout}`);
            });
        }
    }

    // 4. Distribuciones
    console.log('\n─── 4. DISTRIBUCIONES (weekly_pool_distributions) ───');
    const distSnap = await db.collection('weekly_pool_distributions').orderBy('createdAt', 'desc').limit(20).get().catch(() => null);
    if (!distSnap || distSnap.empty) {
        console.log('  ⚠️  NUNCA SE PAGÓ EL POZO');
    } else {
        console.log(`  Total: ${distSnap.size} registros`);
        distSnap.docs.forEach(doc => {
            const d = doc.data();
            console.log(`  [${doc.id}] rank=#${d.rank} | $${d.payoutAmount} | paidAt=${d.paidAt?.toDate?.()?.toISOString()}`);
        });
    }

    // 5. Wallet movements del pozo
    console.log('\n─── 5. WALLET MOVEMENTS (weekly_pool_bonus) ───');
    const wmSnap = await db.collection('wallet_movements').where('type', '==', 'weekly_pool_bonus').limit(20).get().catch(() => null);
    if (!wmSnap || wmSnap.empty) {
        console.log('  ⚠️  Sin wallet movements de pozo');
    } else {
        wmSnap.docs.forEach(doc => {
            const d = doc.data();
            console.log(`  userId=${d.userId?.slice(0,12)}... | $${d.amount} | rank=#${d.rank} | weekId=${d.weekId} | at=${d.createdAt?.toDate?.()?.toISOString()}`);
        });
    }

    // 6. Inconsistencias de weekId
    console.log('\n─── 6. INCONSISTENCIAS DE WEEKID ───');
    const ridesWithOldFormat = await db.collection('rides')
        .where('weeklyPoolCounted', '==', true)
        .limit(5)
        .get().catch(() => null);
    if (ridesWithOldFormat && !ridesWithOldFormat.empty) {
        const badFormat = ridesWithOldFormat.docs.filter(d => {
            const wid = d.data().weeklyPoolWeekId || '';
            return wid && !wid.match(/^\d{4}-W\d{2}$/);
        });
        if (badFormat.length > 0) {
            console.log(`  ⚠️  ${badFormat.length} rides con weekId en formato incorrecto:`);
            badFormat.forEach(d => console.log(`    rideId=${d.id} | weekId=${d.data().weeklyPoolWeekId}`));
        } else {
            console.log('  ✅ Todos los rides usan formato YYYY-Www');
        }
    }

    // 7. VEREDICTO
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('VEREDICTO');
    console.log('═══════════════════════════════════════════════════════');
    const neverPaid = !distSnap || distSnap.empty;
    const noWeeklyPools = !poolsSnap || poolsSnap.empty;
    const currentWeekPoolExists = poolsSnap?.docs.some(d => d.id === weekId);

    console.log(`  weekly_pool_distributions: ${neverPaid ? '🔴 VACÍA — nunca se pagó' : '🟢 Con datos'}`);
    console.log(`  weekly_pools/${weekId}: ${currentWeekPoolExists ? '🟢 Existe' : '🟡 No creado aún (se crea el lunes automáticamente)'}`);
    console.log(`  Scheduled function: distributeWeeklyPoolV1 → lunes 00:10 ART`);
    console.log(`  Scheduled function: initWeeklyPoolDocV1     → lunes 00:01 ART`);
    console.log('\n=== FIN AUDITORÍA ===');
    process.exit(0);
}

audit().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
