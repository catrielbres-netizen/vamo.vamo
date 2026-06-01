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
    console.log(`=== AUDITING NEW RIDE RUN: ${rideId} ===`);
    const rideSnap = await db.collection('rides').doc(rideId).get();
    if (!rideSnap.exists) {
        console.error(`Ride document ${rideId} does not exist!`);
        process.exit(1);
    }
    
    const ride = rideSnap.data() || {};
    console.log(`Ride details:`);
    console.log(`- rideId: ${rideId}`);
    console.log(`- status: ${ride.status}`);
    console.log(`- cityKey: ${ride.cityKey}`);
    console.log(`- serviceType: ${ride.serviceType}`);
    console.log(`- paymentMethod: ${ride.paymentMethod}`);
    console.log(`- passengerId: ${ride.passengerId}`);
    console.log(`- matchingAttempts: ${ride.matchingAttempts}`);
    console.log(`- notifiedDrivers: ${JSON.stringify(ride.notifiedDrivers || [])}`);
    console.log(`- lastMatchingFailureReason: ${ride.lastMatchingFailureReason || 'none'}`);
    console.log(`- stationDispatch: ${ride.stationDispatch}`);
    console.log(`- stationDispatchStatus: ${ride.stationDispatchStatus}`);
    
    // Check passenger activeRideId
    if (ride.passengerId) {
        const passSnap = await db.collection('users').doc(ride.passengerId).get();
        if (passSnap.exists) {
            console.log(`- Passenger activeRideId in users/: ${passSnap.data()?.activeRideId || 'none'}`);
        }
    }

    // Check rideOffers related
    console.log(`\n=== CHECKING RELATED RIDE OFFERS ===`);
    const offersSnap = await db.collection('rideOffers').where('rideId', '==', rideId).get();
    if (offersSnap.empty) {
        console.log(`No rideOffers found for ride ${rideId}`);
    } else {
        console.log(`Found ${offersSnap.size} rideOffers:`);
        offersSnap.forEach(doc => {
            const offer = doc.data();
            console.log(`- Offer ID: ${doc.id}`);
            console.log(`  - driverId: ${offer.driverId}`);
            console.log(`  - status: ${offer.status}`);
            console.log(`  - createdAt: ${offer.createdAt?.toDate?.()?.toISOString()}`);
            console.log(`  - expiresAt: ${offer.expiresAt?.toDate?.()?.toISOString()}`);
            console.log(`  - respondedAt: ${offer.respondedAt?.toDate?.()?.toISOString() || 'none'}`);
            console.log(`  - rejectReason: ${offer.rejectReason || 'none'}`);
            console.log(`  - taskName: ${offer.taskName || 'none'}`);
        });
    }

    process.exit(0);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
