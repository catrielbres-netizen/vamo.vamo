import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
    console.log(`Starting cleanup script. DRY_RUN: ${DRY_RUN}`);

    const groupId = "VCg9EZ2zvXEA0i7bT7gv";
    const masterRideId = "shared_VCg9EZ2zvXEA0i7bT7gv";

    console.log(`Targeting Group: ${groupId}`);
    console.log(`Targeting Master Ride: ${masterRideId}`);

    const groupDoc = await db.collection("shared_ride_groups").doc(groupId).get();
    const rideDoc = await db.collection("rides").doc(masterRideId).get();

    console.log("\n=================================");
    console.log("--- 1. GROUP DIAGNOSIS ---");
    if (groupDoc.exists) {
        console.log(JSON.stringify(groupDoc.data(), null, 2));
    } else {
        console.log("Group document not found.");
    }

    console.log("\n--- 2. RIDE DIAGNOSIS ---");
    if (rideDoc.exists) {
        console.log(JSON.stringify(rideDoc.data(), null, 2));
    } else {
        console.log("Ride document not found.");
    }

    console.log("\n--- 3. OFFERS DIAGNOSIS ---");
    const offersSnapshot = await db.collection("rideOffers")
        .where("rideId", "==", masterRideId)
        .get();

    const activeOffers: admin.firestore.QueryDocumentSnapshot[] = [];
    if (offersSnapshot.empty) {
        console.log("No offers found for this ride.");
    } else {
        offersSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`offerId: ${doc.id} - driverId: ${data.driverId} - status: ${data.status}`);
            if (data.status === "pending" || data.status === "active") {
                activeOffers.push(doc);
            }
        });
    }

    console.log("\n--- 4. USERS DIAGNOSIS ---");
    const passengerIds = [
        "HYakOQJ8WqeauOHtn8VdcYlaSlK2",
        "eMhDWqwmQMgoKMskjzTd2StwQaI3",
        "qgKot462IpPER2l9uzB0uzJsqWP2"
    ];
    const eduardoId = "VNhou0ag4wXXPr6IXa3foO6SI8B3";
    
    const usersToClean = new Set<string>([...passengerIds, eduardoId]);

    const usersDocs = await Promise.all(Array.from(usersToClean).map(uid => db.collection("users").doc(uid).get()));
    usersDocs.forEach(doc => {
        if (!doc.exists) return;
        const data = doc.data()!;
        console.log(`\nUser uid: ${doc.id} (Name: ${data.name})`);
        console.log(`  activeRideId: ${data.activeRideId}`);
        console.log(`  activeSharedRideId: ${data.activeSharedRideId}`);
        console.log(`  activeSharedGroupId: ${data.activeSharedGroupId}`);
        console.log(`  currentRideId: ${data.currentRideId}`);
        console.log(`  driverStatus: ${data.driverStatus}`);
        console.log(`  online: ${data.online}`);
    });

    console.log("\n--- 5. REQUESTS DIAGNOSIS ---");
    const requestsSnapshot = await db.collection("shared_ride_requests")
        .where("groupId", "==", groupId)
        .get();
    
    if (requestsSnapshot.empty) {
        console.log("No shared ride requests found.");
    } else {
        requestsSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`requestId: ${doc.id} - passengerId: ${data.passengerId} - status: ${data.status} - active: ${data.active}`);
        });
    }

    console.log("\n=================================");
    console.log("--- EXECUTING CLEANUP PLAN ---");

    const batch = db.batch();
    let pendingWrites = 0;

    if (groupDoc.exists) {
        console.log(`\nA. Updating shared_ride_groups/${groupId}`);
        console.log(`   -> status: "cancelled", cancellationReason: "manual_alpha_cleanup"`);
        if (!DRY_RUN) {
            batch.update(groupDoc.ref, {
                status: "cancelled",
                cancellationReason: "manual_alpha_cleanup",
                cancelledBy: "admin_manual_cleanup",
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                closedAt: admin.firestore.FieldValue.serverTimestamp(),
                driverSearchStatus: "cancelled"
            });
            pendingWrites++;
        }
    }

    if (rideDoc.exists) {
        console.log(`\nB. Updating rides/${masterRideId}`);
        console.log(`   -> status: "cancelled", cancellationReason: "manual_alpha_cleanup"`);
        if (!DRY_RUN) {
            batch.update(rideDoc.ref, {
                status: "cancelled",
                cancellationReason: "manual_alpha_cleanup",
                cancelledBy: "admin_manual_cleanup",
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                closedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            pendingWrites++;
        }
    }

    if (activeOffers.length > 0) {
        console.log(`\nC. Updating ${activeOffers.length} rideOffers`);
        activeOffers.forEach(offerDoc => {
            console.log(`   -> Cancelling offer ${offerDoc.id}`);
            if (!DRY_RUN) {
                batch.update(offerDoc.ref, {
                    status: "cancelled",
                    cancellationReason: "manual_alpha_cleanup",
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp()
                });
                pendingWrites++;
            }
        });
    }

    if (!requestsSnapshot.empty) {
        console.log(`\nD. Updating ${requestsSnapshot.docs.length} shared_ride_requests`);
        requestsSnapshot.docs.forEach(reqDoc => {
            console.log(`   -> Cancelling request ${reqDoc.id} (active: false)`);
            if (!DRY_RUN) {
                batch.update(reqDoc.ref, {
                    status: "cancelled",
                    cancellationReason: "manual_alpha_cleanup",
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    active: false
                });
                pendingWrites++;
            }
        });
    }

    console.log(`\nE. & F. Updating Users`);
    usersDocs.forEach(userDoc => {
        if (!userDoc.exists) return;
        const data = userDoc.data()!;
        const updateData: any = {};
        let shouldUpdate = false;

        if (data.activeRideId === masterRideId || data.activeRideId === groupId) {
            updateData.activeRideId = admin.firestore.FieldValue.delete();
            shouldUpdate = true;
        }
        if (data.activeSharedRideId === masterRideId || data.activeSharedRideId === groupId) {
            updateData.activeSharedRideId = admin.firestore.FieldValue.delete();
            shouldUpdate = true;
        }
        if (data.activeSharedGroupId === groupId) {
            updateData.activeSharedGroupId = admin.firestore.FieldValue.delete();
            shouldUpdate = true;
        }
        if (data.currentRideId === masterRideId || data.currentRideId === groupId) {
            updateData.currentRideId = admin.firestore.FieldValue.delete();
            shouldUpdate = true;
        }
        
        if (userDoc.id === eduardoId) {
            updateData.driverStatus = "online";
            updateData.status = "online";
            shouldUpdate = true;
        }

        if (shouldUpdate) {
            console.log(`   -> User ${userDoc.id} (${data.name}):`);
            if (updateData.activeRideId !== undefined) console.log(`      * deleting activeRideId`);
            if (updateData.activeSharedRideId !== undefined) console.log(`      * deleting activeSharedRideId`);
            if (updateData.activeSharedGroupId !== undefined) console.log(`      * deleting activeSharedGroupId`);
            if (updateData.currentRideId !== undefined) console.log(`      * deleting currentRideId`);
            if (updateData.driverStatus) console.log(`      * setting driverStatus = "online", status = "online"`);
            
            if (!DRY_RUN) {
                batch.update(userDoc.ref, updateData);
                pendingWrites++;
            }
        }
    });

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
