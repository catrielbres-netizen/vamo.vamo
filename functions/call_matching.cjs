const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(process.cwd(), '../service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// require the function after initializing the app
const { findNextDriverAndCreateOffer } = require('./lib/rides.js');

async function run() {
    console.log("Llamando a findNextDriverAndCreateOffer...");
    const db = admin.firestore();
    const rides = await db.collection('rides').where('sharedGroupId', '==', 'xz0OmE0a5xi2nzle0lbT').get();
    let rideId;
    if (rides.empty) {
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
        const rideDoc = rides.docs[0];
        rideId = rideDoc.id;
        console.log("Ride maestro encontrado:", rideId);
        
        // Fetch group to get origin/dest
        const groupSnap = await db.collection('shared_ride_groups').doc('xz0OmE0a5xi2nzle0lbT').get();
        const group = groupSnap.data();
        const origin = group.pickupStops[0].location || group.pickupStops[0];
        const destination = group.dropoffStops[0].location || group.dropoffStops[0];
        
        await db.collection('rides').doc(rideId).update({ 
            status: 'searching',
            origin,
            destination
        });
        console.log("Ride origin updated");
    }
    
    const result = await findNextDriverAndCreateOffer(rideId);
    
    console.log("Resultado de findNextDriverAndCreateOffer:", result);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
