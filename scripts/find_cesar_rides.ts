
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function findCesarRides() {
    console.log('Searching for Cesar Bres rides...');
    const ridesSnap = await db.collection('rides')
        .where('driverName', '==', 'cesar bres')
        .limit(10)
        .get();

    if (ridesSnap.empty) {
        console.log('No rides found for Cesar Bres.');
        return;
    }

    for (const doc of ridesSnap.docs) {
        const ride = doc.data();
        console.log(`\nRide ID: ${doc.id}`);
        console.log(`Status: ${ride.status}`);
        console.log(`Settled: ${!!ride.settledAt}`);
        console.log(`Created At: ${ride.createdAt?.toDate().toISOString()}`);
        console.log(`City: ${ride.cityKey}`);
    }
}

findCesarRides().catch(console.error);
