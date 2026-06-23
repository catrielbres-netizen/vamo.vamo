import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

function getDistanceM(p1: any, p2: any): number {
    const R = 6371e3;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function run() {
    console.log("--- DIAGNÓSTICO DE RUTA Y VISIBILIDAD DE PASAJEROS ---\n");

    // Get the most recent shared ride in progress or searching or driver_assigned
    const ridesSnap = await db.collection("rides")
        .where("isSharedRide", "==", true)
        .get();

    if (ridesSnap.empty) {
        console.log("No se encontraron viajes compartidos recientes.");
        return;
    }

    const docs = ridesSnap.docs.sort((a, b) => {
        const tA = a.data().createdAt?.toMillis() || 0;
        const tB = b.data().createdAt?.toMillis() || 0;
        return tB - tA; // desc
    });

    let targetRide = null;
    for (const doc of docs) {
        const r = doc.data();
        if (r.status !== 'completed' && r.status !== 'cancelled') {
            targetRide = { id: doc.id, ...r };
            break;
        }
    }

    if (!targetRide) {
        targetRide = { id: ridesSnap.docs[0].id, ...ridesSnap.docs[0].data() };
    }

    console.log(`Master Ride ID: ${targetRide.id}`);
    console.log(`Group ID: ${targetRide.sharedGroupId}`);
    console.log(`Status: ${targetRide.status}`);
    
    const driverId = targetRide.driverId;
    console.log(`Driver ID: ${driverId || 'Ninguno'}`);

    let driverLocation = null;
    if (driverId) {
        const driverLocSnap = await db.collection("drivers_locations").doc(driverId).get();
        if (driverLocSnap.exists) {
            driverLocation = driverLocSnap.data()?.currentLocation || driverLocSnap.data()?.l;
            console.log(`Driver Location (drivers_locations): ${JSON.stringify(driverLocation)}`);
        } else {
            console.log(`No location found in drivers_locations for driver ${driverId}`);
        }
    }

    const orderedStops = targetRide.orderedStops || [];
    console.log(`\nOrdered Stops Actuales (${orderedStops.length}):`);
    orderedStops.forEach((s: any, idx: number) => {
        console.log(` ${idx + 1}. [${s.type.toUpperCase()}] ${s.passengerName || s.passengerId} - ${s.location?.address} (Status: ${s.status})`);
    });

    const pickups = orderedStops.filter((s: any) => s.type === 'pickup');
    
    console.log("\nOrden actual de pickups:");
    pickups.forEach((p: any, idx: number) => {
        console.log(` ${idx + 1}. ${p.passengerName || p.passengerId}`);
    });

    if (driverLocation && pickups.length > 0) {
        console.log("\nDistancias desde el conductor:");
        pickups.forEach((p: any, idx: number) => {
            const dist = getDistanceM(driverLocation, p.location);
            console.log(` a pickup ${idx + 1} (${p.passengerName || p.passengerId}): ${Math.round(dist)}m`);
        });

        // Compute optimal
        console.log("\nOrden correcto por distancia greedy:");
        let lastLoc = driverLocation;
        let remaining = [...pickups];
        let optimalOrder = [];
        while (remaining.length > 0) {
            let nextIdx = 0;
            let nextDist = Infinity;
            remaining.forEach((r, idx) => {
                const d = getDistanceM(lastLoc, r.location);
                if (d < nextDist) {
                    nextDist = d;
                    nextIdx = idx;
                }
            });
            const next = remaining.splice(nextIdx, 1)[0];
            optimalOrder.push(next);
            lastLoc = next.location;
        }

        optimalOrder.forEach((p: any, idx: number) => {
            console.log(` ${idx + 1}. ${p.passengerName || p.passengerId}`);
        });

        if (pickups[0].requestId !== optimalOrder[0].requestId) {
            console.log(`[PICKUPS_NOT_OPTIMIZED_FROM_DRIVER] El primer pickup no es el más cercano al conductor.`);
        }
    }

    // Check passengers
    console.log("\nPara cada pasajero:");
    const passengerIds = targetRide.passengerIds || [];
    for (const pid of passengerIds) {
        const userSnap = await db.collection("users").doc(pid).get();
        if (!userSnap.exists) continue;
        const user = userSnap.data();
        
        console.log(`- UID: ${pid}`);
        console.log(`  Name: ${user?.name}`);
        console.log(`  activeRideId: ${user?.activeRideId}`);
        console.log(`  activeSharedRideId: ${user?.activeSharedRideId}`);
        
        const viewsMaster = (user?.activeRideId === targetRide.id || user?.activeSharedRideId === targetRide.id);
        console.log(`  Ve master ride: ${viewsMaster}`);
        
        if (!viewsMaster) {
            console.log(`  [PASSENGER_CANNOT_SEE_MASTER_ROUTE] El pasajero no apunta al master ride.`);
        }
    }

    console.log("\nDetectar banderas:");
    if (pickups.length > 0) {
        const creatorId = targetRide.passengerId; // usually the first passenger added
        if (pickups[0].passengerId === creatorId) {
            console.log("CREATOR_HAS_IMPLICIT_PRIORITY: YES");
        }
    }
}

run().catch(console.error);
