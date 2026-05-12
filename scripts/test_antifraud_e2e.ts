import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

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

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}
const db = admin.firestore();

async function testRealFraudAlert() {
    const rideId = `test_fraud_${Date.now()}`;
    console.log(`Creating fake 'real' ghost ride ${rideId}...`);
    
    const rideRef = db.collection('rides').doc(rideId);
    
    // This ride looks like a ghost ride: very short distance and time
    await rideRef.set({
        driverId: 'test_driver_rw_1',
        passengerId: 'test_pass_rw_1',
        status: 'searching',
        isSimulation: false, // MANDATORY to trigger fraud check
        cityKey: 'rawson',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        origin: { lat: -43.3, lng: -65.1 },
        destination: { lat: -43.3, lng: -65.1 }, // Same point
        pricing: { estimatedTotal: 1000 }
    });

    console.log("Simulating matching and completion...");
    await rideRef.update({
        status: 'completed',
        completedRide: {
            distanceMeters: 50, // Ultra short
            durationSeconds: 10,
            totalFare: 1000
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Wait 5 seconds for triggers...");
    await new Promise(r => setTimeout(r, 5000));

    const alertSnap = await db.collection('fraud_alerts')
        .where('rideId', '==', rideId)
        .get();

    if (!alertSnap.empty) {
        console.log("✅ SUCCESS: Fraud alert detected!");
        alertSnap.forEach(doc => console.log(`Alert: ${doc.data().reason} (Score: ${doc.data().score})`));
    } else {
        console.log("❌ FAILURE: No fraud alert found. Check Cloud Functions logs.");
    }

    const ledgerSnap = await db.collection('ledger_events')
        .where('rideId', '==', rideId)
        .get();
    
    if (!ledgerSnap.empty) {
        console.log(`✅ SUCCESS: ${ledgerSnap.size} ledger events found for this ride.`);
    } else {
        console.log("❌ FAILURE: No ledger events found.");
    }
}

testRealFraudAlert().catch(console.error);
