import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
    console.log(`Starting cleanup_stuck_shared_passenger script. DRY_RUN: ${DRY_RUN}`);

    const usersSnapshot = await db.collection("users").get();
    
    let blockedUsers = [];

    // Find users with active fields including activeSharedRequestId
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.activeSharedGroupId || data.activeSharedRideId || data.activeRideId || data.currentRideId || data.activeSharedRequestId) {
            blockedUsers.push({ id: doc.id, ...data });
        }
    });

    const stuckPassengers = [];

    for (const u of blockedUsers) {
        let isStuck = false;
        let reasons = [];

        if (u.activeSharedRequestId) {
            const reqDoc = await db.collection("shared_ride_requests").doc(u.activeSharedRequestId).get();
            if (!reqDoc.exists) {
                reasons.push(`Points to non-existent request ${u.activeSharedRequestId}`);
                isStuck = true;
            } else {
                const rData = reqDoc.data()!;
                if (!rData.active && rData.status === 'cancelled') {
                    reasons.push(`Points to cancelled request ${u.activeSharedRequestId}`);
                    isStuck = true;
                } else if (["cancelled", "expired", "failed", "completed"].includes(rData.status)) {
                    reasons.push(`Points to inactive request ${u.activeSharedRequestId} (status: ${rData.status})`);
                    isStuck = true;
                }
            }
        }

        if (u.activeSharedGroupId) {
             const gDoc = await db.collection("shared_ride_groups").doc(u.activeSharedGroupId).get();
             if (!gDoc.exists || ["cancelled", "completed", "failed", "expired"].includes(gDoc.data()!.status)) {
                 reasons.push(`Points to inactive/missing group ${u.activeSharedGroupId}`);
                 isStuck = true;
             }
        }

        if (isStuck && !u.isDriver) {
            console.log(`\nPassenger: ${u.name || u.id} (uid: ${u.id})`);
            console.log(`- activeRideId: ${u.activeRideId}`);
            console.log(`- activeSharedRideId: ${u.activeSharedRideId}`);
            console.log(`- activeSharedGroupId: ${u.activeSharedGroupId}`);
            console.log(`- activeSharedRequestId: ${u.activeSharedRequestId}`);
            console.log(`-> STUCK REASONS: ${reasons.join(' | ')}`);
            stuckPassengers.push(u);
        }
    }

    if (stuckPassengers.length === 0) {
        console.log("\nNo stuck passengers found.");
        return;
    }

    console.log("\n--- EXECUTING CLEANUP PLAN (DRY RUN) ---");
    const batch = db.batch();
    let pendingWrites = 0;

    for (const u of stuckPassengers) {
        console.log(`\nCleaning up user ${u.name || u.id} (${u.id})...`);
        const uRef = db.collection("users").doc(u.id);
        const uUpdates: any = {};
        
        if (u.activeRideId) uUpdates.activeRideId = admin.firestore.FieldValue.delete();
        if (u.activeSharedRideId) uUpdates.activeSharedRideId = admin.firestore.FieldValue.delete();
        if (u.activeSharedGroupId) uUpdates.activeSharedGroupId = admin.firestore.FieldValue.delete();
        if (u.activeSharedRequestId) uUpdates.activeSharedRequestId = admin.firestore.FieldValue.delete();
        
        if (Object.keys(uUpdates).length > 0) {
            console.log(` - Updating user fields: ${Object.keys(uUpdates).join(', ')}`);
            if (!DRY_RUN) batch.update(uRef, uUpdates);
            pendingWrites++;
        }
    }

    console.log("\n=================================");
    if (!DRY_RUN) {
        if (pendingWrites > 0) {
            await batch.commit();
            console.log(`Cleanup executed successfully. (${pendingWrites} writes)`);
        } else {
            console.log("No writes to execute.");
        }
    } else {
        console.log("DRY RUN COMPLETE - No changes were written to the database.");
    }
}

run().catch(console.error);
