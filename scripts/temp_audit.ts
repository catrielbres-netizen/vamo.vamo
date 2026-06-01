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
    console.log("=== DB AUDIT RUN ===");

    // 1. Inspect driver o70AclhdBSNFPgb9jhka18QLUSK2
    const driverId = 'o70AclhdBSNFPgb9jhka18QLUSK2';
    const driverUserSnap = await db.collection('users').doc(driverId).get();
    const driverLocSnap = await db.collection('drivers_locations').doc(driverId).get();
    const driverWalletSnap = await db.collection('wallets').doc(driverId).get();

    console.log(`\n--- INSPECTING DRIVER: ${driverId} ---`);
    console.log(`User Doc Exists: ${driverUserSnap.exists}`);
    if (driverUserSnap.exists) {
        console.log(`User Doc:`, JSON.stringify(driverUserSnap.data(), null, 2));
    }
    console.log(`Location Doc Exists: ${driverLocSnap.exists}`);
    if (driverLocSnap.exists) {
        console.log(`Location Doc:`, JSON.stringify(driverLocSnap.data(), null, 2));
    }
    console.log(`Wallet Doc Exists: ${driverWalletSnap.exists}`);
    if (driverWalletSnap.exists) {
        console.log(`Wallet Doc:`, JSON.stringify(driverWalletSnap.data(), null, 2));
    }

    // 2. Query last 20 rides in Rawson
    console.log(`\n--- LAST 20 RIDES IN RAWSON ---`);
    const lastRidesSnap = await db.collection('rides')
        .where('cityKey', '==', 'rawson')
        .get();
    
    const lastRides = lastRidesSnap.docs
        .map(d => ({ id: d.id, data: d.data() }))
        .sort((a, b) => {
            const tA = a.data.createdAt?.toDate?.()?.getTime() || 0;
            const tB = b.data.createdAt?.toDate?.()?.getTime() || 0;
            return tB - tA; // desc
        })
        .slice(0, 20);
    
    lastRides.forEach(item => {
        const d = item.data;
        console.log(`Ride: ${item.id}`);
        console.log(`- Status: ${d.status}`);
        console.log(`- Service: ${d.serviceType}`);
        console.log(`- CreatedAt: ${d.createdAt?.toDate?.()?.toISOString()}`);
        console.log(`- DriverId: ${d.driverId || 'none'}`);
        console.log(`- CancelReason: ${d.cancelReason || 'none'}`);
        console.log(`- MatchingAttempts: ${d.matchingAttempts || 0}`);
        console.log(`- LastFailureReason: ${d.lastMatchingFailureReason || 'none'}`);
        console.log(`- isSimulation: ${d.isSimulation || false}`);
        console.log("------------------------");
    });

    // 3. Query features config in Firestore
    console.log(`\n--- FEATURES CONFIG ---`);
    const featuresSnap = await db.collection('features').get();
    featuresSnap.docs.forEach(doc => {
        console.log(`Feature: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
    });

    // 4. Query weekly pools for passengers
    console.log(`\n--- PASSENGER WEEKLY POOLS (RAWSON) ---`);
    const passengerPoolsSnap = await db.collection('cities').doc('rawson').collection('passenger_weekly_pools').get();
    passengerPoolsSnap.docs.forEach(doc => {
        console.log(`Pool Week: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
    });

    process.exit(0);
}

runAudit().catch(err => {
    console.error("Audit script failed:", err);
    process.exit(1);
});
