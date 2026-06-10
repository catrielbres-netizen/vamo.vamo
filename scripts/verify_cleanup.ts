import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function run() {
    console.log(`Starting Verification script...`);

    const validGroupStatuses = [
        "forming", "grouped", "ready_for_driver", "ready_for_driver_dispatch",
        "driver_searching", "searching", "driver_assigned", "in_progress", "active"
    ];

    console.log("\n1. Verificando shared_ride_groups activos...");
    const groupsSnapshot = await db.collection("shared_ride_groups")
        .where("status", "in", validGroupStatuses)
        .get();

    let foundActiveSharedGroup = false;
    groupsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.passengerCount > 0 || (data.sharedPassengers && data.sharedPassengers.length > 0)) {
            console.log(` - ALERTA: Grupo activo encontrado: ${doc.id} - status: ${data.status}`);
            foundActiveSharedGroup = true;
        }
    });
    if (!foundActiveSharedGroup) {
        console.log(" - OK: No hay grupos compartidos trabados con pasajeros.");
    }

    console.log("\n2. Verificando rides compartidos activos...");
    const ridesSnapshot = await db.collection("rides")
        .where("status", "in", ["active", "driver_assigned", "driver_searching", "in_progress", "picked_up"])
        .where("isSharedRide", "==", true)
        .get();

    if (ridesSnapshot.empty) {
        console.log(" - OK: No hay rides compartidos activos trabados.");
    } else {
        ridesSnapshot.forEach(doc => {
            console.log(` - ALERTA: Ride compartido activo: ${doc.id} - status: ${doc.data().status}`);
        });
    }

    console.log("\n3. Verificando rideOffers del grupo cerrado...");
    const masterRideId = "shared_dyY2lBqbckkz7noNc1lD";
    const offersSnapshot = await db.collection("rideOffers")
        .where("rideId", "==", masterRideId)
        .where("status", "in", ["pending", "active"])
        .get();
        
    if (offersSnapshot.empty) {
        console.log(" - OK: No hay rideOffers pendientes del grupo cerrado.");
    } else {
        offersSnapshot.forEach(doc => {
            console.log(` - ALERTA: Offer pendiente encontrada: ${doc.id}`);
        });
    }

    console.log("\n4. Verificando Eduardo (conductor)...");
    const eduardoId = "VNhou0ag4wXXPr6IXa3foO6SI8B3";
    const eduardoDoc = await db.collection("users").doc(eduardoId).get();
    if (eduardoDoc.exists) {
        const data = eduardoDoc.data()!;
        console.log(` - driverStatus: ${data.driverStatus}`);
        console.log(` - status: ${data.status}`);
        console.log(` - activeRideId: ${data.activeRideId || 'Ninguno'}`);
        console.log(` - currentRideId: ${data.currentRideId || 'Ninguno'}`);
        if (data.driverStatus === "online" && !data.activeRideId && !data.currentRideId) {
            console.log(" - OK: Eduardo está online y libre.");
        } else {
            console.log(" - ALERTA: Eduardo NO está libre u online.");
        }
    } else {
        console.log(" - ALERTA: Eduardo no encontrado.");
    }

    console.log("\n5. Verificando Pasajeros test...");
    const passengerIds = [
        "HYakOQJ8WqeauOHtn8VdcYlaSlK2", // Pasajero Test 1
        "eMhDWqwmQMgoKMskjzTd2StwQaI3", // maria
        "qgKot462IpPER2l9uzB0uzJsqWP2"  // Pasajero Test 2
    ];
    let paxLibres = 0;
    const paxDocs = await Promise.all(passengerIds.map(uid => db.collection("users").doc(uid).get()));
    paxDocs.forEach(doc => {
        if (!doc.exists) return;
        const data = doc.data()!;
        console.log(` - Pasajero: ${data.name}`);
        console.log(`   activeRideId: ${data.activeRideId || 'Ninguno'}`);
        console.log(`   activeSharedGroupId: ${data.activeSharedGroupId || 'Ninguno'}`);
        if (!data.activeRideId && !data.activeSharedGroupId) {
            paxLibres++;
        } else {
            console.log(`   -> ALERTA: Pasajero no está libre.`);
        }
    });
    if (paxLibres === 3) {
        console.log(" - OK: Todos los pasajeros test están libres.");
    }

    console.log("\n6. Verificando settings Alpha...");
    const settingsDoc = await db.collection("settings").doc("features").get();
    if (settingsDoc.exists) {
        const data = settingsDoc.data()!;
        console.log(` - requireAlphaTester: ${data.requireAlphaTester}`);
        console.log(` - driverSearchEnabled: ${data.driverSearchEnabled}`);
        if (data.requireAlphaTester === true && data.driverSearchEnabled === true) {
            console.log(" - OK: Alpha sigue cerrado y configurado correctamente.");
        } else {
            console.log(" - ALERTA: Configuración Alpha alterada.");
        }
    } else {
         console.log(" - ALERTA: Documento settings/features no encontrado.");
    }
}

run().catch(console.error);
