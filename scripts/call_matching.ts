import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import * as path from 'path';

// Import the function directly
import { findNextDriverAndCreateOffer } from '../functions/src/rides';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function run() {
    console.log("Llamando a findNextDriverAndCreateOffer...");
    const db = admin.firestore();
    // Assuming the "fake" master ride was created by dispatchSharedRideGroupIfReady:
    // It's usually "sim_ride_shared_..." or we can find it:
    const rides = await db.collection('rides').where('sharedGroupId', '==', 'xz0OmE0a5xi2nzle0lbT').get();
    let rideId;
    if (rides.empty) {
        // Create the fake ride just in case it doesn't exist
        const fakeRideRef = db.collection('rides').doc();
        await fakeRideRef.set({
            isSharedRide: true,
            sharedGroupId: 'xz0OmE0a5xi2nzle0lbT',
            status: 'pending',
            cityKey: 'rawson',
            orderedStopsPreview: [],
            totalEstimatedPrice: 16956
        });
        rideId = fakeRideRef.id;
        console.log("Creado ride maestro falso:", rideId);
    } else {
        rideId = rides.docs[0].id;
        console.log("Ride maestro encontrado:", rideId);
    }
    
    const result = await findNextDriverAndCreateOffer({
        db,
        rideId: rideId,
        cityKey: 'rawson'
    });
    
    console.log("Resultado de findNextDriverAndCreateOffer:", result);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
