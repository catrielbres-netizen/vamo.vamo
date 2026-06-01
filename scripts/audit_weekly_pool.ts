import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const cityKeyArg = process.argv[2];

if (!cityKeyArg) {
    console.log('\n❌ Error: cityKey es obligatorio.');
    console.log('Uso: npx tsx scripts/audit_weekly_pool.ts <cityKey>');
    console.log('Ejemplo: npx tsx scripts/audit_weekly_pool.ts rawson\n');
    process.exit(1);
}

// Robust Project ID Detection
let projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
    try {
        const firebasercPath = path.resolve(process.cwd(), '.firebaserc');
        if (fs.existsSync(firebasercPath)) {
            const rc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
            projectId = rc.projects?.default;
        }
    } catch (e) {
        // Silent fail on read, will throw error later if still null
    }
}

if (!projectId) {
    console.error("❌ No se pudo detectar projectId. Verificá .firebaserc o ejecutá con la variable FIREBASE_PROJECT_ID.");
    process.exit(1);
}

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}

const db = admin.firestore();

/**
 * [VamO PRO] Get a unique week identifier (e.g., 2024-W15)
 */
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

async function runAudit(cityKey: string = 'rawson') {
    console.log('====================================================');
    console.log('🚀 VamO Weekly Pool Audit Tool (READ-ONLY)');
    console.log(`📍 City: ${cityKey.toUpperCase()}`);
    console.log('====================================================');

    const weekId = getWeekId();
    console.log(`📅 Current WeekId: ${weekId}`);

    // 1. Fetch City Config
    const citySnap = await db.doc(`cities/${cityKey}`).get();
    if (!citySnap.exists) {
        console.error(`❌ City ${cityKey} not found.`);
        return;
    }
    const cityData = citySnap.data();
    const rewardsConfig = cityData?.rewardsConfig || {};
    const actualPoolAmount = rewardsConfig.weeklyPoolAmount || 0;

    console.log(`💰 Current Pool in Firestore: $${actualPoolAmount.toLocaleString()}`);

    // 2. Count Weekly Rides
    const ridesSnap = await db.collection('rides')
        .where('cityKey', '==', cityKey)
        .where('weeklyPoolCounted', '==', true)
        .where('weeklyPoolWeekId', '==', weekId)
        .get();
    
    const rideCount = ridesSnap.size;
    console.log(`🚗 Rides Counted this week: ${rideCount}`);

    // 3. Expected Pool Calculation
    const BASE_POOL = 20000;
    const POOL_PER_RIDE = 100;
    const MAX_POOL = 600000;
    
    const expectedPool = Math.min(MAX_POOL, BASE_POOL + (rideCount * POOL_PER_RIDE));
    const drift = actualPoolAmount - expectedPool;

    console.log(`📊 Expected Pool: $${expectedPool.toLocaleString()}`);
    if (drift === 0) {
        console.log('✅ Pool integrity OK (Matches ride count)');
    } else {
        console.warn(`⚠️ Pool drift detected: $${drift.toLocaleString()} (Expected ${expectedPool} vs Actual ${actualPoolAmount})`);
    }

    // 4. Analyze Top 30 Ranking
    console.log('\n🏆 TOP 30 RANKING ANALYZER:');
    const topSnap = await db.collection('driver_points')
        .orderBy('weeklyTripsCount', 'desc')
        .limit(35) // Fetch extra para mostrar conductores fuera del top
        .get();

    if (topSnap.empty) {
        console.log('No drivers found in ranking.');
        return;
    }

    // Bloque de premios base
    function getBlockPayout(rank: number, poolTotal: number): number {
        const ratio = Math.min(1, poolTotal / 600000);
        if (rank <= 3)  return Math.floor(50000 * ratio);
        if (rank <= 10) return Math.floor(25000 * ratio);
        if (rank <= 20) return Math.floor(15000 * ratio);
        if (rank <= 30) return Math.floor(12500 * ratio);
        return 0;
    }

    const top30 = topSnap.docs.slice(0, 30);
    let totalEstimatedPayout = 0;
    const driverResults: any[] = [];

    top30.forEach((doc, index) => {
        const data = doc.data();
        const rank = index + 1;
        const trips = data.weeklyTripsCount || 0;
        const points = data.weeklyPoints || 0;
        const payout = getBlockPayout(rank, actualPoolAmount);
        totalEstimatedPayout += payout;
        driverResults.push({ id: doc.id, name: data.driverName || 'Unknown', points, trips, rank, payout });
    });

    // Second pass: Show table with block payouts
    console.log('--------------------------------------------------------------------------------------------------------------');
    console.log('Pos | Driver Name | Viajes | Puntos | Premio Estimado');
    console.log('--------------------------------------------------------------------------------------------------------------');

    driverResults.forEach(d => {
        console.log(
            `${String(d.rank).padEnd(3)} | ` +
            `${d.name.padEnd(12).substring(0, 12)} | ` +
            `${String(d.trips).padEnd(6)} | ` +
            `${String(d.points).padEnd(6)} | ` +
            `$${d.payout.toLocaleString()}`
        );
    });

    console.log('--------------------------------------------------------------------------------------------------------------');
    console.log(`💰 Total Distribuido: $${totalEstimatedPayout.toLocaleString()}`);

    if (totalEstimatedPayout <= actualPoolAmount || actualPoolAmount === 0) {
        console.log(`✅ Payout Safety OK`);
    } else {
        console.error(`❌ PAYOUT ERROR: Total ($${totalEstimatedPayout}) excede el pozo ($${actualPoolAmount})!`);
    }

    // Drivers fuera del Top 30
    const outsideTop = topSnap.docs.slice(30);
    if (outsideTop.length > 0) {
        console.log(`\n⚠️  ${outsideTop.length} conductores fuera del Top 30 (no cobran):`);
        outsideTop.forEach((doc, i) => {
            const d = doc.data();
            console.log(`   #${31 + i} - ${d.driverName || doc.id} | ${d.weeklyTripsCount || 0} viajes`);
        });
    }

    console.log('\n====================================================');
    console.log('✅ Audit Completed.');
    console.log('====================================================\n');
}

// Execute Audit
runAudit(cityKeyArg).catch(console.error);
