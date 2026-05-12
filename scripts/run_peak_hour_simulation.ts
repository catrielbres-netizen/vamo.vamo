import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

/**
 * VamO Rawson Peak Hour Simulator (PHS)
 * Orchestrates simulation rides using real matching logic but isolated drivers/financials.
 */

const args = process.argv.slice(2);
const isConfirmed = args.includes('--confirm');

const getArgValue = (name: string) => {
    const found = args.find(a => a.startsWith(`--${name}=`));
    return found ? found.split('=')[1] : null;
};

const durationMinutes = parseInt(getArgValue('durationMinutes') || '5');
const ridesPerMinute = parseInt(getArgValue('ridesPerMinute') || '1');
const maxConcurrentRides = parseInt(getArgValue('maxConcurrentRides') || '5');
const selectedScenario = getArgValue('scenario') || 'all';

// Configurable delays (seconds)
const DELAY_ASSIGNED_TO_ARRIVED = 2;
const DELAY_ARRIVED_TO_IN_PROGRESS = 2;
const DELAY_IN_PROGRESS_TO_COMPLETED = 5;

type ScenarioType = 
    | 'SUCCESS' 
    | 'DELAYED_ACCEPT' 
    | 'IGNORED_OFFER' 
    | 'DRIVER_CANCEL' 
    | 'PASSENGER_CANCEL_BEFORE' 
    | 'PASSENGER_CANCEL_AFTER' 
    | 'NO_SHOW' 
    | 'IN_PROGRESS_CANCEL'
    | 'DRIVER_OFFLINE'
    | 'municipal_realistic'
    | 'realistic'
    | 'all';

const SCENARIOS: ScenarioType[] = [
    'SUCCESS', 'DELAYED_ACCEPT', 'IGNORED_OFFER', 'DRIVER_CANCEL', 
    'PASSENGER_CANCEL_BEFORE', 'PASSENGER_CANCEL_AFTER', 'NO_SHOW', 'IN_PROGRESS_CANCEL', 'DRIVER_OFFLINE'
];

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

// 2. Constants & Helpers
const ZONES = [
    { name: "Rawson Centro", lat: -43.3002, lng: -65.1023 },
    { name: "Playa Unión", lat: -43.3345, lng: -65.0398 },
    { name: "Puerto Rawson", lat: -43.3385, lng: -65.0605 },
    { name: "Hospital", lat: -43.3051, lng: -65.1055 },
    { name: "Municipalidad", lat: -43.2981, lng: -65.1012 },
    { name: "Gregorio Mayo", lat: -43.2921, lng: -65.1102 },
    { name: "Área 12", lat: -43.2951, lng: -65.1152 },
    { name: "Área 16", lat: -43.3051, lng: -65.1182 },
    { name: "San Ramón", lat: -43.2851, lng: -65.0952 },
    { name: "Acceso Norte", lat: -43.2801, lng: -65.1002 },
    { name: "Salida Trelew", lat: -43.2951, lng: -65.1302 },
    { name: "Zona Costanera", lat: -43.3251, lng: -65.0402 },
    { name: "Periferia Sur", lat: -43.3201, lng: -65.1102 }
];

function getRandomCoord(base: number, range: number = 0.005) {
    return base + (Math.random() - 0.5) * range;
}

const TEST_PASSENGERS = [
    { id: "test_pass_rw_1", name: "Sim Pass A" },
    { id: "test_pass_rw_2", name: "Sim Pass B" },
    { id: "test_pass_rw_3", name: "Sim Pass C" },
    { id: "test_pass_rw_4", name: "Sim Pass D" },
    { id: "test_pass_rw_5", name: "Sim Pass E" },
];

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// 3. Main Logic
async function runSimulation() {
    console.log('====================================================');
    console.log('🚀 [PHS] VamO Peak Hour Simulator - RAWSON (FASE 4B)');
    console.log('====================================================');
    console.log(`📍 Project: ${projectId}`);
    console.log(`⏱️ Duration: ${durationMinutes} minutes`);
    console.log(`🚕 Density: ${ridesPerMinute} rides/min | Max Concurrent: ${maxConcurrentRides}`);
    console.log(`🎭 Scenario: ${selectedScenario}`);
    console.log(`⚠️ Mode: ${isConfirmed ? 'EXECUTION' : 'DRY-RUN'}`);
    console.log('----------------------------------------------------');

    // Validation
    const testDriversSnap = await db.collection('drivers_locations')
        .where('cityKey', '==', 'rawson')
        .where('isTestDriver', '==', true)
        .where('driverStatus', '==', 'online')
        .get();

    console.log(`📡 Online Test Drivers found: ${testDriversSnap.size}`);
    if (testDriversSnap.size < 5) {
        console.error('❌ ERROR: Not enough test drivers online. Run seed script first.');
        process.exit(1);
    }

    if (!isConfirmed) {
        console.log('\n🔍 DRY-RUN COMPLETED. Logic verified.');
        return;
    }

    const runId = `run_rw_${Date.now()}`;
    const runRef = db.collection('simulation_runs').doc(runId);
    
    await runRef.set({
        runId,
        startedAt: admin.firestore.Timestamp.now(),
        cityKey: 'rawson',
        config: { durationMinutes, ridesPerMinute, maxConcurrentRides, selectedScenario },
        status: 'running'
    });

    const metrics = {
        requested: 0,
        matched: 0,
        completed: 0,
        failed: 0,
        ignoredOffers: 0,
        rematches: 0,
        latencies: [] as number[],
        acceptanceLatencies: [] as number[],
        durations: [] as number[],
        scenarios: {} as Record<string, { requested: number, completed: number, failed: number }>,
        cancellations: { passenger: 0, driver: 0, system: 0 },
        driversUsed: [] as string[],
        driversIdleAverage: 0,
        driversBusyPeak: 0,
        heatmap: {} as Record<string, number>
    };

    SCENARIOS.forEach(s => metrics.scenarios[s] = { requested: 0, completed: 0, failed: 0 });

    const activeRides = new Set<string>();
    const startTime = Date.now();
    const endTime = startTime + durationMinutes * 60 * 1000;

    let nextSpawnTime = startTime;

    while (Date.now() < endTime || activeRides.size > 0) {
        const now = Date.now();

        // Spawn new ride if possible
        if (now >= nextSpawnTime && now < endTime && activeRides.size < maxConcurrentRides) {
            let scenario: ScenarioType;
            if (selectedScenario === 'realistic') {
                const rand = Math.random() * 100;
                if (rand < 70) scenario = 'SUCCESS';
                else if (rand < 80) scenario = 'PASSENGER_CANCEL_AFTER';
                else if (rand < 90) scenario = 'IGNORED_OFFER';
                else if (rand < 95) scenario = 'DRIVER_CANCEL';
                else scenario = Math.random() > 0.5 ? 'NO_SHOW' : 'DRIVER_OFFLINE';
            } else if (selectedScenario === 'municipal_realistic') {
                const rand = Math.random() * 100;
                if (rand < 85) scenario = 'SUCCESS';
                else if (rand < 90) scenario = 'PASSENGER_CANCEL_AFTER';
                else if (rand < 95) scenario = 'IGNORED_OFFER';
                else if (rand < 98) scenario = 'DRIVER_CANCEL';
                else scenario = Math.random() > 0.5 ? 'NO_SHOW' : 'DRIVER_OFFLINE';
            } else {
                scenario = selectedScenario === 'all' 
                    ? SCENARIOS[metrics.requested % SCENARIOS.length] 
                    : selectedScenario as ScenarioType;
            }
            
            const passenger = TEST_PASSENGERS[metrics.requested % TEST_PASSENGERS.length];
            const rideId = `sim_ride_${uuidv4().substring(0, 8)}`;
            
            await spawnRide(rideId, passenger, runId, scenario);
            activeRides.add(rideId);
            metrics.requested++;
            metrics.scenarios[scenario].requested++;
            
            // Track busy drivers
            if (activeRides.size > metrics.driversBusyPeak) {
                metrics.driversBusyPeak = activeRides.size;
            }

            nextSpawnTime = now + (60 * 1000 / ridesPerMinute);
            console.log(`[PHS] Spawned ${rideId} [${scenario}] (Total: ${metrics.requested} | Active: ${activeRides.size})`);
        }

        await sleep(1000);
        
        for (const rideId of Array.from(activeRides)) {
            const rideSnap = await db.collection('rides').doc(rideId).get();
            const data = rideSnap.data();
            
            if (!data) continue;
            const scenario = data.scenario as ScenarioType;

            // 1. Handle SEARCHING state
            if (data.status === 'searching') {
                // Scenario: PASSENGER_CANCEL_BEFORE
                if (scenario === 'PASSENGER_CANCEL_BEFORE' && (Date.now() - data.createdAt.toMillis()) > 10000) {
                    await db.collection('rides').doc(rideId).update({ status: 'cancelled', cancelledBy: 'passenger', cancelReason: 'Simulated cancel before match', updatedAt: admin.firestore.Timestamp.now() });
                    logEvent(runId, rideId, 'PASSENGER_CANCEL_BEFORE');
                    continue;
                }

                // Normal Matching Check
                const offersSnap = await db.collection('rideOffers')
                    .where('rideId', '==', rideId)
                    .where('status', '==', 'pending')
                    .limit(1)
                    .get();

                if (!offersSnap.empty) {
                    const offerDoc = offersSnap.docs[0];
                    const offer = offerDoc.data();
                    const driverId = offer.driverId;

                    // Scenario: IGNORED_OFFER (Don't accept)
                    if (scenario === 'IGNORED_OFFER') {
                        // Just let it be. System will eventually expire it.
                        // We track it as ignored if it's been pending for too long in our script perspective
                        if (!offer._phs_ignored) {
                            console.log(`[PHS] ${rideId} - Scenario IGNORED_OFFER: Ignoring offer from ${driverId}`);
                            await offerDoc.ref.update({ _phs_ignored: true });
                            metrics.ignoredOffers++;
                        }
                        continue;
                    }

                    // Scenario: DELAYED_ACCEPT
                    const offerTime = (offer.sentAt || offer.createdAt || admin.firestore.Timestamp.now()).toMillis();
                    if (scenario === 'DELAYED_ACCEPT' && (Date.now() - offerTime) < 20000) {
                        continue; // Wait 20s
                    }

                    // ACCEPTANCE
                    // ACCEPTANCE (Problem 2: Atomic Check)
                    const rideRef = db.doc(`rides/${rideId}`);
                    const userRef = db.doc(`users/${driverId}`);
                    const locRef = db.doc(`drivers_locations/${driverId}`);
                    
                    const success = await db.runTransaction(async (tx) => {
                        const rSnap = await tx.get(rideRef);
                        const rData = rSnap.data();
                        if (!rData || rData.status !== 'searching') {
                            return false; // Race condition! Already cancelled or matched.
                        }
                        
                        tx.update(rideRef, {
                            status: 'driver_assigned',
                            driverId: driverId,
                            driverName: "Sim Driver",
                            driverVehicle: "Test Vehicle",
                            updatedAt: admin.firestore.Timestamp.now(),
                            _phs_assigned_at: admin.firestore.Timestamp.now()
                        });

                        tx.update(userRef, { activeRideId: rideId, driverStatus: 'in_ride' });
                        tx.update(locRef, { driverStatus: 'in_ride' });
                        tx.update(offerDoc.ref, { status: 'accepted', finalizedAt: admin.firestore.Timestamp.now() });

                        return true;
                    });

                    if (success) {
                        console.log(`[PHS] ${rideId} - Accepted offer from ${driverId} (${scenario})`);
                        const latency = (Date.now() - (data.createdAt.toMillis())) / 1000;
                        const acceptance = (Date.now() - offerTime) / 1000;
                        metrics.latencies.push(latency);
                        metrics.acceptanceLatencies.push(acceptance);
                        metrics.matched++;
                        
                        if (driverId && !metrics.driversUsed.includes(driverId)) {
                            metrics.driversUsed.push(driverId);
                        }
                        
                        const zone = data.origin.zoneName || "Unknown";
                        metrics.heatmap[zone] = (metrics.heatmap[zone] || 0) + 1;
                        
                        logEvent(runId, rideId, 'MATCHED', { driverId, latency, scenario });
                        handleLifecycle(rideId, runId, scenario);
                    } else {
                        console.log(`[PHS] ${rideId} - Acceptance skipped (status changed)`);
                    }
                    continue;
                } else {
                    // Check for SEARCHING TIMEOUT (Problem 3)
                    const searchingTime = (Date.now() - (data.createdAt.toMillis())) / 1000;
                    if (searchingTime > 180) {
                         console.log(`[PHS] ${rideId} - Global Searching Timeout (180s). Final Radius: ${data.searchRadiusKmUsed || 'N/A'}km, Attempts: ${data.matchingAttempts || 0}`);
                         await db.collection('rides').doc(rideId).update({
                             status: 'cancelled',
                             cancelledBy: 'system',
                             cancelReason: 'SIM_SEARCHING_TIMEOUT',
                             updatedAt: admin.firestore.Timestamp.now()
                         });
                         metrics.failed++;
                         activeRides.delete(rideId);
                    }
                }
            }

            // 2. Handle COMPLETED
            if (data.status === 'completed') {
                const totalDuration = (data.completedAt.toMillis() - data.createdAt.toMillis()) / 1000;
                metrics.durations.push(totalDuration);
                metrics.completed++;
                metrics.scenarios[scenario].completed++;
                activeRides.delete(rideId);
                console.log(`[PHS] ${rideId} COMPLETED [${scenario}] (Total: ${totalDuration.toFixed(1)}s, Radius: ${data.searchRadiusKmUsed || 'N/A'}km, Attempts: ${data.matchingAttempts || 0})`);
            }

            // 3. Handle CANCELLED
            if (data.status === 'cancelled') {
                metrics.failed++;
                metrics.scenarios[scenario].failed++;
                if (data.cancelledBy === 'passenger') metrics.cancellations.passenger++;
                if (data.cancelledBy === 'driver') metrics.cancellations.driver++;
                activeRides.delete(rideId);
                console.log(`[PHS] ${rideId} FAILED [${scenario}] (By: ${data.cancelledBy}, Reason: ${data.cancelReason}, Radius: ${data.searchRadiusKmUsed || 'N/A'}km, Attempts: ${data.matchingAttempts || 0})`);
            }
        }
        
        // Progress log
        if (now % 30000 < 1000) {
            console.log(`[PHS] Progress: ${metrics.completed} completed, ${activeRides.size} active, ${metrics.failed} failed...`);
        }
    }

    // Finalize
    const avgMatch = metrics.latencies.length > 0 ? metrics.latencies.reduce((a,b) => a+b, 0) / metrics.latencies.length : 0;
    const avgAcceptance = metrics.acceptanceLatencies.length > 0 ? metrics.acceptanceLatencies.reduce((a,b) => a+b, 0) / metrics.acceptanceLatencies.length : 0;
    const avgTotal = metrics.durations.length > 0 ? metrics.durations.reduce((a,b) => a+b, 0) / metrics.durations.length : 0;

    await runRef.update({
        endedAt: admin.firestore.Timestamp.now(),
        status: 'finished',
        metrics: {
            ridesRequested: metrics.requested,
            ridesMatched: metrics.matched,
            ridesCompleted: metrics.completed,
            ridesFailed: metrics.failed,
            avgMatchSeconds: avgMatch,
            avgAcceptanceSeconds: avgAcceptance,
            avgTotalTripSeconds: avgTotal,
            scenarioMetrics: metrics.scenarios,
            ignoredOffers: metrics.ignoredOffers,
            cancellations: metrics.cancellations,
            driversBusyPeak: metrics.driversBusyPeak,
            heatmap: metrics.heatmap
        }
    });

    console.log('====================================================');
    console.log('📊 SIMULATION SUMMARY (FASE 5)');
    console.log('====================================================');
    console.table(Object.entries(metrics.scenarios).map(([name, m]) => ({ Scenario: name, Requested: m.requested, Completed: m.completed, Failed: m.failed })));
    console.log('----------------------------------------------------');
    console.log(`✅ Completed: ${metrics.completed} | ❌ Failed: ${metrics.failed} | ⏳ Avg Match: ${avgMatch.toFixed(1)}s | 🚕 Avg Acceptance: ${avgAcceptance.toFixed(1)}s`);
    console.log(`🚫 Ignored Offers: ${metrics.ignoredOffers} | 👤 Pax Cancels: ${metrics.cancellations.passenger} | 🚕 Driver Cancels: ${metrics.cancellations.driver}`);
    console.log(`🔥 Drivers Busy Peak: ${metrics.driversBusyPeak} | 🗺️ Heatmap Zones: ${Object.keys(metrics.heatmap).length}`);
    console.log(`🔍 Run ID: ${runId}`);
    console.log('====================================================\n');

    if (process.argv.includes('--confirm')) {
        await cleanupSimulation(db, runId);
    }
}

async function cleanupSimulation(db: admin.firestore.Firestore, runId: string) {
    console.log(`🧹 [PHS] Starting cleanup for run ${runId}...`);
    const snap = await db.collection('rides')
        .where('simulationRunId', '==', runId)
        .where('status', 'in', ['searching', 'driver_assigned', 'driver_arrived', 'in_progress'])
        .get();
    
    if (snap.empty) {
        console.log(`🧹 [PHS] Nothing to clean.`);
        return;
    }

    const batch = db.batch();
    for (const doc of snap.docs) {
        batch.update(doc.ref, {
            status: 'cancelled',
            cancelledBy: 'system',
            cancelReason: 'SIM_CLEANUP',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Also expire any pending offers for these rides
        const offersSnap = await db.collection('rideOffers')
            .where('rideId', '==', doc.id)
            .where('status', '==', 'pending')
            .get();
        
        offersSnap.forEach(o => {
            batch.update(o.ref, { status: 'expired', finalizedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
    }

    await batch.commit();
    console.log(`🧹 [PHS] Cleanup done. ${snap.size} rides finalized.`);
}

async function spawnRide(rideId: string, passenger: any, runId: string, scenario: ScenarioType) {
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const origin = { 
        lat: getRandomCoord(zone.lat), 
        lng: getRandomCoord(zone.lng), 
        address: `Sim Pickup (${zone.name})`, 
        city: "Rawson", 
        cityKey: "rawson",
        zoneName: zone.name
    };
    const destZone = ZONES[Math.floor(Math.random() * ZONES.length)];
    const destination = { 
        lat: getRandomCoord(destZone.lat), 
        lng: getRandomCoord(destZone.lng), 
        address: `Sim Dropoff (${destZone.name})` 
    };

    const ridePayload = {
        id: rideId,
        passengerId: passenger.id,
        passengerName: passenger.name,
        status: 'searching',
        serviceType: 'professional',
        origin,
        destination,
        cityKey: 'rawson',
        isSimulation: true,
        simulationRunId: runId,
        scenario,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        pricing: { estimatedTotal: 1200, estimatedDistanceMeters: 2500 }
    };

    await db.collection('rides').doc(rideId).set(ridePayload);
}

async function handleLifecycle(rideId: string, runId: string, scenario: ScenarioType) {
    const rideRef = db.collection('rides').doc(rideId);
    
    try {
        const checkStatus = async () => {
            const snap = await rideRef.get();
            return snap.data()?.status;
        };

        if (await checkStatus() === 'cancelled') return;

        // Scenario: PASSENGER_CANCEL_AFTER
        if (scenario === 'PASSENGER_CANCEL_AFTER') {
            await sleep(5000);
            if (await checkStatus() === 'cancelled') return;
            await rideRef.update({ status: 'cancelled', cancelledBy: 'passenger', cancelReason: 'Simulated cancel after match', updatedAt: admin.firestore.Timestamp.now() });
            logEvent(runId, rideId, 'PASSENGER_CANCEL_AFTER');
            return;
        }

        // Scenario: DRIVER_CANCEL
        if (scenario === 'DRIVER_CANCEL') {
            await sleep(5000);
            if (await checkStatus() === 'cancelled') return;
            await rideRef.update({ status: 'cancelled', cancelledBy: 'driver', cancelReason: 'Simulated driver cancel', updatedAt: admin.firestore.Timestamp.now() });
            logEvent(runId, rideId, 'DRIVER_CANCEL');
            return;
        }

        // Simulate Driver arriving
        await sleep(DELAY_ASSIGNED_TO_ARRIVED * 1000);
        if (await checkStatus() === 'cancelled') return;
        await rideRef.update({ status: 'driver_arrived', updatedAt: admin.firestore.Timestamp.now() });
        logEvent(runId, rideId, 'DRIVER_ARRIVED');

        // Scenario: NO_SHOW
        if (scenario === 'NO_SHOW') {
            await sleep(5000);
            if (await checkStatus() === 'cancelled') return;
            await rideRef.update({ status: 'cancelled', cancelledBy: 'passenger', cancelReason: 'Simulated no-show cancel', updatedAt: admin.firestore.Timestamp.now() });
            logEvent(runId, rideId, 'NO_SHOW');
            return;
        }

        // Simulate In Progress
        await sleep(DELAY_ARRIVED_TO_IN_PROGRESS * 1000);
        if (await checkStatus() === 'cancelled') return;
        await rideRef.update({ status: 'in_progress', startedAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() });
        logEvent(runId, rideId, 'IN_PROGRESS');

        // Scenario: IN_PROGRESS_CANCEL
        if (scenario === 'IN_PROGRESS_CANCEL') {
            await sleep(5000);
            if (await checkStatus() === 'cancelled') return;
            await rideRef.update({ status: 'cancelled', cancelledBy: 'system', cancelReason: 'Simulated interruption', updatedAt: admin.firestore.Timestamp.now() });
            logEvent(runId, rideId, 'IN_PROGRESS_CANCEL');
            return;
        }

        // Scenario: DRIVER_OFFLINE
        if (scenario === 'DRIVER_OFFLINE') {
            await sleep(3000);
            if (await checkStatus() === 'cancelled') return;
            const rideData = (await rideRef.get()).data();
            if (rideData?.driverId) {
                await db.doc(`users/${rideData.driverId}`).update({ driverStatus: 'offline' });
                await db.doc(`drivers_locations/${rideData.driverId}`).update({ driverStatus: 'offline' });
                await rideRef.update({ status: 'cancelled', cancelledBy: 'driver', cancelReason: 'Driver went offline', updatedAt: admin.firestore.Timestamp.now() });
                logEvent(runId, rideId, 'DRIVER_OFFLINE');
            }
            return;
        }

        // Simulate Completion
        await sleep(DELAY_IN_PROGRESS_TO_COMPLETED * 1000);
        if (await checkStatus() === 'cancelled') return;
        await rideRef.update({ status: 'completed', completedAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() });
        logEvent(runId, rideId, 'COMPLETED');

    } catch (err) {
        console.error(`[PHS] Error in lifecycle for ${rideId}:`, err);
    }
}

async function logEvent(runId: string, rideId: string, type: string, extra: any = {}) {
    await db.collection('simulation_runs').doc(runId).collection('events').add({
        rideId,
        type,
        ...extra,
        timestamp: admin.firestore.Timestamp.now()
    });
}

runSimulation().catch(err => {
    console.error('❌ FATAL ERROR:', err);
    process.exit(1);
});
