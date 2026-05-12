import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * [VamO FASE 6] Enhanced Audit Script
 * Extracts deep metrics for the municipal validation.
 */

const projectId = process.env.FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

async function runAudit() {
    console.log(`\n====================================================`);
    console.log(`🔍 [AUDIT] FASE 6: Municipal Realistic Report`);
    console.log(`====================================================\n`);

    const runSnap = await db.collection('simulation_runs').orderBy('startedAt', 'desc').limit(1).get();
    if (runSnap.empty) return;
    const runDoc = runSnap.docs[0];
    const runId = runDoc.id;
    const runData = runDoc.data();

    const ridesSnap = await db.collection('rides').where('simulationRunId', '==', runId).get();
    const rideReports = [];
    const driversActive = new Map<string, { rides: number, ignored: number, cancelled: number }>();
    const zonalStats: Record<string, { origin: number, dest: number, matchSum: number, matchCount: number }> = {};

    for (const doc of ridesSnap.docs) {
        const r = doc.data();
        const rideId = doc.id;
        
        // Offers
        const offersSnap = await db.collection('rideOffers').where('rideId', '==', rideId).get();
        const offers = offersSnap.docs.map(o => o.data());
        
        // Events
        const eventsSnap = await db.collection('simulation_runs').doc(runId).collection('events').where('rideId', '==', rideId).get();
        const events = eventsSnap.docs.map(e => e.data()).sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

        const matchedEvent = events.find(e => e.type === 'MATCHED');
        const completedEvent = events.find(e => e.type === 'COMPLETED');
        const cancelledEvent = events.find(e => e.type.includes('CANCEL') || e.type === 'NO_SHOW');

        const matchTime = matchedEvent ? (matchedEvent.timestamp.toMillis() - r.createdAt.toMillis()) / 1000 : null;
        const totalTime = (completedEvent || cancelledEvent) ? ((completedEvent || cancelledEvent).timestamp.toMillis() - r.createdAt.toMillis()) / 1000 : null;

        // Update Driver Stats
        if (r.driverId) {
            const stats = driversActive.get(r.driverId) || { rides: 0, ignored: 0, cancelled: 0 };
            if (r.status === 'completed') stats.rides++;
            if (r.status === 'cancelled' && r.cancelledBy === 'driver') stats.cancelled++;
            driversActive.set(r.driverId, stats);
        }
        offers.forEach(o => {
            if (o.status === 'expired' || o._phs_ignored) {
                const stats = driversActive.get(o.driverId) || { rides: 0, ignored: 0, cancelled: 0 };
                stats.ignored++;
                driversActive.set(o.driverId, stats);
            }
        });

        // Update Zonal Stats
        const origin = r.origin?.zoneName || "Unknown";
        const dest = r.destination?.address?.match(/\((.*?)\)/)?.[1] || "Unknown";
        if (!zonalStats[origin]) zonalStats[origin] = { origin: 0, dest: 0, matchSum: 0, matchCount: 0 };
        if (!zonalStats[dest]) zonalStats[dest] = { origin: 0, dest: 0, matchSum: 0, matchCount: 0 };
        zonalStats[origin].origin++;
        zonalStats[dest].dest++;
        if (matchTime !== null) {
            zonalStats[origin].matchSum += matchTime;
            zonalStats[origin].matchCount++;
        }

        rideReports.push({
            rideId, scenario: r.scenario, status: r.status, driverId: r.driverId || 'N/A',
            matchTime: matchTime !== null ? `${matchTime.toFixed(1)}s` : 'N/A',
            totalTime: totalTime !== null ? `${totalTime.toFixed(1)}s` : 'N/A',
            attempts: offers.length, origin, dest,
            cancelledBy: r.cancelledBy || 'N/A', cancelReason: r.cancelReason || 'N/A'
        });
    }

    // Financial Audit
    const txCount = (await db.collection('platform_transactions').where('simulationRunId', '==', runId).get()).size;
    const poolCount = (await db.collection('weeklyPoolEvents').where('simulationRunId', '==', runId).get()).size;

    const report = {
        runId,
        metrics: {
            requested: rideReports.length,
            completed: rideReports.filter(r => r.status === 'completed').length,
            cancelled: rideReports.filter(r => r.status === 'cancelled').length,
            driversUsed: driversActive.size,
            driversIdle: 70 - driversActive.size,
            avgMatch: rideReports.filter(r => r.matchTime !== 'N/A').reduce((a, b) => a + parseFloat(b.matchTime), 0) / rideReports.filter(r => r.matchTime !== 'N/A').length
        },
        financialIsolation: { transactions: txCount, poolEvents: poolCount, safe: txCount === 0 && poolCount === 0 },
        zonalSummary: Object.entries(zonalStats).map(([zone, s]) => ({
            zone, origin: s.origin, dest: s.dest, avgMatch: s.matchCount > 0 ? (s.matchSum / s.matchCount).toFixed(1) + 's' : 'N/A'
        })),
        topDrivers: Array.from(driversActive.entries()).sort((a,b) => b[1].rides - a[1].rides).slice(0, 5),
        rides: rideReports
    };

    const reportPath = path.resolve(process.cwd(), 'reports', `audit_municipal_${runId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`✅ Audit Complete. Report: ${reportPath}`);
}

runAudit().catch(console.error);
