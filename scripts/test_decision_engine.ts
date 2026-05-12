import admin from 'firebase-admin';

const PROJECT_ID = "studio-6697160840-7c67f";
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();

async function testDecisionEngine() {
    console.log("=== PHASE 2E: DECISION ENGINE — SIMULATION EXCLUSION TEST ===\n");

    const { processFraudAlertDecision } = await import('../functions/src/lib/antifraudDecisionEngine.ts');

    let passed = 0;
    let failed = 0;

    function check(label: string, condition: boolean) {
        const icon = condition ? "✅" : "❌";
        console.log(`  ${icon} ${label}`);
        if (condition) passed++; else failed++;
    }

    // ── BLOCK 1: Simulation exclusions ──────────────────────────────────────
    console.log("--- BLOCK 1: Simulation / Test exclusions ---\n");

    // 1a. passengerId starts with test_
    {
        const alertId = `alt_test_${Date.now()}`;
        const alertData = {
            id: alertId, type: 'ghost_ride', score: 90,
            passengerId: 'test_passenger_phase2b',
            driverId: 'real_driver_001',
            rideId: 'ride_test_1', cityKey: 'trelew',
            createdAt: admin.firestore.Timestamp.now()
        };
        await db.collection('fraud_alerts').doc(alertId).set(alertData);
        const d = await processFraudAlertDecision(alertId, alertData);
        console.log(`[1a] passenger test_ prefix: action=${d.action}, skipped=${d.skipped}, reason=${d.skipReason}`);
        check("Action is 'none'", d.action === 'none');
        check("Marked as skipped", d.skipped === true);
        check("No fraud_action written", !(await db.collection('fraud_actions').where('alertId', '==', alertId).limit(1).get()).size);
    }

    // 1b. driverId starts with test_
    {
        const alertId = `alt_testdrv_${Date.now()}`;
        const alertData = {
            id: alertId, type: 'ghost_ride', score: 90,
            passengerId: 'real_passenger_001',
            driverId: 'test_driver_engine_123',
            rideId: 'ride_test_2', cityKey: 'trelew',
            createdAt: admin.firestore.Timestamp.now()
        };
        await db.collection('fraud_alerts').doc(alertId).set(alertData);
        const d = await processFraudAlertDecision(alertId, alertData);
        console.log(`\n[1b] driver test_ prefix: action=${d.action}, skipped=${d.skipped}`);
        check("Action is 'none'", d.action === 'none');
        check("Marked as skipped", d.skipped === true);
    }

    // 1c. isSimulation=true on alert
    {
        const alertId = `alt_sim_${Date.now()}`;
        const alertData = {
            id: alertId, type: 'ghost_ride', score: 90,
            passengerId: 'real_passenger_002',
            driverId: 'real_driver_002',
            rideId: 'ride_sim_3', cityKey: 'trelew',
            isSimulation: true,
            createdAt: admin.firestore.Timestamp.now()
        };
        await db.collection('fraud_alerts').doc(alertId).set(alertData);
        const d = await processFraudAlertDecision(alertId, alertData);
        console.log(`\n[1c] isSimulation=true: action=${d.action}, skipped=${d.skipped}`);
        check("Action is 'none'", d.action === 'none');
        check("Marked as skipped", d.skipped === true);
    }

    // 1d. isTestDriver=true
    {
        const alertId = `alt_tstdrv_${Date.now()}`;
        const alertData = {
            id: alertId, type: 'ghost_ride', score: 90,
            passengerId: 'real_passenger_003',
            driverId: 'real_driver_003',
            rideId: 'ride_test_4', cityKey: 'trelew',
            isTestDriver: true,
            createdAt: admin.firestore.Timestamp.now()
        };
        await db.collection('fraud_alerts').doc(alertId).set(alertData);
        const d = await processFraudAlertDecision(alertId, alertData);
        console.log(`\n[1d] isTestDriver=true: action=${d.action}, skipped=${d.skipped}`);
        check("Action is 'none'", d.action === 'none');
        check("Marked as skipped", d.skipped === true);
    }

    // ── BLOCK 2: Real users DO get decisions ─────────────────────────────────
    console.log("\n--- BLOCK 2: Real users generate decisions (monitor mode) ---\n");

    const realDriverId = `prod_driver_${Date.now()}`;
    const realPassengerId = `prod_passenger_${Date.now()}`;

    // 2a. First ghost_ride → flag
    {
        const alertId = `alt_real_1_${Date.now()}`;
        const alertData = {
            id: alertId, type: 'ghost_ride', score: 50,
            passengerId: realPassengerId, driverId: realDriverId,
            rideId: 'ride_real_1', cityKey: 'trelew',
            createdAt: admin.firestore.Timestamp.now()
        };
        await db.collection('fraud_alerts').doc(alertId).set(alertData);
        const d = await processFraudAlertDecision(alertId, alertData);
        console.log(`[2a] 1st ghost_ride (real): action=${d.action}`);
        check("Action is 'flag'", d.action === 'flag');
        check("NOT skipped", !d.skipped);
    }

    // 2b. gps_missing × 1 → none
    {
        const alertId = `alt_real_gps_${Date.now()}`;
        const alertData = {
            id: alertId, type: 'gps_missing', score: 70,
            passengerId: realPassengerId, driverId: realDriverId,
            rideId: 'ride_real_2', cityKey: 'trelew',
            createdAt: admin.firestore.Timestamp.now()
        };
        await db.collection('fraud_alerts').doc(alertId).set(alertData);
        const d = await processFraudAlertDecision(alertId, alertData);
        console.log(`\n[2b] 1st gps_missing (real): action=${d.action}`);
        check("Action is 'none' or 'flag' (depends on history count)", d.action === 'none' || d.action === 'flag');
        check("NOT skipped", !d.skipped);
    }

    // ── SUMMARY ──────────────────────────────────────────────────────────────
    console.log(`\n============================`);
    console.log(`✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`);
    console.log(`============================`);
    if (failed === 0) {
        console.log("\n🎉 Simulation exclusion guard is working correctly.");
        console.log("   Test data will NEVER contaminate fraud_actions.");
    } else {
        console.log("\n⚠️  Some checks failed — review the output above.");
    }
}

testDecisionEngine().catch(console.error);
