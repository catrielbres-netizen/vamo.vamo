import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function runDiagnosis() {
    console.log("=== INICIANDO DIAGNÓSTICO VAMO COMPARTIDO ===");

    // 1. Obtener el grupo compartido más reciente
    const groupsSnapshot = await db.collection('shared_ride_groups')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

    if (groupsSnapshot.empty) {
        console.log("NO_GROUP_FOUND");
        return;
    }

    const groupDoc = groupsSnapshot.docs[0];
    const group = groupDoc.data();
    console.log(`\n--- GRUPO COMPARTIDO (${groupDoc.id}) ---`);
    console.log(`GROUP_STATUS: ${group.status}`);
    console.log(`PASSENGER_COUNT: ${group.passengerCount}`);
    console.log(`CITY_KEY: ${group.cityKey}`);
    console.log(`CREATED_AT: ${group.createdAt?.toDate?.()}`);
    console.log(`EXPIRES_AT: ${group.expiresAt?.toDate?.()}`);
    console.log(`DRIVER_SEARCH_STARTED_AT: ${group.driverSearchStartedAt?.toDate?.()}`);
    console.log(`DRIVER_SEARCH_STATUS: ${group.driverSearchStatus}`);
    console.log(`DRIVER_SEARCH_BLOCKED_REASON: ${group.driverSearchBlockedReason}`);
    console.log(`ASSIGNED_DRIVER_ID: ${group.assignedDriverId}`);
    console.log(`DRIVER_ID: ${group.driverId}`);
    console.log(`MASTER_RIDE_ID: ${group.masterRideId || group.rideId}`);
    console.log(`OFFER_ID: ${group.offerId}`);
    console.log(`GROUP_GROSS_AMOUNT: ${group.groupGrossAmount}`);
    console.log(`DRIVER_NET_AMOUNT: ${group.driverNetAmount}`);
    console.log(`PICKUP_STOPS:`, JSON.stringify(group.pickupStops));
    console.log(`DROPOFF_STOPS:`, JSON.stringify(group.dropoffStops));
    console.log(`ORDERED_STOPS:`, JSON.stringify(group.orderedStops));
    console.log(`SHARED_PASSENGERS:`, JSON.stringify(group.sharedPassengers));

    // 2. Buscar Ride Maestro
    const rideId = group.masterRideId || group.rideId;
    let masterRideExists = false;
    let masterRide: any = null;
    if (rideId) {
        const rideDoc = await db.collection('rides').doc(rideId).get();
        if (rideDoc.exists) {
            masterRideExists = true;
            masterRide = rideDoc.data();
            console.log(`\n--- RIDE MAESTRO (${rideDoc.id}) ---`);
            console.log(`MASTER_RIDE_EXISTS`);
            console.log(`STATUS: ${masterRide.status}`);
            console.log(`CITY_KEY: ${masterRide.cityKey}`);
            console.log(`ORIGIN:`, masterRide.origin ? "OK" : "MASTER_RIDE_MISSING_ORIGIN");
            console.log(`DESTINATION:`, masterRide.destination ? "OK" : "MASTER_RIDE_MISSING_DESTINATION");
            console.log(`IS_SHARED_RIDE: ${masterRide.isSharedRide}`);
            console.log(`SHARED_GROUP_ID: ${masterRide.sharedGroupId}`);
            console.log(`DRIVER_ID: ${masterRide.driverId}`);
            console.log(`ASSIGNED_DRIVER_ID: ${masterRide.assignedDriverId}`);
            console.log(`GROUP_GROSS_AMOUNT: ${masterRide.groupGrossAmount}`);
            console.log(`DRIVER_NET_AMOUNT: ${masterRide.driverNetAmount}`);
        } else {
            console.log(`\n--- RIDE MAESTRO ---`);
            console.log(`NO_MASTER_RIDE`);
        }
    } else {
        console.log(`\n--- RIDE MAESTRO ---`);
        console.log(`NO_MASTER_RIDE (ID Not specified)`);
    }

    // 3. Buscar Ofertas
    console.log(`\n--- OFERTAS (rideOffers) ---`);
    let offersSnapshot;
    if (rideId) {
        offersSnapshot = await db.collection('rideOffers').where('rideId', '==', rideId).get();
    } else {
        offersSnapshot = await db.collection('rideOffers').where('sharedGroupId', '==', groupDoc.id).get();
    }

    if (offersSnapshot && !offersSnapshot.empty) {
        console.log(`OFFER_EXISTS`);
        offersSnapshot.docs.forEach(doc => {
            const offer = doc.data();
            console.log(`Offer ID: ${doc.id}`);
            console.log(`OFFER_DRIVER_ID: ${offer.driverId}`);
            console.log(`OFFER_STATUS: ${offer.status}`);
            console.log(`EXPIRES_AT: ${offer.expiresAt?.toDate?.()}`);
            console.log(`ORDERED_STOPS_PREVIEW: ${!!offer.orderedStopsPreview}`);
        });
    } else {
        console.log(`NO_OFFER_CREATED`);
    }

    // 4. Buscar Estado de Eduardo
    console.log(`\n--- ESTADO CONDUCTOR (EDUARDO) ---`);
    const driversSnapshot = await db.collection('users').where('role', '==', 'driver').get();
    let eduardoFound = false;
    for (const doc of driversSnapshot.docs) {
        const driver = doc.data();
        if (driver.name?.toLowerCase().includes('eduardo') || driver.email?.toLowerCase().includes('eduardo')) {
            eduardoFound = true;
            console.log(`Eduardo ID: ${doc.id}`);
            console.log(`ROLE: ${driver.role}`);
            console.log(`CITY_KEY: ${driver.cityKey}`);
            console.log(`ONLINE: ${driver.online ? 'EDUARDO_ONLINE' : 'EDUARDO_OFFLINE'}`);
            console.log(`DRIVER_STATUS: ${driver.driverStatus === 'searching' ? 'AVAILABLE' : 'EDUARDO_BUSY'}`);
            console.log(`ACTIVE_RIDE_ID: ${driver.activeRideId || 'NONE'}`);
            console.log(`CURRENT_RIDE_ID: ${driver.currentRideId || 'NONE'}`);
            console.log(`APPROVED: ${driver.approved ? 'OK' : 'EDUARDO_NOT_APPROVED'}`);
            console.log(`VEHICLE_CAPACITY: ${driver.vehicleCapacity}`);
            console.log(`SERVICE_TYPE: ${driver.serviceType}`);
            console.log(`LOCATION:`, driver.location ? "OK" : "EDUARDO_MISSING_LOCATION");
            console.log(`LAST_LOCATION_UPDATE: ${driver.lastLocationUpdate?.toDate?.()}`);

            // Check drivers_locations
            const locDoc = await db.collection('drivers_locations').doc(doc.id).get();
            if (locDoc.exists) {
                console.log(`DRIVERS_LOCATIONS_EXISTS: YES`);
            } else {
                console.log(`DRIVERS_LOCATIONS_EXISTS: NO (EDUARDO_MISSING_LOCATION)`);
            }

            if (group.cityKey && driver.cityKey !== group.cityKey) {
                console.log(`EDUARDO_CITY_MISMATCH: Group is ${group.cityKey}, Driver is ${driver.cityKey}`);
            }
        }
    }

    if (!eduardoFound) {
         console.log(`No se encontró conductor llamado Eduardo.`);
    }

}

runDiagnosis().then(() => {
    console.log("=== FIN DIAGNÓSTICO ===");
    process.exit(0);
}).catch(console.error);
