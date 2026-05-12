
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function getCesarDetails() {
    const ridesSnap = await db.collection('rides')
        .where('driverName', '==', 'cesar bres')
        .limit(1)
        .get();

    if (ridesSnap.empty) return;
    const ride = ridesSnap.docs[0].data();
    console.log(`Driver UID: ${ride.driverId}`);
    console.log(`Passenger UID: ${ride.passengerId}`);
    
    const driverSnap = await db.doc(`users/${ride.driverId}`).get();
    console.log(`Driver Data: ${JSON.stringify(driverSnap.data()?.dailyStats)}`);
    console.log(`Driver Approved: ${driverSnap.data()?.approved}`);
    console.log(`Driver Municipal Status: ${driverSnap.data()?.municipalStatus}`);
}

getCesarDetails().catch(console.error);
