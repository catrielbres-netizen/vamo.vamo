
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function checkRidesByCity() {
    const rawsonSnap = await db.collection('rides').where('cityKey', '==', 'rawson').limit(5).get();
    const trelewSnap = await db.collection('rides').where('cityKey', '==', 'trelew').limit(5).get();
    
    console.log(`Rawson rides: ${rawsonSnap.size}`);
    console.log(`Trelew rides: ${trelewSnap.size}`);

    if (rawsonSnap.size > 0) {
        const r = rawsonSnap.docs[0].data();
        console.log(`Example Rawson Ride Total: ${r.pricing?.final?.total || r.pricing?.estimated?.total}`);
    }
}

checkRidesByCity().catch(console.error);
