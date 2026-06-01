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
    const rideId = 'test_r2_1778451645059';
    console.log(`=== AUDITING TARGET RIDE: ${rideId} ===`);
    const rideSnap = await db.collection('rides').doc(rideId).get();
    if (!rideSnap.exists) {
        console.error(`Ride document ${rideId} does not exist!`);
        process.exit(1);
    }
    
    const ride = rideSnap.data() || {};
    console.log(`- status: ${ride.status}`);
    console.log(`- passengerId: ${ride.passengerId}`);
    console.log(`- cityKey: ${ride.cityKey}`);
    console.log(`- createdAt: ${ride.createdAt}`);
    console.log(`- activatedAt: ${ride.activatedAt}`);
    console.log(`- matchingAttempts: ${ride.matchingAttempts}`);
    console.log(`- stationDispatch: ${ride.stationDispatch}`);
    console.log(`- notifiedDrivers: ${JSON.stringify(ride.notifiedDrivers || [])}`);
    
    // Check passenger activeRideId
    if (ride.passengerId) {
        const passSnap = await db.collection('users').doc(ride.passengerId).get();
        if (passSnap.exists) {
            console.log(`- passenger activeRideId in users/: ${passSnap.data()?.activeRideId || 'none'}`);
        } else {
            console.log(`- passenger document in users/ does not exist!`);
        }
    } else {
        console.log(`- passengerId: not specified`);
    }

    // Check rideOffers related
    console.log(`- checking related rideOffers...`);
    const offersSnap = await db.collection('rideOffers').where('rideId', '==', rideId).get();
    if (offersSnap.empty) {
        console.log(`- rideOffers: none`);
    } else {
        console.log(`- rideOffers: found ${offersSnap.size} offers:`);
        offersSnap.forEach(doc => {
            const data = doc.data();
            console.log(`  * OfferId: ${doc.id}, driverId: ${data.driverId}, status: ${data.status}`);
        });
    }

    process.exit(0);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
