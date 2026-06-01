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
    const rideId = 'MiWLZPBJSo03yRXGzgjm';
    console.log(`=== AUDITING RIDE: ${rideId} ===`);
    const rideSnap = await db.collection('rides').doc(rideId).get();
    if (!rideSnap.exists) {
        console.error(`Ride document ${rideId} does not exist!`);
        process.exit(1);
    }
    
    const ride = rideSnap.data() || {};
    console.log(`rideId: ${rideId}`);
    console.log(`ALL RIDE FIELDS:`);
    for (const [key, value] of Object.entries(ride)) {
        console.log(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
    process.exit(0);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
