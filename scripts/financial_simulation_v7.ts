import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

const PROJECT_ID = 'studio-6697160840-7c67f';

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

interface TestConfig {
    paymentMethod: 'cash' | 'wallet' | 'wallet_partial';
    serviceType: 'professional' | 'express';
    driverSubtype: 'particular' | 'professional'; // professional = taxi/remis
    distanceKm: number;
    hasDiscount: boolean;
}

// Embedded VamO Pricing Logic (v7 Standard)
function calculateRidePrice(
    input: { distanceKm: number, durationMin: number, waitingSeconds?: number, serviceType: string, isNight: boolean },
    config: { DAY_BASE_FARE: number, DAY_PRICE_PER_100M: number, NIGHT_BASE_FARE?: number, NIGHT_PRICE_PER_100M?: number, DAY_WAITING_PER_MIN: number, NIGHT_WAITING_PER_MIN?: number, MINIMUM_FARE?: number }
) {
    const isNight = input.isNight;
    const baseFare = isNight ? (config.NIGHT_BASE_FARE || config.DAY_BASE_FARE) : config.DAY_BASE_FARE;
    const pricePer100m = isNight ? (config.NIGHT_PRICE_PER_100M || config.DAY_PRICE_PER_100M) : config.DAY_PRICE_PER_100M;
    const waitingPerMin = isNight ? (config.NIGHT_WAITING_PER_MIN || config.DAY_WAITING_PER_MIN) : config.DAY_WAITING_PER_MIN;

    const distanceMeters = input.distanceKm * 1000;
    const distanceUnits = Math.ceil(distanceMeters / 100);
    const distanceFare = distanceUnits * pricePer100m;

    const FREE_WAIT_SECONDS = 300;
    const totalWaitSeconds = input.waitingSeconds || 0;
    const billableWaitSeconds = Math.max(0, totalWaitSeconds - FREE_WAIT_SECONDS);
    const billableWaitMinutes = Math.ceil(billableWaitSeconds / 60);
    const waitingFare = billableWaitMinutes * waitingPerMin;

    const subtotal = (baseFare || 0) + (distanceFare || 0) + (waitingFare || 0);
    const totalRounded = Math.ceil(subtotal / 50) * 50;

    const minFare = config.MINIMUM_FARE || 0;
    let finalTotal = totalRounded;
    let minimumFareApplied = false;

    if (finalTotal < minFare) {
        finalTotal = minFare;
        minimumFareApplied = true;
    }

    return {
        total: finalTotal,
        breakdown: {
            baseFare,
            distanceFare,
            waitingFare,
            subtotal,
            minimumFareApplied,
            total: finalTotal
        }
    };
}

async function setupSimulationEnvironment() {
    console.log('🛠️ [SETUP] Initializing emulator environment docs...');
    
    // Seed City Pricing (Rawson)
    const pricing = {
        DAY_BASE_FARE: 500,
        DAY_PRICE_PER_100M: 50,
        DAY_WAITING_PER_MIN: 100,
        MINIMUM_FARE: 800,
        version: 'v7_sim_rawson',
        PLATFORM_COMMISSION_RATE: 0.13, // Default VamO Particular
        commission_particular: 0.13,
        commission_taxi_remis: 0.07,
        municipal_percentage: 0.05
    };

    await db.collection('cities').doc('rawson').set({
        name: 'Rawson',
        pricing,
        enabled: true
    }, { merge: true });

    await db.doc('expansion_incentives/rawson').set({
        enabled: false
    }, { merge: true });

    console.log('✅ [SETUP] Docs seeded.');
}

async function runFinancialSimulation() {
    console.log('🚀 [SIMULATION] Starting Financial Consistency Audit (V7)');
    console.log('----------------------------------------------------');

    await setupSimulationEnvironment();

    const results: any[] = [];
    const simulationId = `sim_v7_${Date.now()}`;
    // ... rest of the logic

    // 1. Setup Test Users
    const passengerId = 'test_pass_financial';
    const driverId = 'test_driver_financial';
    
    await setupUser(passengerId, 'passenger', 5000); // Start with $5000 wallet
    await setupUser(driverId, 'driver', 0, 'particular');

    // 2. Define Test Cases (20 total)
    const testCases: TestConfig[] = [
        // Cash Cases
        { paymentMethod: 'cash', serviceType: 'professional', driverSubtype: 'particular', distanceKm: 5.2, hasDiscount: false },
        { paymentMethod: 'cash', serviceType: 'professional', driverSubtype: 'professional', distanceKm: 3.0, hasDiscount: false },
        { paymentMethod: 'cash', serviceType: 'express', driverSubtype: 'particular', distanceKm: 8.5, hasDiscount: true },
        
        // VamO Pay Total Cases
        { paymentMethod: 'wallet', serviceType: 'professional', driverSubtype: 'particular', distanceKm: 4.1, hasDiscount: false },
        { paymentMethod: 'wallet', serviceType: 'professional', driverSubtype: 'professional', distanceKm: 2.2, hasDiscount: false },
        { paymentMethod: 'wallet', serviceType: 'express', driverSubtype: 'particular', distanceKm: 6.0, hasDiscount: true },

        // VamO Pay Partial Cases
        { paymentMethod: 'wallet_partial', serviceType: 'professional', driverSubtype: 'particular', distanceKm: 7.3, hasDiscount: false },
        { paymentMethod: 'wallet_partial', serviceType: 'professional', driverSubtype: 'professional', distanceKm: 1.5, hasDiscount: false },
        
        // Mixed & Edge Cases
        { paymentMethod: 'cash', serviceType: 'professional', driverSubtype: 'particular', distanceKm: 1.0, hasDiscount: false }, // Short
        { paymentMethod: 'wallet', serviceType: 'professional', driverSubtype: 'particular', distanceKm: 15.0, hasDiscount: false }, // Long
    ];

    // Add more cases to reach 20
    while (testCases.length < 20) {
        testCases.push({
            paymentMethod: Math.random() > 0.5 ? 'cash' : 'wallet',
            serviceType: Math.random() > 0.7 ? 'express' : 'professional',
            driverSubtype: Math.random() > 0.5 ? 'particular' : 'professional',
            distanceKm: parseFloat((Math.random() * 10 + 1).toFixed(1)),
            hasDiscount: Math.random() > 0.8
        });
    }

    // 3. Execution Loop
    for (let i = 0; i < testCases.length; i++) {
        const config = testCases[i];
        const rideId = `ride_test_${i}_${simulationId.substring(7)}`;
        
        try {
            const result = await executeRide(rideId, passengerId, driverId, config, simulationId);
            results.push(result);
            console.log(`✅ [${i+1}/20] Ride ${rideId}: ${result.status}`);
            await new Promise(r => setTimeout(r, 2000)); // BREATHING ROOM
        } catch (err: any) {
            console.error(`❌ [${i+1}/20] Ride ${rideId} FAILED:`, err.message);
            results.push({ rideId, status: 'ERROR', error: err.message });
        }
    }

    // 4. Report Generation
    console.log('\n====================================================================================================');
    console.log('📊 FINANCIAL SIMULATION REPORT (RAWSON V7)');
    console.log('====================================================================================================');
    console.table(results.map(r => ({
        ID: r.rideId.substring(0, 15),
        Type: r.driverSubtype,
        Pay: r.paymentMethod,
        Est: r.estTotal,
        Final: r.finalTotal,
        Wallet: r.walletUsed,
        Cash: r.cashColl,
        Vamo: r.vamoComm,
        Muni: r.muniComm,
        Net: r.netEarn,
        P_Bal: `${r.pBefore} -> ${r.pAfter}`,
        D_Bal: `${r.dBefore} -> ${r.dAfter}`,
        D_Earns: r.dDailyEarnings,
        D_Rides: r.dDailyRides,
        Missions: r.dMissions,
        Diff: r.diff,
        Status: r.status
    })));
    
    const errors = results.filter(r => r.status === 'ERROR' || r.diff !== 0);
    if (errors.length > 0) {
        console.log(`\n❌ CRITICAL: Found ${errors.length} inconsistencies!`);
    } else {
        console.log('\n💎 SUCCESS: All 20 rides matched perfectly ($0 drift).');
    }
}

async function setupUser(uid: string, role: string, balance: number, subtype?: string) {
    await db.collection('users').doc(uid).set({
        uid,
        role,
        currentBalance: balance,
        isTest: true,
        driverSubtype: subtype || null,
        dailyStats: { earningsDaily: 0, lastResetDate: '2026-05-04' },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    if (role === 'driver') {
        await db.collection('drivers_locations').doc(uid).set({
            driverId: uid,
            driverStatus: 'online',
            isTestDriver: true,
            cityKey: 'rawson',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
}

async function executeRide(rideId: string, pId: string, dId: string, config: TestConfig, simId: string) {
    const pricingConfig = {
        DAY_BASE_FARE: 500,
        DAY_PRICE_PER_100M: 50,
        DAY_WAITING_PER_MIN: 100,
        MINIMUM_FARE: 800,
        version: 'v7_sim'
    };

    // --- STEP 1: ESTIMATE (Simulate createRideV1) ---
    const pricingResult = calculateRidePrice({
        distanceKm: config.distanceKm,
        durationMin: Math.ceil(config.distanceKm * 2), // 2 min per km
        serviceType: config.serviceType,
        isNight: false,
    }, pricingConfig as any);

    let estTotal = pricingResult.total;
    let expressDiscount = 0;
    if (config.serviceType === 'express' && config.hasDiscount) {
        expressDiscount = Math.min(Math.floor(estTotal * 0.1), 400);
        estTotal -= expressDiscount;
    }

    let walletUsed = 0;
    let walletCoveredAmount = 0;
    if (config.paymentMethod === 'wallet') {
        walletUsed = estTotal;
        walletCoveredAmount = estTotal;
    } else if (config.paymentMethod === 'wallet_partial') {
        walletUsed = 500;
        walletCoveredAmount = 500;
    }

    const rideRef = db.collection('rides').doc(rideId);
    await rideRef.set({
        id: rideId,
        passengerId: pId,
        driverId: dId,
        status: 'searching',
        serviceType: config.serviceType,
        paymentMethod: config.paymentMethod === 'wallet_partial' ? 'mixed' : config.paymentMethod,
        cityKey: 'rawson',
        isTest: true,
        simulationId: simId,
        pricing: {
            estimatedTotal: estTotal,
            estimated: pricingResult,
            expressDiscountAmount: expressDiscount,
            walletCoveredAmount: walletCoveredAmount,
            pricingSnapshot: {
                municipal_percentage: 0.05,
                commission_particular: 0.13,
                commission_taxi_remis: 0.07
            }
        },
        createdAt: admin.firestore.Timestamp.now()
    });

    // --- STEP 2: ACCEPT & START ---
    await rideRef.update({
        status: 'in_progress',
        startedAt: admin.firestore.Timestamp.now(),
        driverSubtypeSnapshot: config.driverSubtype
    });

    // --- STEP 3: SETTLE (Wait for trigger or call logic) ---
    // In this simulation, we simulate the logic of onRideSettlementV6 inside a transaction
    const pBefore = (await db.collection('users').doc(pId).get()).data()?.currentBalance || 0;
    const dBefore = (await db.collection('users').doc(dId).get()).data()?.currentBalance || 0;

    await rideRef.update({
        status: 'completed',
        completedAt: admin.firestore.Timestamp.now()
    });

    // We wait 2 seconds for the cloud function to process if running locally, 
    // BUT since we want 100% control, we'll manually run a "Settlement Tool" 
    // that mimics the exact logic we just refactored.
    
    // Actually, I'll poll for the completedRide field.
    let settlement: any = null;
    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        const snap = await rideRef.get();
        settlement = snap.data()?.completedRide;
        if (settlement && snap.data()?.settledAt) break; // Also wait for settledAt
    }

    if (!settlement) throw new Error('Settlement timeout');

    const pSnap = await db.collection('users').doc(pId).get();
    const dSnap = await db.collection('users').doc(dId).get();
    
    const pAfter = pSnap.data()?.currentBalance || 0;
    const dAfter = dSnap.data()?.currentBalance || 0;
    const dProfile = dSnap.data();
    const dDaily = dProfile?.dailyStats || {};
    const dMissions = dDaily.missionsCompleted || [];

    const diff = settlement.totalFare - estTotal;

    return {
        rideId,
        driverSubtype: config.driverSubtype,
        paymentMethod: config.paymentMethod,
        estTotal: estTotal,
        finalTotal: settlement.totalFare,
        walletUsed: settlement.walletCoveredAmount,
        cashColl: settlement.cashToCollect,
        vamoComm: settlement.commissionAmount,
        muniComm: settlement.municipalFee,
        netEarn: settlement.driverNetAmount,
        pBefore,
        pAfter,
        dBefore,
        dAfter,
        dDailyEarnings: dDaily.earningsDaily,
        dDailyRides: dDaily.ridesCount,
        dMissions: dMissions.length,
        diff,
        status: diff === 0 ? 'OK' : 'ERROR'
    };
}

runFinancialSimulation().catch(console.error);
