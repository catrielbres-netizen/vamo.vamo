
import admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const CITY_KEY = 'rawson';
const TEST_PREFIX = 'test_stress_';

async function stressTest() {
    console.log(`🚀 Starting SAFE Stress Test Simulation for ${CITY_KEY}...`);

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath)
        });
    } catch (e) {
        console.error("❌ Failed to initialize Admin SDK. Ensure service-account.json is in the root.");
        process.exit(1);
    }

    const db = admin.firestore();
    const startTime = Date.now();

    const createdDriverIds: string[] = [];
    const createdRideIds: string[] = [];

    try {
        // 1. Simulate 50 Drivers Online (Isolated)
        console.log("🚙 Simulating 50 drivers online...");
        const driverPromises = [];
        for (let i = 1; i <= 50; i++) {
            const uid = `${TEST_PREFIX}driver_${i}`;
            createdDriverIds.push(uid);
            driverPromises.push(db.collection('drivers_locations').doc(uid).set({
                uid,
                cityKey: CITY_KEY,
                driverStatus: 'online',
                lat: -43.3 + (Math.random() * 0.01),
                lng: -65.1 + (Math.random() * 0.01),
                geohash: 'f0q...', // Simplified
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                isTestDriver: true, // IMPORTANT: Isolation Guard
                isSimulation: true
            }));
        }
        await Promise.all(driverPromises);
        console.log("✅ 50 drivers online (Isolated).");

        // 2. Simulate 20 Simultaneous Ride Requests (Isolated)
        console.log("📱 Simulating 20 simultaneous ride requests...");
        const ridePromises = [];
        for (let i = 1; i <= 20; i++) {
            const rideId = `${TEST_PREFIX}ride_${Date.now()}_${i}`;
            createdRideIds.push(rideId);
            ridePromises.push(db.collection('rides').doc(rideId).set({
                rideId,
                passengerId: `${TEST_PREFIX}passenger_${i}`,
                passengerName: `Stress Test User ${i}`,
                cityKey: CITY_KEY,
                status: 'searching',
                origin: {
                    lat: -43.3001,
                    lng: -65.1001,
                    address: 'Rawson Center'
                },
                destination: {
                    lat: -43.3101,
                    lng: -65.1101,
                    address: 'Rawson Port'
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                isSimulation: true, // IMPORTANT: Isolation Guard
                isTestRide: true
            }));
        }
        await Promise.all(ridePromises);
        console.log("✅ 20 ride requests created (Isolated).");

        // 3. Wait for triggers to process
        console.log("⏳ Processing triggers... (Wait 15s)");
        await new Promise(r => setTimeout(r, 15000));

        // 4. Generate Report
        console.log("\n📊 --- SIMULATION REPORT ---");
        
        const perfSnap = await db.collection('system_performance_logs')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startTime))
            .get();
        
        const alertsSnap = await db.collection('system_alerts')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startTime))
            .get();
        
        const rideOffersSnap = await db.collection('rideOffers')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startTime))
            .get();

        console.log(`- High Latency Events: ${perfSnap.size}`);
        console.log(`- System Alerts Generated: ${alertsSnap.size}`);
        console.log(`- Ride Offers Generated: ${rideOffersSnap.size}`);
        
        if (perfSnap.size > 0) {
            console.log("⚠️ PERFORMANCE WARNING: High latency detected during simulation.");
            perfSnap.forEach(d => console.log(`  > ${d.data().name}: ${d.data().durationMs}ms`));
        }

        // 5. Cleanup
        console.log("\n🧹 Cleaning up simulation data...");
        const cleanupPromises = [
            ...createdDriverIds.map(id => db.collection('drivers_locations').doc(id).delete()),
            ...createdRideIds.map(id => db.collection('rides').doc(id).delete()),
            ...perfSnap.docs.map(d => d.ref.delete()),
            ...alertsSnap.docs.map(d => d.ref.delete()),
            ...rideOffersSnap.docs.map(d => d.ref.delete())
        ];
        await Promise.all(cleanupPromises);
        console.log("✅ Cleanup completed.");

        console.log("\n🎉 SAFE STRESS TEST FINISHED SUCCESSFULLY.");
        process.exit(0);

    } catch (error: any) {
        console.error("❌ CRITICAL ERROR during simulation:", error.message);
        process.exit(1);
    }
}

stressTest();
