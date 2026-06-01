import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccountPath = join(process.cwd(), 'firebase-adminsdk.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function runAudit() {
    console.log(`=== FINDING ALL SEARCHING RIDES ===`);
    const snap = await db.collection('rides').where('status', '==', 'searching').get();
    console.log(`Total searching rides: ${snap.size}`);
    snap.forEach(doc => {
        const data = doc.data();
        console.log(`- Ride ID: ${doc.id}`);
        console.log(`  - createdAt: ${data.createdAt?.toDate?.()?.toISOString()}`);
        console.log(`  - cityKey: ${data.cityKey}`);
        console.log(`  - passengerId: ${data.passengerId}`);
        console.log(`  - stationDispatch: ${data.stationDispatch}`);
        console.log(`  - stationDispatchStatus: ${data.stationDispatchStatus}`);
    });
    process.exit(0);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
