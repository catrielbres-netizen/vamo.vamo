import * as admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// Need to safely import findNextDriverAndCreateOffer without triggering functions triggers since we're just importing it.
import { findNextDriverAndCreateOffer } from './src/rides';
import { Timestamp } from 'firebase-admin/firestore';

async function main() {
    console.log("--- INICIANDO ENTORNO DE PRUEBA REAL ---");
    const passengerId = 'test_passenger_1';
    const driverId = 'test_driver_1';

    // 1. Setup Driver
    const origin = { lat: -43.3002, lng: -65.1023, address: 'Rawson Base', city: 'rawson', cityKey: 'rawson' };
    
    console.log("1. Configurando Conductor simulado...");
    await db.doc(`users/${driverId}`).set({
        role: 'driver',
        approved: true,
        driverStatus: 'online',
        isSuspended: false,
        emailVerified: true,
        currentBalance: 0,
        servicesOffered: { normal: true, express: true },
        city: 'Rawson'
    });

    await db.doc(`drivers_locations/${driverId}`).set({
        driverStatus: 'online',
        currentLocation: { lat: -43.3005, lng: -65.1025 }, // VERY CLOSE TO ORIGIN
        geohash: geohashForLocation([-43.3005, -65.1025]),
        updatedAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        pendingOffers: 0,
        approved: true,
        isSuspended: false
        // NO CITYKEY INTENTIONALLY TO PROVE FIX WORKS
    });
    
    console.log("2. Creando Viaje desde pasajero simulado...");
    const rideRef = db.collection('rides').doc();
    const rideId = rideRef.id;

    await rideRef.set({
        passengerId,
        origin,
        destination: { lat: -43.2980, lng: -65.1000, address: 'Destino, Rawson' },
        serviceType: 'normal',
        status: 'searching',
        city: 'rawson',
        cityKey: 'rawson',
        matchingAttempts: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        pricing: {
            estimated: { total: 1000 }
        }
    });

    console.log(`3. Viaje creado: rides/${rideId}`);
    console.log(`--- [MATCH_DEBUG] invoking matcher ---`);
    
    // INVOKE MATCHING
    await findNextDriverAndCreateOffer(rideId);
    
    console.log(`--- [MATCH_DEBUG] invoke finished ---`);

    // Verify Output
    console.log("4. Verificando rideOffers...");
    const offersSnap = await db.collection('rideOffers').where('rideId', '==', rideId).get();
    if (offersSnap.empty) {
        console.log("-> NO se crearon rideOffers.");
    } else {
        offersSnap.forEach(doc => {
            const data = doc.data();
            console.log(`-> rideOffer Creada: ${doc.id}`);
            console.log(`   - Status: ${data.status}`);
            console.log(`   - DriverId: ${data.driverId}`);
        });
    }

    const rideSnap = await rideRef.get();
    console.log("5. Estado final del Ride:");
    console.log("   - Status:", rideSnap.data()?.status);
    console.log("   - CurrentOfferedDriverId:", rideSnap.data()?.currentOfferedDriverId);

}

main().then(() => {
    console.log("DONE");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
