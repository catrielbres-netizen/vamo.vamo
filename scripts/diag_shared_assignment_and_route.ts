import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function runDiagnosis() {
    console.log("=== INICIANDO DIAGNÓSTICO ASIGNACIÓN Y RUTA COMPARTIDA ===");

    // 1. Obtener el viaje compartido maestro más reciente asignado a un conductor
    const ridesSnapshot = await db.collection('rides')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

    const masterRideDoc = ridesSnapshot.docs.find(d => {
        const data = d.data();
        return data.isSharedRide === true && ['driver_assigned', 'driver_arrived', 'started', 'in_progress'].includes(data.status);
    });

    if (!masterRideDoc) {
        console.log("NO_ACTIVE_SHARED_RIDE_FOUND");
        return;
    }

    const masterRide = masterRideDoc.data();
    const groupId = masterRide.sharedGroupId;
    const driverId = masterRide.driverId;

    console.log(`\n--- RIDE MAESTRO (${masterRideDoc.id}) ---`);
    console.log(`MASTER_RIDE_ID: ${masterRideDoc.id}`);
    console.log(`GROUP_ID: ${groupId}`);
    console.log(`DRIVER_ID: ${driverId}`);
    console.log(`STATUS: ${masterRide.status}`);
    console.log(`CURRENT_STOP_INDEX: ${masterRide.currentStopIndex}`);
    console.log(`CURRENT_STOP_ID: ${masterRide.currentStopId}`);
    console.log(`ORDERED_STOPS:`, JSON.stringify(masterRide.orderedStops));
    console.log(`SHARED_PASSENGERS:`, JSON.stringify(masterRide.sharedPassengers));

    let groupData: any = null;
    if (groupId) {
        const groupSnap = await db.doc(`shared_ride_groups/${groupId}`).get();
        if (groupSnap.exists) {
            groupData = groupSnap.data();
            console.log(`\n--- GRUPO (${groupId}) ---`);
            console.log(`STATUS: ${groupData.status}`);
            console.log(`DRIVER_ID: ${groupData.driverId}`);
            console.log(`ASSIGNED_DRIVER_ID: ${groupData.assignedDriverId}`);
            console.log(`RIDE_ID: ${groupData.rideId || groupData.finalRideId || groupData.masterRideId}`);
            console.log(`PASSENGER_COUNT: ${groupData.passengerCount}`);
            console.log(`OCCUPIED_SEATS: ${groupData.occupiedSeats}`);
            console.log(`ORDERED_STOPS:`, JSON.stringify(groupData.orderedStops));
        } else {
            console.log(`\n--- GRUPO (${groupId}) NO ENCONTRADO ---`);
        }
    }

    console.log(`\n--- OFERTAS PREVIAS ---`);
    const offersSnap = await db.collection('rideOffers')
        .where('rideId', '==', masterRideDoc.id)
        .where('driverId', '==', driverId)
        .get();

    if (!offersSnap.empty) {
        const offer = offersSnap.docs[0].data();
        console.log(`OFFER_ID: ${offersSnap.docs[0].id}`);
        console.log(`ORDERED_STOPS_PREVIEW:`, JSON.stringify(offer.orderedStopsPreview));
    } else {
        console.log(`NO_OFFER_FOUND`);
    }

    console.log(`\n--- ESTADO DE LOS PASAJEROS ---`);
    const requestsSnap = await db.collection('shared_ride_requests')
        .where('groupId', '==', groupId)
        .get();

    const passengerIds = requestsSnap.docs.map(d => d.data().passengerId);
    console.log(`PASSENGER_LIST: ${passengerIds.join(', ')}`);

    let anyRequestNotUpdated = false;
    let anyUserRideMissing = false;

    for (const reqDoc of requestsSnap.docs) {
        const req = reqDoc.data();
        const pId = req.passengerId;
        console.log(`\n  >> Pasajero: ${pId} (Request: ${reqDoc.id})`);
        console.log(`    REQUEST_STATUS: ${req.status}`);
        console.log(`    REQUEST_RIDE_ID: ${req.rideId || req.finalRideId}`);
        console.log(`    REQUEST_DRIVER_ID: ${req.driverId}`);

        if (req.status !== 'assigned' && req.status !== 'driver_assigned' && req.status !== 'picked_up' && req.status !== 'dropped_off' && req.status !== 'tracking' && req.status !== 'pickup_pending') {
            anyRequestNotUpdated = true;
        }

        const userSnap = await db.doc(`users/${pId}`).get();
        if (userSnap.exists) {
            const user = userSnap.data();
            console.log(`    USER_ACTIVE_RIDE_ID: ${user?.activeRideId}`);
            console.log(`    USER_ACTIVE_SHARED_RIDE_ID: ${user?.activeSharedRideId}`);
            console.log(`    USER_ACTIVE_SHARED_GROUP_ID: ${user?.activeSharedRideGroupId}`);
            
            if (!user?.activeRideId) {
                anyUserRideMissing = true;
            }
        } else {
             console.log(`    USER_NOT_FOUND`);
        }
    }

    console.log(`\n--- DIAGNÓSTICO DE MOTIVOS ---`);
    if (anyRequestNotUpdated && !anyUserRideMissing) {
         console.log(`Motivo: REQUESTS_NOT_UPDATED (Solo se actualizó user, no requests)`);
    } else if (anyUserRideMissing && !anyRequestNotUpdated) {
         console.log(`Motivo: USERS_ACTIVE_RIDE_MISSING (Requests actualizados, pero user no tiene activeRideId)`);
    } else if (anyUserRideMissing && anyRequestNotUpdated) {
         console.log(`Motivo: ONLY_FIRST_PASSENGER_LINKED (Posiblemente solo se iteró el creador o hay una falla masiva de propagación)`);
    }

    if (!masterRide.orderedStops || masterRide.orderedStops.length === 0) {
        console.log(`Motivo: RIDE_ORDERED_STOPS_MISSING`);
    } else {
        const stop = masterRide.orderedStops[0];
        if (stop.id === undefined && stop.requestId === undefined) {
            console.log(`Motivo: STOP_ID_MISSING`);
        }
    }
}

runDiagnosis().then(() => {
    console.log("=== FIN DIAGNÓSTICO ===");
    process.exit(0);
}).catch(console.error);
