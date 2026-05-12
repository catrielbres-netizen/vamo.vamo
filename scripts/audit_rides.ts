import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function auditRides() {
    console.log('--- AUDITING RECENT RIDES ---');
    
    const ridesSnap = await db.collection('rides')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

    if (ridesSnap.empty) {
        console.log('No rides found.');
        return;
    }

    for (const doc of ridesSnap.docs) {
        const ride = doc.data();
        console.log(`\nRide ID: ${doc.id}`);
        console.log(`Status: ${ride.status}`);
        console.log(`Passenger: ${ride.passengerName} (${ride.passengerId})`);
        console.log(`Driver: ${ride.driverName} (${ride.driverId})`);
        console.log(`Created At: ${ride.createdAt?.toDate().toISOString()}`);
        console.log(`Settled At: ${ride.settledAt ? ride.settledAt.toDate().toISOString() : 'MISSING ❌'}`);
        
        if (ride.status === 'completed' && !ride.settledAt) {
            console.warn('⚠️ WARNING: Ride is completed but NOT settled. This is why rewards were not counted.');
        }

        if (ride.driverId) {
            const driverSnap = await db.doc(`users/${ride.driverId}`).get();
            const driver = driverSnap.data();
            console.log(`Driver Stats: ${JSON.stringify(driver?.dailyStats)}`);
        }

        if (ride.passengerId) {
            const passengerSnap = await db.doc(`users/${ride.passengerId}`).get();
            const passenger = passengerSnap.data();
            console.log(`Passenger Vamo Points: ${passenger?.vamoPoints}`);
        }
    }
}

auditRides().catch(console.error);
