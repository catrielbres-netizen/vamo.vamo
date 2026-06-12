import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function run() {
    // 1. Stuck active groups
    const groupsSnap = await db.collection("shared_ride_groups").get();
    const activeStatuses = ['forming','pending','ready_for_driver_dispatch','driver_assigned','in_progress'];
    const byStatus: Record<string, number> = {};
    for (const d of groupsSnap.docs) {
        const s = d.data().status || 'unknown';
        byStatus[s] = (byStatus[s] || 0) + 1;
    }
    console.log("=== GROUPS BY STATUS ===");
    console.log(JSON.stringify(byStatus, null, 2));

    const activeGroups = groupsSnap.docs.filter(d => activeStatuses.includes(d.data().status));
    console.log(`\nActive groups: ${activeGroups.length}`);
    for (const d of activeGroups) {
        const data = d.data();
        console.log(`\nGroup: ${d.id}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  masterRideId: ${data.masterRideId}`);
        console.log(`  driverId: ${data.driverId}`);
        console.log(`  passengers: ${JSON.stringify(data.passengerIds)}`);
        if (data.masterRideId) {
            const rideDoc = await db.collection("rides").doc(data.masterRideId).get();
            if (rideDoc.exists) {
                const r = rideDoc.data()!;
                console.log(`  Master Ride Status: ${r.status}`);
                console.log(`  Master driverId: ${r.driverId}`);
                console.log(`  sharedPassengers: ${r.sharedPassengers?.length || 0}`);
                (r.sharedPassengers || []).forEach((p: any) => {
                    console.log(`    - ${p.passengerId} | requestId: ${p.requestId} | status: ${p.status}`);
                });
                console.log(`  orderedStops: ${r.orderedStops?.length || 0}`);
            } else {
                console.log(`  Master Ride: NOT FOUND (orphaned group!)`);
            }
        }
    }

    // 2. Stuck users
    console.log("\n=== STUCK USERS ===");
    const usersSnap = await db.collection("users").get();
    for (const d of usersSnap.docs) {
        const u = d.data();
        const issues: string[] = [];
        if (u.activeRideId) issues.push(`activeRideId=${u.activeRideId}`);
        if (u.activeSharedRideId) issues.push(`activeSharedRideId=${u.activeSharedRideId}`);
        if (u.activeSharedGroupId) issues.push(`activeSharedGroupId=${u.activeSharedGroupId}`);
        if (u.activeSharedRequestId) issues.push(`activeSharedRequestId=${u.activeSharedRequestId}`);
        if (issues.length > 0) {
            console.log(`User: ${d.id} (${u.name || u.email})`);
            issues.forEach(i => console.log(`  -> ${i}`));
        }
    }

    // 3. Rides searching or in_progress
    console.log("\n=== ACTIVE MASTER RIDES ===");
    const ridesSnap = await db.collection("rides").where("isSharedRide", "==", true).get();
    const activeRides = ridesSnap.docs.filter(d => ['searching','driver_assigned','in_progress'].includes(d.data().status));
    for (const d of activeRides) {
        const r = d.data();
        console.log(`\nRide: ${d.id}`);
        console.log(`  Status: ${r.status}`);
        console.log(`  driverId: ${r.driverId}`);
        console.log(`  sharedGroupId: ${r.sharedGroupId}`);
        console.log(`  sharedPassengers: ${r.sharedPassengers?.length || 0}`);
        (r.sharedPassengers || []).forEach((p: any) => {
            console.log(`    - ${p.passengerId} requestId: ${p.requestId}`);
        });
    }

    // 4. Pending offers
    console.log("\n=== PENDING OFFERS ===");
    const offersSnap = await db.collection("rideOffers").where("status", "==", "pending").get();
    console.log(`Pending offers: ${offersSnap.size}`);
    for (const d of offersSnap.docs) {
        const o = d.data();
        console.log(`  Offer: ${d.id} | rideId: ${o.rideId} | driverId: ${o.driverId}`);
    }

    // 5. Eduardo status
    console.log("\n=== EDUARDO (CONDUCTOR) STATUS ===");
    const eduDoc = await db.collection("users").doc("VNhou0ag4wXXPr6IXa3foO6SI8B3").get();
    if (eduDoc.exists) {
        const e = eduDoc.data()!;
        console.log(`  Name: ${e.name}`);
        console.log(`  driverStatus: ${e.driverStatus}`);
        console.log(`  status: ${e.status}`);
        console.log(`  isAvailable: ${e.isAvailable}`);
        console.log(`  activeRideId: ${e.activeRideId}`);
        console.log(`  currentRideId: ${e.currentRideId}`);
    }
    const eduLoc = await db.collection("drivers_locations").doc("VNhou0ag4wXXPr6IXa3foO6SI8B3").get();
    if (eduLoc.exists) {
        const el = eduLoc.data()!;
        console.log(`  drivers_locations.driverStatus: ${el.driverStatus}`);
        console.log(`  drivers_locations.currentLocation: ${JSON.stringify(el.currentLocation)}`);
    }
}

run().catch(console.error);
