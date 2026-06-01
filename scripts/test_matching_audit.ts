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

async function main() {
    console.log("=== STEP 1: AUDIT OF OPERATIVE DRIVER ===");
    const driverId = '1BIk2VyuwEZLmHRVbXE52rhFYen2';
    
    const locSnap = await db.collection('drivers_locations').doc(driverId).get();
    const userSnap = await db.collection('users').doc(driverId).get();
    const walletSnap = await db.collection('wallets').doc(driverId).get();

    if (!locSnap.exists || !userSnap.exists) {
        console.error("Driver doc or location doc does not exist!");
        process.exit(1);
    }

    const loc = locSnap.data() || {};
    const user = userSnap.data() || {};
    const wallet = walletSnap.data() || {};

    const lastLocationSeconds = loc.lastSeenAt?._seconds || loc.lastUpdateAt?._seconds || 0;
    const lastLocationMs = lastLocationSeconds * 1000;
    const diffMinutes = lastLocationMs > 0 ? ((Date.now() - lastLocationMs) / 60000).toFixed(1) : 'unknown';
    
    const balance = wallet.cashBalance ?? user.currentBalance ?? 0;

    console.log(`Driver ID: ${driverId}`);
    console.log(`- Name: ${user.name} ${user.surname || ''}`);
    console.log(`- driverStatus (location): ${loc.driverStatus}`);
    console.log(`- isOnline: ${loc.isOnline ?? (loc.driverStatus === 'online')}`);
    console.log(`- approved (user): ${user.approved}`);
    console.log(`- approved (location): ${loc.approved}`);
    console.log(`- isSuspended (user): ${user.isSuspended}`);
    console.log(`- activeRideId (user): ${user.activeRideId || 'none'}`);
    console.log(`- activeRideId (location): ${loc.activeRideId || 'none'}`);
    console.log(`- cityKey (location): ${loc.cityKey}`);
    console.log(`- cityKey (user): ${user.cityKey}`);
    console.log(`- driverSubtype (location): ${loc.driverSubtype}`);
    console.log(`- driverSubtype (user): ${user.driverSubtype}`);
    console.log(`- lastLocationAt: ${lastLocationMs > 0 ? new Date(lastLocationMs).toISOString() : 'never'}`);
    console.log(`- minutos desde última ubicación: ${diffMinutes}`);
    console.log(`- balance / wallet balance: ${balance}`);
    console.log(`- currentLocation: ${JSON.stringify(loc.currentLocation)}`);
    console.log(`- geohash: ${loc.geohash}`);

    // Check if there are active ride offers for this driver
    console.log("\n=== STEP 2: ACTIVE OFFERS FOR THIS DRIVER ===");
    const offersSnap = await db.collection('rideOffers')
        .where('driverId', '==', driverId)
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get()
        .catch(async () => {
            // Fallback in case of index required
            return await db.collection('rideOffers')
                .where('driverId', '==', driverId)
                .get();
        });

    if (offersSnap.empty) {
        console.log("No offers found for this driver.");
    } else {
        const sortedDocs = offersSnap.docs
            .map(d => ({ id: d.id, data: d.data() }))
            .sort((a, b) => {
                const tA = a.data.createdAt?.toDate?.()?.getTime() || 0;
                const tB = b.data.createdAt?.toDate?.()?.getTime() || 0;
                return tB - tA;
            });
        
        sortedDocs.slice(0, 3).forEach(item => {
            const o = item.data;
            console.log(`Offer: ${item.id}`);
            console.log(`  - RideId: ${o.rideId}`);
            console.log(`  - Status: ${o.status}`);
            console.log(`  - CreatedAt: ${o.createdAt?.toDate?.()?.toISOString()}`);
            console.log(`  - ExpiresAt: ${o.expiresAt?.toDate?.()?.toISOString()}`);
            console.log(`  - RejectReason: ${o.rejectReason || 'none'}`);
        });
    }

    // Check most recent ride in Rawson
    console.log("\n=== STEP 3: MOST RECENT RIDE IN RAWSON ===");
    const ridesSnap = await db.collection('rides')
        .where('cityKey', '==', 'rawson')
        .get();
    
    if (ridesSnap.empty) {
        console.log("No rides found in Rawson.");
    } else {
        const sortedRides = ridesSnap.docs
            .map(d => ({ id: d.id, data: d.data() }))
            .sort((a, b) => {
                const tA = a.data.createdAt?.toDate?.()?.getTime() || 0;
                const tB = b.data.createdAt?.toDate?.()?.getTime() || 0;
                return tB - tA;
            });
        
        const recent = sortedRides[0];
        const r = recent.data;
        console.log(`Most Recent Ride ID: ${recent.id}`);
        console.log(`- Status: ${r.status}`);
        console.log(`- ServiceType: ${r.serviceType}`);
        console.log(`- PaymentMethod: ${r.paymentMethod}`);
        console.log(`- PassengerId: ${r.passengerId}`);
        console.log(`- CreatedAt: ${r.createdAt?.toDate?.()?.toISOString()}`);
        console.log(`- DriverId: ${r.driverId || 'none'}`);
        console.log(`- MatchingAttempts: ${r.matchingAttempts || 0}`);
        console.log(`- LastMatchingFailure: ${r.lastMatchingFailureReason || 'none'}`);
        console.log(`- Origin: ${JSON.stringify(r.origin)}`);
        console.log(`- Destination: ${JSON.stringify(r.destination)}`);

        // Check if there is an active passenger activeRideId
        if (r.passengerId) {
            const passSnap = await db.collection('users').doc(r.passengerId).get();
            console.log(`- Passenger activeRideId in users/: ${passSnap.data()?.activeRideId || 'none'}`);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error("Diagnostic script failed:", err);
    process.exit(1);
});
