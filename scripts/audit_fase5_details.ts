import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * [VamO FASE 5] Comprehensive Audit Script
 * Extracts every detail from the latest simulation run.
 */

const projectId = process.env.FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

async function runAudit() {
    console.log(`\n====================================================`);
    console.log(`🔍 [AUDIT] FASE 5: Deep Dive Report`);
    console.log(`====================================================\n`);

    // 1. Get Latest Run
    const runSnap = await db.collection('simulation_runs')
        .orderBy('startedAt', 'desc')
        .limit(1)
        .get();

    if (runSnap.empty) {
        console.error("❌ No simulation runs found.");
        return;
    }

    const runDoc = runSnap.docs[0];
    const runId = runDoc.id;
    const runData = runDoc.data();
    console.log(`📁 Processing Run: ${runId} (${runData.startedAt.toDate().toLocaleString()})`);

    // 2. Fetch Events
    const eventsSnap = await db.collection('simulation_runs').doc(runId).collection('events').get();
    const eventsByRide: Record<string, any[]> = {};
    eventsSnap.forEach(doc => {
        const data = doc.data();
        if (!eventsByRide[data.rideId]) eventsByRide[data.rideId] = [];
        eventsByRide[data.rideId].push({ ...data, id: doc.id });
    });

    // 3. Fetch Rides
    const ridesSnap = await db.collection('rides')
        .where('simulationRunId', '==', runId)
        .get();

    console.log(`📦 Rides found: ${ridesSnap.size}`);

    const rideReports = [];
    const activeDrivers = new Set();
    const driverStats: Record<string, { rides: number, ignored: number, cancelled: number }> = {};
    const zoneHeatmap = { origin: {} as any, dest: {} as any };

    for (const doc of ridesSnap.docs) {
        const r = doc.data();
        const rideId = doc.id;
        const rideEvents = (eventsByRide[rideId] || []).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

        // Calculate metrics
        const matchedEvent = rideEvents.find(e => e.type === 'MATCHED');
        const completedEvent = rideEvents.find(e => e.type === 'COMPLETED');
        const cancelledEvent = rideEvents.find(e => e.type.includes('CANCEL') || e.type === 'NO_SHOW' || e.type === 'DRIVER_OFFLINE');
        
        const matchingTime = matchedEvent ? (matchedEvent.timestamp.toMillis() - r.createdAt.toMillis()) / 1000 : null;
        const totalTime = (completedEvent || cancelledEvent) ? ((completedEvent || cancelledEvent).timestamp.toMillis() - r.createdAt.toMillis()) / 1000 : null;

        // Offers for this ride
        const offersSnap = await db.collection('rideOffers').where('rideId', '==', rideId).get();
        const offers = offersSnap.docs.map(o => o.data());
        const matchingAttempts = offers.length;
        const hasRematch = matchingAttempts > 1;
        const hasTimeout = rideEvents.some(e => e.type === 'TIMEOUT' || (e.extra?.reason?.includes('timeout')));

        // Driver Tracking
        if (r.driverId) {
            activeDrivers.add(r.driverId);
            if (!driverStats[r.driverId]) driverStats[r.driverId] = { rides: 0, ignored: 0, cancelled: 0 };
            if (r.status === 'completed') driverStats[r.driverId].rides++;
            if (r.status === 'cancelled' && r.cancelledBy === 'driver') driverStats[r.driverId].cancelled++;
        }
        
        offers.forEach(o => {
            if (o.status === 'expired' || o._phs_ignored) {
                if (!driverStats[o.driverId]) driverStats[o.driverId] = { rides: 0, ignored: 0, cancelled: 0 };
                driverStats[o.driverId].ignored++;
            }
        });

        // Heatmap
        const originZone = r.origin?.zoneName || "Unknown";
        const destZone = r.destination?.address?.match(/\((.*?)\)/)?.[1] || "Unknown";
        zoneHeatmap.origin[originZone] = (zoneHeatmap.origin[originZone] || 0) + 1;
        zoneHeatmap.dest[destZone] = (zoneHeatmap.dest[destZone] || 0) + 1;

        rideReports.push({
            rideId,
            scenario: r.scenario,
            status: r.status,
            driverId: r.driverId || 'N/A',
            origin: originZone,
            destination: destZone,
            matchTime: matchingTime ? `${matchingTime.toFixed(1)}s` : 'N/A',
            totalTime: totalTime ? `${totalTime.toFixed(1)}s` : 'N/A',
            attempts: matchingAttempts,
            rematch: hasRematch,
            timeout: hasTimeout || r.cancelReason === 'SIM_SEARCHING_TIMEOUT',
            cancelledBy: r.cancelledBy || 'N/A',
            cancelReason: r.cancelReason || 'N/A',
            flow: rideEvents.map(e => e.type).join(' -> ')
        });
    }

    // 4. Financial Validation
    const txSnap = await db.collection('platform_transactions').where('simulationRunId', '==', runId).get();
    const poolSnap = await db.collection('weeklyPoolEvents').where('simulationRunId', '==', runId).get();
    // For balances, we check the simulation drivers
    const driversSnap = await db.collection('users').where('isTestDriver', '==', true).get();
    const hasBalanceChange = driversSnap.docs.some(d => d.data().currentBalance !== undefined && d.data().currentBalance !== 0);

    // 5. Output Report
    const reportPath = path.resolve(process.cwd(), 'reports', `audit_${runId}.json`);
    const report = {
        runId,
        metadata: runData,
        rides: rideReports,
        analysis: {
            totalRides: rideReports.length,
            completed: rideReports.filter(r => r.status === 'completed').length,
            failed: rideReports.filter(r => r.status === 'cancelled').length,
            timeouts: rideReports.filter(r => r.timeout).length,
            rematches: rideReports.filter(r => r.rematch).length,
            avgMatchTime: rideReports.filter(r => r.matchTime !== 'N/A').reduce((acc, r) => acc + parseFloat(r.matchTime), 0) / rideReports.filter(r => r.matchTime !== 'N/A').length,
            fleet: {
                totalTestDrivers: 70,
                activeCount: activeDrivers.size,
                idleCount: 70 - activeDrivers.size,
                topDrivers: Object.entries(driverStats).sort((a,b) => b[1].rides - a[1].rides).slice(0, 5),
                ignorers: Object.entries(driverStats).filter(d => d[1].ignored > 0).map(d => ({ id: d[0], ignored: d[1].ignored }))
            },
            heatmap: zoneHeatmap,
            financialSafety: {
                platformTransactions: txSnap.size,
                weeklyPoolEvents: poolSnap.size,
                balanceIntegrity: !hasBalanceChange
            }
        }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ Audit Complete.`);
    console.log(`📄 Detailed JSON report saved to: ${reportPath}`);
    console.log(`\n====================================================`);
    console.log(`📊 SUMMARY`);
    console.log(`====================================================`);
    console.table(rideReports.map(r => ({
        ID: r.rideId,
        Scenario: r.scenario,
        Status: r.status,
        Match: r.matchTime,
        Total: r.totalTime,
        Att: r.attempts,
        Timeout: r.timeout ? 'YES' : 'no'
    })));
    
    console.log(`\n🔥 Fleet Activity: ${activeDrivers.size} drivers worked, ${70 - activeDrivers.size} stayed idle.`);
    console.log(`💰 Financial Check: TXs: ${txSnap.size}, Pool: ${poolSnap.size}, Balances: ${hasBalanceChange ? '🔴 COMPROMISED' : '🟢 SAFE'}`);
    console.log(`====================================================\n`);
}

runAudit().catch(console.error);
