import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function run() {
    console.log(`Searching for users with active rides...`);

    const usersSnapshot = await db.collection("users").get();
    
    let eduardo: any = null;
    let stuckUsers = [];

    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.name?.toLowerCase().includes("eduardo")) {
            eduardo = { id: doc.id, ...data };
        }
        if (data.activeSharedGroupId || data.activeRideId || data.currentRideId || data.activeSharedRideId) {
            stuckUsers.push({ id: doc.id, name: data.name, ...data });
        }
    });

    console.log(`\nFound Eduardo:`);
    if (eduardo) {
        console.log(`uid: ${eduardo.id}, name: ${eduardo.name}, activeSharedGroupId: ${eduardo.activeSharedGroupId}, activeRideId: ${eduardo.activeRideId}, currentRideId: ${eduardo.currentRideId}, status: ${eduardo.status}, driverStatus: ${eduardo.driverStatus}`);
    } else {
        console.log("Not found.");
    }

    console.log(`\nUsers with active rides:`);
    stuckUsers.forEach(u => {
        console.log(`uid: ${u.id}, name: ${u.name}, isDriver: ${u.isDriver}, activeSharedGroupId: ${u.activeSharedGroupId}, activeRideId: ${u.activeRideId}, currentRideId: ${u.currentRideId}, activeSharedRideId: ${u.activeSharedRideId}`);
    });

    // If there's an activeSharedGroupId, let's print that group
    const groupIds = new Set(stuckUsers.map(u => u.activeSharedGroupId).filter(Boolean));
    for (const gid of groupIds) {
        console.log(`\nGroup ${gid} details:`);
        const groupDoc = await db.collection("shared_ride_groups").doc(gid).get();
        if (groupDoc.exists) {
            console.log(JSON.stringify(groupDoc.data(), null, 2));
        } else {
            console.log("Group does not exist in DB!");
        }
    }
}

run().catch(console.error);
