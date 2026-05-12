
const admin = require('firebase-admin');

// Initialize admin if not already
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function audit() {
    console.log("--- AUDITING RECENT COMPLETED RIDES ---");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'completed')
        .orderBy('settledAt', 'desc')
        .limit(10)
        .get();

    if (ridesSnap.empty) {
        console.log("No completed rides found.");
    } else {
        ridesSnap.docs.forEach(doc => {
            const ride = doc.data();
            const comp = ride.completedRide || {};
            console.log(`Ride ID: ${doc.id}`);
            console.log(`- City: ${ride.city} | CityKey: ${ride.cityKey}`);
            console.log(`- Driver ID: ${ride.driverId}`);
            console.log(`- Driver Subtype (Snap): ${ride.driverSubtypeSnapshot || 'N/A'}`);
            console.log(`- Total Fare: ${comp.totalFare}`);
            console.log(`- Municipal Fee: ${comp.municipalFee}`);
            console.log(`- Settled At: ${ride.settledAt?.toDate().toLocaleString()}`);
            console.log("-----------------------------------");
        });
    }

    console.log("\n--- AUDITING MUNICIPAL ACCOUNTS ---");
    const accountsSnap = await db.collection('municipal_accounts').get();
    accountsSnap.forEach(doc => {
        console.log(`Account ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
    });

    console.log("\n--- AUDITING CITY STATS ---");
    const citiesSnap = await db.collection('cities').get();
    citiesSnap.forEach(doc => {
        console.log(`City ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data()?.stats, null, 2));
    });
}

audit().catch(err => {
    console.error(err);
    process.exit(1);
});
