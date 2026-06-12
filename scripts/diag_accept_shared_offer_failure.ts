import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function run() {
    console.log("--- DIAGNÓSTICO DE ERROR EN ACCEPT RIDE (ALL OFFERS) ---");

    const driverId = "VNhou0ag4wXXPr6IXa3foO6SI8B3";

    const ridesSnap = await db.collection("rides")
        .where("isSharedRide", "==", true)
        .orderBy("createdAt", "desc")
        .limit(3)
        .get();

    if (ridesSnap.empty) {
        console.log("No shared rides found.");
        return;
    }

    const rideDoc = ridesSnap.docs[0];
    const ride = rideDoc.data();
    const rideId = rideDoc.id;

    console.log(`Most recent Shared Ride ID: ${rideId}`);
    console.log(`Ride Status: ${ride.status}`);
    console.log(`isSharedRide: ${ride.isSharedRide}`);
    console.log(`sharedGroupId: ${ride.sharedGroupId}`);
    console.log(`Driver ID assigned to ride: ${ride.driverId}`);
}

run().catch(console.error);
