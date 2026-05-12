
import * as admin from 'firebase-admin';

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
        .limit(5)
        .get();

    if (ridesSnap.empty) {
        console.log("No completed rides found.");
        return;
    }

    for (const doc of ridesSnap.docs) {
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
    }

    console.log("\n--- AUDITING MUNICIPAL ACCOUNTS ---");
    const accountsSnap = await db.collection('municipal_accounts').get();
    accountsSnap.forEach(doc => {
        console.log(`Account ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
    });

    console.log("\n--- AUDITING CITY STATS (RAWSON) ---");
    const rawsonSnap = await db.collection('cities').doc('rawson').get();
    if (rawsonSnap.exists) {
        console.log("rawson document exists.");
        console.log(JSON.stringify(rawsonSnap.data()?.stats, null, 2));
    } else {
        console.log("rawson document NOT found.");
    }

    const RawsonSnap = await db.collection('cities').doc('Rawson').get();
    if (RawsonSnap.exists) {
        console.log("Rawson (capitalized) document exists.");
        console.log(JSON.stringify(RawsonSnap.data()?.stats, null, 2));
    }
}

audit().catch(console.error);
