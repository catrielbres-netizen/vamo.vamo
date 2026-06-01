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
const isApplyMode = process.argv.includes('--apply');

async function main() {
    const rideId = 'test_r2_1778451645059';
    console.log("==================================================");
    console.log(` CLEANUP OF CORRUPT RIDE - MODE: ${isApplyMode ? '★ APPLY ★' : '☆ DRY RUN ☆'}`);
    console.log("==================================================");

    const rideRef = db.collection('rides').doc(rideId);
    const rideSnap = await rideRef.get();

    if (!rideSnap.exists) {
        console.error(`Ride document ${rideId} does not exist!`);
        process.exit(1);
    }

    const ride = rideSnap.data() || {};
    const passengerId = ride.passengerId;

    console.log(`Target Ride ID: ${rideId}`);
    console.log(`- Current status: ${ride.status}`);
    console.log(`- Current passengerId: ${passengerId}`);

    let shouldResetPassenger = false;
    if (passengerId) {
        const passSnap = await db.collection('users').doc(passengerId).get();
        if (passSnap.exists && passSnap.data()?.activeRideId === rideId) {
            shouldResetPassenger = true;
            console.log(`- Passenger ${passengerId} activeRideId points to this ride. Needs reset.`);
        } else {
            console.log(`- Passenger ${passengerId} activeRideId does not point to this ride (value: ${passSnap.exists ? passSnap.data()?.activeRideId : 'doc not found'}). No reset needed.`);
        }
    }

    if (isApplyMode) {
        const batch = db.batch();
        
        // Update ride document
        batch.update(rideRef, {
            status: "cancelled",
            cancelReason: "simulation_cleanup",
            cancellationReason: "simulation_cleanup",
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cleanupAt: admin.firestore.FieldValue.serverTimestamp(),
            cleanupNote: "Cancelled corrupt test ride missing createdAt/activatedAt; was blocking scheduledRideWorkerV1",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Reset passenger if needed
        if (shouldResetPassenger && passengerId) {
            batch.update(db.collection('users').doc(passengerId), {
                activeRideId: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();
        console.log(`\n✔ [APPLY] Successfully updated corrupt ride ${rideId} to cancelled (and updated passenger activeRideId if required).`);
    } else {
        console.log(`\n[DRY RUN] Would update rides/${rideId} to:`);
        console.log(`  * status: "cancelled"`);
        console.log(`  * cancelReason: "simulation_cleanup"`);
        console.log(`  * cancellationReason: "simulation_cleanup"`);
        console.log(`  * cancelledAt: serverTimestamp()`);
        console.log(`  * cleanupAt: serverTimestamp()`);
        console.log(`  * cleanupNote: "Cancelled corrupt test ride missing createdAt/activatedAt; was blocking scheduledRideWorkerV1"`);
        if (shouldResetPassenger) {
            console.log(`  * Would also set users/${passengerId}/activeRideId to null`);
        }
        console.log(`\nTo execute this change, run: npx tsx scripts/apply_corrupt_ride_cleanup.ts --apply`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error("Script failed:", err);
    process.exit(1);
});
