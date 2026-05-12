
const admin = require('firebase-admin');

// Ensure firebase-admin is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "studio-6697160840-7c67f"
    });
}
const db = admin.firestore();

async function checkLastRideProgress() {
    console.log("Checking last completed rides...");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'completed')
        .orderBy('settledAt', 'desc')
        .limit(3)
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

        const userSnap = await db.collection('users').doc(passengerId).get();
        const user = userSnap.data();

        console.log(`Passenger Progress:`, JSON.stringify(user?.passengerProgress, null, 2));
    }
}

checkLastRideProgress().catch(console.error);
