
import * as admin from 'firebase-admin';

// Initialize with ADC (Application Default Credentials)
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

async function checkRecentRides() {
    console.log("Checking last 10 completed rides...");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'completed')
        .orderBy('settledAt', 'desc')
        .limit(10)
        .get();

    if (ridesSnap.empty) {
        console.log("No completed rides found.");
        return;
    }

    for (const doc of ridesSnap.docs) {
        const ride = doc.data();
        const rideId = doc.id;
        const passengerId = ride.passengerId;

        console.log(`--- Ride: ${rideId} ---`);
        console.log(`Passenger: ${passengerId}`);
        console.log(`Settled at: ${ride.settledAt?.toDate()}`);
        console.log(`Service Type: ${ride.serviceType}`);

        const userSnap = await db.collection('users').doc(passengerId).get();
        const user = userSnap.data();

        console.log(`Progress:`, JSON.stringify(user?.passengerProgress, null, 2));
    }
}

checkRecentRides().catch(console.error);
