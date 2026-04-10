import * as admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// We need to import the handler. In handlers.ts it's exported as onRideSettlementV6
import { onRideSettlementV6 } from './src/handlers';
import { findNextDriverAndCreateOffer } from './src/rides';
import { Timestamp } from 'firebase-admin/firestore';

async function main() {
    console.log("--- TEST POST VIAJE REAL ---");
    const passengerId = 'test_passenger_1';
    const driverId = 'test_driver_1';

    await db.doc(`users/${passengerId}`).set({
        role: 'passenger',
        activeRideId: 'RIDE_MOCK'
    });

    console.log("1. Configurando Conductor simulado...");
    await db.doc(`users/${driverId}`).set({
        role: 'driver',
        approved: true,
        driverStatus: 'in_ride', // Simulating currently in a ride
        activeRideId: 'RIDE_MOCK',
        isSuspended: false,
        emailVerified: true,
        currentBalance: 1000,
        servicesOffered: { normal: true, express: true },
        city: 'Rawson'
    });

    await db.doc(`drivers_locations/${driverId}`).set({
        driverStatus: 'in_ride',
        currentLocation: { lat: -43.3005, lng: -65.1025 },
        geohash: geohashForLocation([-43.3005, -65.1025]),
        updatedAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        pendingOffers: 0,
        approved: true,
        isSuspended: false
    });

    console.log("2. Simular Viaje (aceptado -> completed)");
    const rideRef = db.collection('rides').doc();
    const rideId = rideRef.id;

    // We will artificially construct the Firestore "before" and "after" state to feed the handler.
    const beforeData = {
        passengerId,
        driverId,
        status: 'in_progress',
        cityKey: 'rawson',
        serviceType: 'normal',
        origin: { lat: -43.3, lng: -65.1 },
        destination: { lat: -43.2, lng: -65.0 },
    };

    const afterData = {
        ...beforeData,
        status: 'completed',
        completedAt: Timestamp.now()
    };

    await rideRef.set(afterData);

    console.log("3. Disparando onRideSettlementV6 manualmente...");
    
    // Simulate FirestoreEvent
    const mockEvent = {
        data: {
            before: { data: () => beforeData },
            after: { data: () => afterData }
        },
        params: { rideId }
    } as any;

    try {
        // Trigger the internal handler function logic.
        // For wrapping Cloud Functions v2 directly, their actual logic is usually accessible via `.run(event)` or just invoking it if it's a raw function.
        // Firebase Cloud Functions v2 exports a wrapped function. We can try `.run()` or passing the event if we exported the logic separately.
        // Because it's wrapped, it should have a `.run()` method for unit testing.
        await (onRideSettlementV6 as any).run(mockEvent);
    } catch (e:any) {
        console.error("Error running Settlement:", e.message);
    }
    
    console.log("4. FINALIZADO SETTLEMENT. Verificando estado post-viaje en DB.");
    const driverSnap = await db.doc(`users/${driverId}`).get();
    const driverLocSnap = await db.doc(`drivers_locations/${driverId}`).get();

    console.log("--- ESTADO ACTUAL DEL CONDUCTOR TRAS EL VIAJE ---");
    console.log("users/test_driver_1 -> driverStatus:", driverSnap.data()?.driverStatus);
    console.log("users/test_driver_1 -> activeRideId:", driverSnap.data()?.activeRideId);
    console.log("drivers_locations/test_driver_1 -> driverStatus:", driverLocSnap.data()?.driverStatus);

    console.log("\n5. Creando un SEGUNDO VIAJE simulado cerquita y lanzando matcher...");
    
    const secondRideRef = db.collection('rides').doc();
    const secondRideId = secondRideRef.id;
    
    // Conductor is simulated to be near.
    await secondRideRef.set({
        passengerId: 'passenger_2',
        origin: { lat: -43.3005, lng: -65.1025 },
        destination: { lat: -43.2980, lng: -65.1000, address: 'Otro lado' },
        serviceType: 'normal',
        status: 'searching',
        city: 'rawson',
        cityKey: 'rawson',
        matchingAttempts: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        pricing: { estimated: { total: 1200 } }
    });

    console.log("-> [MATCH_DEBUG] invoking findNextDriverAndCreateOffer() para viaje:", secondRideId);
    await findNextDriverAndCreateOffer(secondRideId);

    const offersSnap = await db.collection('rideOffers').where('rideId', '==', secondRideId).get();
    console.log("-> Ofertas creadas después del segundo viaje:");
    if (offersSnap.empty) {
        console.log("NINGUNA! (Fallo)");
    } else {
        offersSnap.forEach(doc => {
            console.log(`[RIDE_OFFER] ID=${doc.id} | Status: ${doc.data().status} | Driver: ${doc.data().driverId}`);
        });
    }

}

main().then(() => {
    console.log("DONE");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
