import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = admin.firestore();

async function runCaseA() {
    console.log("\n--- 🚀 CASE A: 2 PASSENGERS SHARED RIDE SIMULATION ---");
    
    // 1. Identify/Create Tester Users
    const driverId = "tester_driver_v4";
    const paxAId = "tester_pax_a_v4";
    const paxBId = "tester_pax_b_v4";

    await db.collection('users').doc(driverId).set({ 
        fullName: "Conductor Alpha", 
        email: "driver@alpha.com",
        sharedRideAlphaTester: true,
        driverStatus: 'active',
        driverSubtype: 'express',
        currentBalance: 0
    }, { merge: true });

    await db.collection('users').doc(paxAId).set({ 
        fullName: "Pasajero A", 
        email: "paxa@alpha.com",
        sharedRideAlphaTester: true
    }, { merge: true });

    await db.collection('users').doc(paxBId).set({ 
        fullName: "Pasajero B", 
        email: "paxb@alpha.com",
        sharedRideAlphaTester: true
    }, { merge: true });

    console.log("✅ Tester users configured.");

    // 2. Setup Pricing Config (Force Rawson defaults)
    await db.collection('cities').doc('rawson').set({
        pricing: {
            commission_particular: 0.18,
            commission_taxi_remis: 0.12,
            municipal_percentage: 0.05
        }
    }, { merge: true });

    // 3. Create Shared Ride Requests
    const requestIdA = `req_a_${Date.now()}`;
    const requestIdB = `req_b_${Date.now()}`;
    const groupId = `group_${Date.now()}`;

    const requestA = {
        id: requestIdA,
        passengerId: paxAId,
        passengerName: "Pasajero A",
        cityKey: "rawson",
        origin: { address: "Calle A 100", lat: -43.3, lng: -65.1 },
        destination: { address: "Calle B 200", lat: -43.31, lng: -65.11 },
        status: 'confirmed',
        paymentMethod: 'cash',
        individualFareReference: 10000,
        sharedFareEstimate: 7000,
        passengerSavingAmount: 3000,
        passengerSavingPercent: 30,
        groupId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const requestB = {
        id: requestIdB,
        passengerId: paxBId,
        passengerName: "Pasajero B",
        cityKey: "rawson",
        origin: { address: "Calle C 300", lat: -43.305, lng: -65.105 },
        destination: { address: "Calle D 400", lat: -43.315, lng: -65.115 },
        status: 'confirmed',
        paymentMethod: 'cash',
        individualFareReference: 10000,
        sharedFareEstimate: 7000,
        passengerSavingAmount: 3000,
        passengerSavingPercent: 30,
        groupId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('shared_ride_requests').doc(requestIdA).set(requestA);
    await db.collection('shared_ride_requests').doc(requestIdB).set(requestB);

    // 4. Create Group
    const group = {
        id: groupId,
        cityKey: "rawson",
        status: 'ready_for_driver',
        requestIds: [requestIdA, requestIdB],
        passengerIds: [paxAId, paxBId],
        occupiedSeats: 2,
        maxSeats: 4,
        paymentMethod: 'cash',
        sharedFarePerPassenger: 7000,
        estimatedSharedTotal: 14000,
        estimatedDriverTotal: 14000,
        driverBenefitAmount: 1680, 
        driverBenefitPercent: 12,
        orderedStops: [
            { type: 'pickup', requestId: requestIdA, location: requestA.origin },
            { type: 'pickup', requestId: requestIdB, location: requestB.origin },
            { type: 'dropoff', requestId: requestIdA, location: requestA.destination },
            { type: 'dropoff', requestId: requestIdB, location: requestB.destination }
        ],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('shared_ride_groups').doc(groupId).set(group);
    console.log(`✅ Group ${groupId} ready.`);

    // 5. Create Ride
    const rideId = `ride_shared_${groupId}`;
    const ride = {
        id: rideId,
        rideType: 'shared',
        isSharedRide: true,
        sharedGroupId: groupId,
        driverId: driverId,
        driverName: "Conductor Alpha",
        status: 'accepted',
        cityKey: "rawson",
        sharedRequestIds: [requestIdA, requestIdB],
        orderedStops: group.orderedStops.map(s => ({ ...s, status: 'pending' })),
        totalFare: 14000,
        driverSubtypeSnapshot: 'express',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('rides').doc(rideId).set(ride);
    console.log(`✅ Ride ${rideId} created.`);

    // Enforce groupId (prevent interference)
    await db.collection('shared_ride_requests').doc(requestIdA).update({ groupId });
    await db.collection('shared_ride_requests').doc(requestIdB).update({ groupId });

    // 6. Complete Ride
    console.log("📍 Completing ride operational sequence...");
    await db.collection('shared_ride_requests').doc(requestIdA).update({ status: 'dropped_off', finalFareCash: 7000 });
    await db.collection('shared_ride_requests').doc(requestIdB).update({ status: 'dropped_off', finalFareCash: 7000 });
    await db.collection('rides').doc(rideId).update({ 
        status: 'completed', 
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        "orderedStops.0.status": "completed",
        "orderedStops.1.status": "completed",
        "orderedStops.2.status": "completed",
        "orderedStops.3.status": "completed"
    });

    console.log("✅ Ride COMPLETED.");
    console.log("⏳ Waiting for settlement trigger (10s)...");
    
    // In a real environment, the trigger will handle settlement.
    // For this simulation, we'll wait and then verify the results.
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 7. Verify Results
    const rideSnap = await db.collection('rides').doc(rideId).get();
    const finalRide = rideSnap.data() as any;

    console.log("\n--- 📊 FINAL AUDIT ---");
    console.log(`Status: ${finalRide.status}`);
    console.log(`Shared Settlement Status: ${finalRide.sharedSettlementStatus}`);
    
    if (finalRide.sharedSettlementStatus === 'settled') {
        console.log("✅ SETTLEMENT SUCCESSFUL!");
        console.log(`Gross Cash: ${finalRide.sharedFinancialSummary.grossSharedCash}`);
        console.log(`VamO Net: ${finalRide.sharedFinancialSummary.vamoNetAmount}`);
        console.log(`Muni Amount: ${finalRide.sharedFinancialSummary.municipalAmount}`);
        console.log(`Receipts Generated: ${finalRide.sharedReceiptsGenerated}`);
        
        // Verify Wallet
        const walletSnap = await db.collection('wallets').doc(driverId).get();
        const wallet = walletSnap.data() as any;
        console.log(`Driver Final Balance: ${wallet?.currentBalance}`);
    } else {
        console.log("⚠️ Settlement still pending or failed. Check Firebase Logs.");
    }
}

runCaseA().catch(console.error);
