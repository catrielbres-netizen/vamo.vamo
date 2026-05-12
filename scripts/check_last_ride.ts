
import * as admin from 'firebase-admin';

async function checkLastRideProgress() {
    if (!admin.apps.length) {
        admin.initializeApp();
    }
    const db = admin.firestore();
    
    console.log("Checking last completed rides...");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'completed')
        .orderBy('settledAt', 'desc')
        .limit(1)
        .get();

    if (ridesSnap.empty) {
        console.log("No completed rides found.");
        return;
    }

    const ride = ridesSnap.docs[0].data();
    const rideId = ridesSnap.docs[0].id;
    const passengerId = ride.passengerId;

    console.log(`Last completed ride: ${rideId} for passenger ${passengerId}`);
    console.log(`Settled at: ${ride.settledAt?.toDate()}`);

    const userSnap = await db.collection('users').doc(passengerId).get();
    const user = userSnap.data();

    console.log(`Passenger Progress:`, JSON.stringify(user?.passengerProgress, null, 2));
    console.log(`Benefit Active: ${user?.passengerExpressBenefitActive}`);
}

checkLastRideProgress().catch(console.error);
