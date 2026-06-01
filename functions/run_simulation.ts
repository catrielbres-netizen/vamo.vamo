import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('C:\\Users\\catri\\vamo.vamo\\service-account.json'),
        projectId: 'studio-6697160840-7c67f',
    });
}

async function run() {
    console.log("🧪 Starting Fase 4A Backend Guard Simulation Test");
    const db = admin.firestore();
    const { dispatchSharedRideGroupIfReady, performFullSharedRideCancellation } = await import('./src/sharedRides.ts');

    const paxA = '8rWJKMMONDbOBm5fYeNHf2bxoUb2';
    const paxB = 'qLtGStKw00fr7DuEW2A4FwigzJQ2';

    // 1. Save features/sharedRide state
    const featureRef = db.doc('features/sharedRide');
    const featureSnap = await featureRef.get();
    const originalFeatureData = featureSnap.exists ? featureSnap.data() : null;

    console.log("Configuring features/sharedRide: driverSearchEnabled = false");
    await featureRef.set({
        ...originalFeatureData,
        driverSearchEnabled: false
    });

    // 2. Clean user profiles active pointers
    console.log("Cleaning passenger profiles...");
    const batch = db.batch();
    batch.update(db.doc(`users/${paxA}`), {
        activeRideId: null,
        activeSharedRequestId: null,
        activeSharedRideGroupId: null,
        sharedRideStatus: null
    });
    batch.update(db.doc(`users/${paxB}`), {
        activeRideId: null,
        activeSharedRequestId: null,
        activeSharedRideGroupId: null,
        sharedRideStatus: null
    });
    await batch.commit();

    // 3. Create simulated requests and group
    const groupId = 'sim_group_fase4_' + Date.now();
    const reqAId = 'sim_req_A_' + Date.now();
    const reqBId = 'sim_req_B_' + Date.now();

    console.log(`Creating group ${groupId} and requests...`);
    const groupDoc = {
        id: groupId,
        cityKey: 'rawson',
        status: 'ready_for_driver',
        requestIds: [reqAId, reqBId],
        passengerIds: [paxA, paxB],
        passengers: [
            {
                passengerId: paxA,
                passengerName: "Passenger A",
                roleInGroup: 'creator',
                joinedAt: admin.firestore.Timestamp.now(),
                status: 'joined',
                pickupAddress: "Origin A",
                dropoffAddress: "Dest A"
            },
            {
                passengerId: paxB,
                passengerName: "Passenger B",
                roleInGroup: 'joined',
                joinedAt: admin.firestore.Timestamp.now(),
                status: 'joined',
                pickupAddress: "Origin B",
                dropoffAddress: "Dest B"
            }
        ],
        occupiedSeats: 2,
        maxSeats: 4,
        paymentMethod: 'cash',
        estimatedIndividualFare: 9000,
        sharedFarePerPassenger: 6120,
        estimatedSharedTotal: 12240,
        estimatedDriverTotal: 12240,
        driverBenefitAmount: 3240,
        driverBenefitPercent: 0.36,
        passengerSavingAmount: 2880,
        passengerSavingPercent: 0.32,
        pickupStops: [{ lat: -43.3, lng: -65.1, address: "Origin A" }, { lat: -43.301, lng: -65.101, address: "Origin B" }],
        dropoffStops: [{ lat: -43.33, lng: -65.03, address: "Dest A" }, { lat: -43.331, lng: -65.031, address: "Dest B" }],
        orderedStops: [
            { type: 'pickup', requestId: reqAId, location: { lat: -43.3, lng: -65.1, address: "Origin A" } },
            { type: 'pickup', requestId: reqBId, location: { lat: -43.301, lng: -65.101, address: "Origin B" } },
            { type: 'dropoff', requestId: reqAId, location: { lat: -43.33, lng: -65.03, address: "Dest A" } },
            { type: 'dropoff', requestId: reqBId, location: { lat: -43.331, lng: -65.031, address: "Dest B" } }
        ],
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 480000),
        hasMinimumPassengers: true,
        isPubliclyJoinable: false,
        creatorPassengerId: paxA,
        createdByPassengerId: paxA,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const reqA = {
        id: reqAId,
        passengerId: paxA,
        passengerName: "Passenger A",
        cityKey: 'rawson',
        origin: { lat: -43.3, lng: -65.1, address: "Origin A" },
        destination: { lat: -43.33, lng: -65.03, address: "Dest A" },
        status: 'pending_confirmation',
        groupId: groupId,
        roleInGroup: 'creator',
        individualFareReference: 9000,
        sharedFareEstimate: 6120,
        paymentMethod: 'cash',
        sharedRideNoticeAccepted: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const reqB = {
        id: reqBId,
        passengerId: paxB,
        passengerName: "Passenger B",
        cityKey: 'rawson',
        origin: { lat: -43.301, lng: -65.101, address: "Origin B" },
        destination: { lat: -43.331, lng: -65.031, address: "Dest B" },
        status: 'pending_confirmation',
        groupId: groupId,
        roleInGroup: 'joined',
        individualFareReference: 9000,
        sharedFareEstimate: 6120,
        paymentMethod: 'cash',
        sharedRideNoticeAccepted: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await Promise.all([
        db.doc(`shared_ride_groups/${groupId}`).set(groupDoc),
        db.doc(`shared_ride_requests/${reqAId}`).set(reqA),
        db.doc(`shared_ride_requests/${reqBId}`).set(reqB)
    ]);

    // 4. Force dispatch (normally called on ready_for_driver status)
    console.log("Invoking dispatchSharedRideGroupIfReady locally...");
    await dispatchSharedRideGroupIfReady(groupId, 'test_simulation');

    // 5. Verify database states
    console.log("Verifying states post-dispatch...");
    const [groupSnapPost, rideSnapPost, userASnapPost, userBSnapPost] = await Promise.all([
        db.doc(`shared_ride_groups/${groupId}`).get(),
        db.doc(`rides/shared_${groupId}`).get(),
        db.doc(`users/${paxA}`).get(),
        db.doc(`users/${paxB}`).get()
    ]);

    const groupDataPost = groupSnapPost.data();
    const userADataPost = userASnapPost.data();
    const userBDataPost = userBSnapPost.data();

    console.log("=== VERIFICATION RESULTS ===");
    console.log(`- rides/shared_${groupId} exists? ${rideSnapPost.exists} (Expected: false)`);
    console.log(`- group.driverSearchBlockedForBeta: ${groupDataPost?.driverSearchBlockedForBeta} (Expected: true)`);
    console.log(`- group.driverSearchBlockedReason: ${groupDataPost?.driverSearchBlockedReason} (Expected: "shared_beta_driver_search_disabled")`);
    console.log(`- userA.activeRideId: ${userADataPost?.activeRideId} (Expected: null/undefined)`);
    console.log(`- userB.activeRideId: ${userBDataPost?.activeRideId} (Expected: null/undefined)`);

    let offersCount = 0;
    const offersSnap = await db.collection('rideOffers').where('rideId', '==', `shared_${groupId}`).get();
    offersCount = offersSnap.size;
    console.log(`- rideOffers for shared_${groupId}: ${offersCount} (Expected: 0)`);

    // 6. Test cancellation
    console.log("\nTesting performFullSharedRideCancellation transaccional...");
    let cancelError = null;
    try {
        await db.runTransaction(async (tx) => {
            await performFullSharedRideCancellation(db, tx, `shared_${groupId}`, groupId, paxA, 'test_cancellation');
        });
        console.log("✅ Transaction completed successfully without throwing errors!");
    } catch (e: any) {
        cancelError = e;
        console.error("❌ Transaction failed:", e);
    }

    // 7. Verify cancellation states
    const [groupSnapCancel, reqASnapCancel, reqBSnapCancel, userASnapCancel, userBSnapCancel] = await Promise.all([
        db.doc(`shared_ride_groups/${groupId}`).get(),
        db.doc(`shared_ride_requests/${reqAId}`).get(),
        db.doc(`shared_ride_requests/${reqBId}`).get(),
        db.doc(`users/${paxA}`).get(),
        db.doc(`users/${paxB}`).get()
    ]);

    const groupDataCancel = groupSnapCancel.data();
    const reqADataCancel = reqASnapCancel.data();
    const reqBDataCancel = reqBSnapCancel.data();
    const userADataCancel = userASnapCancel.data();
    const userBDataCancel = userBSnapCancel.data();

    console.log("\n=== CANCELLATION RESULTS ===");
    console.log(`- group status: ${groupDataCancel?.status} (Expected: cancelled_by_passengers)`);
    console.log(`- request A status: ${reqADataCancel?.status} (Expected: cancelled)`);
    console.log(`- request B status: ${reqBDataCancel?.status} (Expected: cancelled)`);
    console.log(`- userA activeSharedRequestId: ${userADataCancel?.activeSharedRequestId || 'null'} (Expected: null/undefined)`);
    console.log(`- userB activeSharedRequestId: ${userBDataCancel?.activeSharedRequestId || 'null'} (Expected: null/undefined)`);

    // 8. Clean up documents created during test
    console.log("\nCleaning up simulation docs from DB...");
    await Promise.all([
        db.doc(`shared_ride_groups/${groupId}`).delete(),
        db.doc(`shared_ride_requests/${reqAId}`).delete(),
        db.doc(`shared_ride_requests/${reqBId}`).delete()
    ]);

    // 9. Restore features/sharedRide config
    console.log("Restoring features/sharedRide config to original state...");
    if (originalFeatureData) {
        await featureRef.set(originalFeatureData);
    } else {
        await featureRef.delete();
    }

    console.log("Done!");
}

run().catch(console.error);
