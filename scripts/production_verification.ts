import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

/**
 * [VamO FASE 5] PRODUCTION VERIFICATION SCRIPT
 * 
 * This script verifies that the DEPLOYED Cloud Functions work as expected.
 * It creates rides and waits for the real 'onRideSettlementV6' to run.
 */

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function setupTestUser(uid: string, role: 'driver' | 'passenger', balance: number = 5000, subtype: string = 'particular') {
    const userRef = db.collection('users').doc(uid);
    const walletRef = db.collection('wallets').doc(uid);
    
    await userRef.set({
        uid, role, currentBalance: balance, driverSubtype: subtype,
        name: `PROD_TEST_${role.toUpperCase()}_${uid.slice(-4)}`,
        approved: true,
        cityKey: 'rawson',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    if (role === 'driver') {
        await db.collection('drivers_locations').doc(uid).set({
            driverId: uid,
            driverStatus: 'online',
            lastUpdateAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
}

async function runScenario(scenarioName: string, config: any) {
    console.log(`\n🚀 RUNNING: ${scenarioName}`);
    const rideId = `prod_${uuidv4().substring(0, 8)}`;
    const passengerId = 'prod_test_pass';
    const driverId = config.subtype === 'professional' ? 'prod_test_driver_pro' : 'prod_test_driver_part';

    const pBefore = (await db.collection('users').doc(passengerId).get()).data();
    const dBefore = (await db.collection('users').doc(driverId).get()).data();

    const netTotal = config.totalFare - (config.discount || 0);
    const walletUsed = config.useWallet ? Math.min(pBefore?.currentBalance || 0, netTotal) : 0;

    console.log(`   - Creating ride ${rideId} (in_progress)...`);
    await db.collection('rides').doc(rideId).set({
        passengerId, driverId, cityKey: 'rawson', status: 'in_progress',
        serviceType: config.subtype,
        pricing: {
            finalTotal: config.totalFare,
            expressDiscountAmount: config.discount || 0,
            walletCoveredAmount: walletUsed,
            pricingSnapshot: {
                commission_particular: 0.13,
                commission_taxi_remis: 0.07,
                municipal_percentage: 0.05,
                cityKey: 'rawson',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            }
        },
        paymentMethod: walletUsed > 0 ? (walletUsed >= netTotal ? 'wallet' : 'mixed') : 'cash',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`   - Waiting 2s before completion...`);
    await new Promise(r => setTimeout(r, 2000));

    console.log(`   - Updating ride ${rideId} to 'completed'...`);
    await db.collection('rides').doc(rideId).update({
        status: 'completed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`   - Waiting for production Cloud Function (25s)...`);
    await new Promise(r => setTimeout(r, 25000));

    const pAfter = (await db.collection('users').doc(passengerId).get()).data();
    const dAfter = (await db.collection('users').doc(driverId).get()).data();
    const ride = (await db.collection('rides').doc(rideId).get()).data();
    const cr = ride?.completedRide;

    if (!ride?.settledAt) {
        console.error(`   ❌ Settlement NOT found for ${rideId}. The function might have failed or not triggered.`);
        return { scenario: scenarioName, status: 'FAILED' };
    }

    const passDiff = (pBefore?.currentBalance || 0) - (pAfter?.currentBalance || 0);
    const driverDiff = (dAfter?.currentBalance || 0) - (dBefore?.currentBalance || 0);

    return {
        scenario: scenarioName,
        rideId,
        total: config.totalFare,
        walletUsed,
        passBalBefore: pBefore?.currentBalance,
        passBalAfter: pAfter?.currentBalance,
        driverBalBefore: dBefore?.currentBalance,
        driverBalAfter: dAfter?.currentBalance,
        passDiff,
        driverDiff,
        status: (passDiff === walletUsed) ? 'OK' : 'ERR_BAL'
    };
}

async function start() {
    console.log("🛠️ SETTING UP PRODUCTION TEST USERS...");
    await setupTestUser('prod_test_pass', 'passenger', 10000);
    await setupTestUser('prod_test_driver_part', 'driver', 0, 'particular');
    await setupTestUser('prod_test_driver_pro', 'driver', 0, 'professional');

    const results = [];
    
    // 1. Efectivo Total (Particular)
    results.push(await runScenario("Efectivo Total (Particular)", {
        subtype: 'particular', totalFare: 2000, discount: 0, useWallet: false
    }));

    // 2. VamO Pay Total (Profesional)
    results.push(await runScenario("VamO Pay Total (Profesional)", {
        subtype: 'professional', totalFare: 3000, discount: 0, useWallet: true
    }));

    // 3. VamO Pay Parcial (Particular)
    results.push(await runScenario("VamO Pay Parcial (Particular)", {
        subtype: 'particular', totalFare: 5000, discount: 500, useWallet: true // Wallet will cover 4500
    }));

    // 4. Particular (Particular) - Repetition for stats check
    results.push(await runScenario("Particular Adicional (Stats Check)", {
        subtype: 'particular', totalFare: 1000, discount: 0, useWallet: false
    }));

    // 5. Taxi/Remis (Profesional)
    results.push(await runScenario("Taxi/Remis (Profesional)", {
        subtype: 'professional', totalFare: 2500, discount: 0, useWallet: true
    }));

    console.log("\n=========================================================================================================");
    console.log("PRODUCTION VERIFICATION REPORT");
    console.log("=========================================================================================================");
    console.table(results);
    console.log("=========================================================================================================");
    
    const allOk = results.every(r => r.status === 'OK');
    if (allOk) {
        console.log("✅ PRODUCTION IS STABLE AND FINANCIALS ARE CORRECT.");
    } else {
        console.error("❌ PRODUCTION INCONSISTENCY DETECTED!");
    }
}

start().catch(console.error);
