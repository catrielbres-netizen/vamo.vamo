
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

async function checkDriverStats() {
    console.log("Checking last 5 completed rides for driver stats...");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'completed')
        .orderBy('settledAt', 'desc')
        .limit(5)
        .get();

    if (ridesSnap.empty) {
        console.log("No completed rides found.");
        return;
    }

    for (const doc of ridesSnap.docs) {
        const ride = doc.data();
        const driverId = ride.driverId;

        console.log(`--- Ride: ${doc.id} ---`);
        console.log(`Driver: ${driverId}`);
        
        const driverSnap = await db.collection('users').doc(driverId).get();
        const driver = driverSnap.data();

        console.log(`Approved: ${driver.approved}`);
        console.log(`Municipal Status: ${driver.municipalStatus}`);
        console.log(`Daily Stats:`, JSON.stringify(driver.dailyStats, null, 2));
    }
}

checkDriverStats().catch(console.error);
