import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
    const rides = await db.collection('rides').where('sharedGroupId', '==', 'xz0OmE0a5xi2nzle0lbT').get();
    if(rides.empty) {
        console.log('No ride created');
        return;
    }
    const ride = rides.docs[0];
    console.log('Ride status:', ride.data().status);
    console.log('Ride has orderedStops:', !!ride.data().orderedStops);

    const offers = await db.collection('rideOffers').where('rideId', '==', ride.id).get();
    console.log('Offers count:', offers.size);

    if (!offers.empty) {
        const o = offers.docs[0].data();
        console.log('Offer status:', o.status);
        console.log('Offer driver:', o.driverId);
        console.log('Offer has orderedStopsPreview:', !!o.orderedStopsPreview);
        console.log('Offer sharedPassengerCount:', o.sharedPassengerCount);
    }
}

run().catch(console.error);
