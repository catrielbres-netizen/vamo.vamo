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
    const BASE_POOL = 50000;
    const POOL_PER_RIDE = 100;
    const MAX_POOL = 300000;
    
    const expectedPool = Math.min(MAX_POOL, BASE_POOL + (rideCount * POOL_PER_RIDE));
    const drift = actualPoolAmount - expectedPool;

    console.log(`📊 Expected Pool: $${expectedPool.toLocaleString()}`);
    if (drift === 0) {
        console.log('✅ Pool integrity OK (Matches ride count)');
    } else {
        console.warn(`⚠️ Pool drift detected: $${drift.toLocaleString()} (Expected ${expectedPool} vs Actual ${actualPoolAmount})`);
    }

    // 4. Analyze Top 10 Ranking
    console.log('\n🏆 TOP 10 RANKING ANALYZER:');
    const topSnap = await db.collection('driver_points')
        .orderBy('weeklyPoints', 'desc')
        .limit(15) // Fetch extra to check for ties and qualification
        .get();

    if (topSnap.empty) {
        console.log('No drivers found in ranking.');
        return;
    }

    const top10 = topSnap.docs.slice(0, 10);
    let totalAdjustedPoints = 0;
    const driverResults: any[] = [];

    // First pass: Calculate multipliers and adjusted points
    top10.forEach((doc, index) => {
        const data = doc.data();
        const rank = index + 1;
        const points = data.weeklyPoints || 0;
        const trips = data.weeklyTripsCount || 0;
        
        let multiplier = 0;
        if (rank <= 2) multiplier = 1.5;
        else if (rank <= 6) multiplier = 1.2;
        else if (rank <= 10) multiplier = 1.0;

        const isQualified = trips >= 10;
        const adjustedPoints = points * (isQualified ? multiplier : 0);
        totalAdjustedPoints += adjustedPoints;

        driverResults.push({
            id: doc.id,
            name: data.driverName || 'Unknown',
            points,
            trips,
            rank,
            multiplier,
            isQualified,
            adjustedPoints
        });
    });

    // Second pass: Calculate estimated payout
    let totalEstimatedPayout = 0;
    console.log('----------------------------------------------------------------------------------------------------');
    console.log('Pos | Driver Name | Points | Trips | Multi | Qualified | Adj. Pts | Estimated Reward');
    console.log('----------------------------------------------------------------------------------------------------');
    
    driverResults.forEach(d => {
        const payout = totalAdjustedPoints > 0 ? (d.adjustedPoints / totalAdjustedPoints) * actualPoolAmount : 0;
        totalEstimatedPayout += payout;
        
        console.log(
            `${String(d.rank).padEnd(3)} | ` +
            `${d.name.padEnd(12).substring(0, 12)} | ` +
            `${String(d.points).padEnd(6)} | ` +
            `${String(d.trips).padEnd(5)} | ` +
            `${String(d.multiplier).padEnd(5)} | ` +
            `${(d.isQualified ? '✅' : '❌').padEnd(9)} | ` +
            `${String(Math.floor(d.adjustedPoints)).padEnd(8)} | ` +
            `$${Math.floor(payout).toLocaleString()}`
        );
    });

    console.log('----------------------------------------------------------------------------------------------------');
    console.log(`💰 Total Estimated Payout: $${Math.floor(totalEstimatedPayout).toLocaleString()}`);
    
    if (Math.floor(totalEstimatedPayout) <= actualPoolAmount) {
        console.log(`✅ Payout Safety OK (Total rewards do not exceed pool)`);
    } else {
        console.error(`❌ PAYOUT ERROR: Total rewards ($${totalEstimatedPayout}) exceed Pool ($${actualPoolAmount})!`);
    }

    // 5. Detect Ties
    const pointsArray = driverResults.map(d => d.points);
    const hasTies = new Set(pointsArray).size !== pointsArray.length;
    if (hasTies) {
        console.log('\nℹ️ Ties detected in Top 10. Ranking order depends on Firestore fetch order (or timestamp if implemented).');
    }

    // 6. Qualification Warning
    const unqualiedInTop = driverResults.filter(d => !d.isQualified);
    if (unqualiedInTop.length > 0) {
        console.warn(`\n⚠️ Warning: ${unqualiedInTop.length} drivers in Top 10 have < 10 trips and will receive $0.`);
    }

    console.log('\n====================================================');
    console.log('✅ Audit Completed.');
    console.log('====================================================\n');
}

// Execute Audit
runAudit(cityKeyArg).catch(console.error);
