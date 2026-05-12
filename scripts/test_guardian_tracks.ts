import admin from 'firebase-admin';


if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function runSimulation() {
    console.log("--- STARTING PHASE 2C: GUARDIAN OF TRACKS SIMULATION ---");

    const { analyzeRidePath } = await import('../functions/src/lib/guardianTracks.ts');

    const passengerId = "test_passenger_phase2b";
    const driverId = "test_driver_phase2b";
    const cityKey = "trelew";

    // CASE A: NORMAL RIDE
    console.log("\n[CASE A] Normal Ride Simulation...");
    const rideIdA = `ride_normal_${Date.now()}`;
    const rideA: any = {
        passengerId,
        driverId,
        cityKey,
        status: 'completed',
        origin: { lat: -43.2533, lng: -65.3094 },
        destination: { lat: -43.2600, lng: -65.3150 },
        pricing: { estimatedDistanceMeters: 1000 }
    };
    
    // Add points
    const pointsA = [
        { lat: -43.2533, lng: -65.3094, timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 60000) },
        { lat: -43.2550, lng: -65.3110, timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 30000) },
        { lat: -43.2600, lng: -65.3150, timestamp: admin.firestore.Timestamp.fromMillis(Date.now()) }
    ];
    for (let i = 0; i < pointsA.length; i++) {
        await db.collection('ride_tracking').doc(rideIdA).collection('points').doc(`p${i}`).set(pointsA[i]);
    }
    
    const resultA = await analyzeRidePath(rideIdA, rideA);
    console.log("Result A:", JSON.stringify(resultA, null, 2));


    // CASE B: MISSING GPS
    console.log("\n[CASE B] Missing GPS Simulation...");
    const rideIdB = `ride_no_gps_${Date.now()}`;
    const rideB: any = { ...rideA, pricing: { estimatedDistanceMeters: 500 } };
    const resultB = await analyzeRidePath(rideIdB, rideB);
    console.log("Result B:", JSON.stringify(resultB, null, 2));


    // CASE C: IMPOSSIBLE SPEED
    console.log("\n[CASE C] Impossible Speed Simulation...");
    const rideIdC = `ride_speed_${Date.now()}`;
    const pointsC = [
        { lat: -43.2533, lng: -65.3094, timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 10000) },
        { lat: -44.0000, lng: -66.0000, timestamp: admin.firestore.Timestamp.fromMillis(Date.now()) } // Huge jump in 10s
    ];
    for (let i = 0; i < pointsC.length; i++) {
        await db.collection('ride_tracking').doc(rideIdC).collection('points').doc(`p${i}`).set(pointsC[i]);
    }
    const resultC = await analyzeRidePath(rideIdC, rideA);
    console.log("Result C:", JSON.stringify(resultC, null, 2));


    // CASE D: GHOST RIDE (Distance < 50m)
    console.log("\n[CASE D] Ghost Ride Simulation...");
    const rideIdD = `ride_ghost_${Date.now()}`;
    const pointsD = [
        { lat: -43.2533, lng: -65.3094, timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 10000) },
        { lat: -43.2533, lng: -65.3095, timestamp: admin.firestore.Timestamp.fromMillis(Date.now()) }
    ];
    for (let i = 0; i < pointsD.length; i++) {
        await db.collection('ride_tracking').doc(rideIdD).collection('points').doc(`p${i}`).set(pointsD[i]);
    }
    const resultD = await analyzeRidePath(rideIdD, rideA);
    console.log("Result D:", JSON.stringify(resultD, null, 2));

    console.log("\n--- SIMULATION COMPLETE ---");
    console.log("Check 'fraud_alerts' collection in Firestore for generated alerts.");
}

runSimulation().catch(console.error);
