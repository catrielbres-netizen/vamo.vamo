const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// require the function after initializing the app
const { findNextDriverAndCreateOffer } = require('../functions/lib/rides.js');

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
