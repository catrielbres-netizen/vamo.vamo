import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO Weekly Pool Dry-Run (Local Admin Version)
 * This script replicates the payout logic using Admin SDK.
 * No Balance writes. No Resets.
 */

const cityKeyArg = process.argv[2];

if (!cityKeyArg) {
    console.log('\n❌ Error: cityKey es obligatorio.');
    console.log('Uso: npx tsx scripts/run_weekly_pool_dryrun.ts <cityKey>');
    console.log('Ejemplo: npx tsx scripts/run_weekly_pool_dryrun.ts rawson\n');
    process.exit(1);
}

// 1. Detect Project ID
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

// 2. Initialize Admin
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

// 3. Logic Replication
function getWeekId(): string {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const argDate = new Date(y, m, day);
    const firstDayOfYear = new Date(y, 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}

async function runDryRun() {
    console.log('====================================================');
    console.log('🛠️ VamO Weekly Pool Dry-Run (ADMIN TERMINAL)');
    console.log('====================================================');

    const weekId = getWeekId();
    console.log(`📅 WeekId: ${weekId}`);
    console.log(`📍 City: ${cityKeyArg.toUpperCase()}`);

    const cityRef = db.doc(`cities/${cityKeyArg}`);
    const citySnap = await cityRef.get();

    if (!citySnap.exists) {
        console.error(`❌ City ${cityKeyArg} not found.`);
        return;
    }

    const cityData = citySnap.data();
    const rewardsConfig = cityData?.rewardsConfig || {};
    const poolAmount = rewardsConfig.weeklyPoolAmount || 0;

    console.log(`💰 Pool Amount: $${poolAmount.toLocaleString()}`);

    // Fetch Top 10 drivers with at least 10 trips
    // Using the same criteria as the Cloud Function
    const topDriversSnap = await db.collection('driver_points')
        .where('weeklyTripsCount', '>=', 10)
        .orderBy('weeklyPoints', 'desc')
        .limit(10)
        .get();

    if (topDriversSnap.empty) {
        console.warn(`⚠️ No qualified drivers (10+ trips) found for ${cityKeyArg}.`);
        return;
    }

    let totalAdjustedPoints = 0;
    const driverPayouts: any[] = [];

    // Pass 1: Multipliers and Adjusted Points
    topDriversSnap.docs.forEach((doc, index) => {
        const data = doc.data();
        const rank = index + 1;
        const points = data.weeklyPoints || 0;
        
        let multiplier = 1.0;
        if (rank <= 2) multiplier = 1.5;
        else if (rank <= 6) multiplier = 1.2;
        else if (rank <= 10) multiplier = 1.0;

        const adjPoints = points * multiplier;
        totalAdjustedPoints += adjPoints;

        driverPayouts.push({
            driverId: doc.id,
            driverName: data.driverName || 'Anónimo',
            rank,
            points,
            multiplier,
            adjPoints
        });
    });

    // Pass 2: Final Prize Allocation
    const cityResults = driverPayouts.map(d => {
        const reward = totalAdjustedPoints > 0 
            ? Math.floor((d.adjPoints / totalAdjustedPoints) * poolAmount) 
            : 0;
        return { ...d, reward };
    });

    const totalDistributed = cityResults.reduce((acc, curr) => acc + curr.reward, 0);

    console.log('----------------------------------------------------');
    console.table(cityResults.map(r => ({
        Pos: r.rank,
        Driver: r.driverName,
        Pts: r.points,
        Multi: r.multiplier,
        Premio: `$${r.reward.toLocaleString()}`
    })));
    console.log('----------------------------------------------------');
    console.log(`✅ Total Distributed: $${totalDistributed.toLocaleString()}`);

    // Record in History (Traceability)
    const historyId = `dryrun_adm_${weekId}_${cityKeyArg}_${Date.now()}`;
    await db.collection('weekly_pool_history').doc(historyId).set({
        cityKey: cityKeyArg,
        weekId,
        poolAmount,
        totalAdjustedPoints,
        totalDistributed,
        isDryRun: true,
        source: 'admin_script',
        processedAt: admin.firestore.Timestamp.now(),
        ranking: cityResults
    });

    console.log(`\n🔍 Registro guardado en weekly_pool_history/${historyId}`);
    console.log('====================================================\n');
}

runDryRun().catch(console.error);
