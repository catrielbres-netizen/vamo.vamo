const admin = require('../functions/node_modules/firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../firebase-adminsdk.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const { findNextDriverAndCreateOffer } = require('../functions/lib/rides.js');

// Simple sleep helper
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function runSimulation() {
    const mockRideId = `test_fallback_${Date.now()}`;
    console.log(`=== STARTING FALLBACK SIMULATION ===`);
    console.log(`Creating mock ride document: ${mockRideId}`);

    const originLoc = {
        lat: -43.305571,
        lng: -65.052584,
        address: "Los Coirones 150 (847m from stand)",
        city: "Playa Union"
    };

    const destinationLoc = {
        lat: -43.2949828,
        lng: -65.098288,
        address: "Av. Juan Vucetich 23",
        city: "Rawson"
    };

    // Create mock ride
    const rideRef = db.collection('rides').doc(mockRideId);
    await rideRef.set({
        status: 'searching',
        cityKey: 'rawson',
        city: 'rawson',
        serviceType: 'professional',
        paymentMethod: 'cash',
        passengerId: '8rWJKMMONDbOBm5fYeNHf2bxoUb2',
        passengerName: 'cesar_simulation',
        origin: originLoc,
        destination: destinationLoc,
        stationId: 'stand_aba67b2d',
        stationName: 'Parada musters',
        stationDistanceMeters: 847,
        stationSupportPotential: true,
        stationSupportFallback: false,
        stationDispatch: false,
        stationDispatchStatus: null,
        matchingAttempts: 0,
        notifiedDrivers: [], // Let the cloud trigger populate this first
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Mock ride created in Firestore. Waiting 4 seconds for production cloud trigger to run...`);
    await sleep(4000);

    // Let's check if the cloud trigger created the offer
    const offerId = `${mockRideId}_1BIk2VyuwEZLmHRVbXE52rhFYen2`;
    const offerRef = db.collection('rideOffers').doc(offerId);
    const offerSnap = await offerRef.get();

    if (offerSnap.exists) {
        console.log(`✔ Detected offer ${offerId} created by cloud function. Status: ${offerSnap.data().status}`);
        
        // Simular expiración de la oferta: pasar a status 'expired'
        console.log(`Simulating offer expiration (setting status to 'expired')...`);
        await offerRef.update({
            status: 'expired',
            finalizedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Asegurar que el viaje local sepa que ya fue notificado ese conductor
        await rideRef.update({
            notifiedDrivers: ['1BIk2VyuwEZLmHRVbXE52rhFYen2'],
            matchingAttempts: 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        console.log(`⚠️ Cloud trigger did not create the offer in time. Forcing notifiedDrivers status manually...`);
        await rideRef.update({
            notifiedDrivers: ['1BIk2VyuwEZLmHRVbXE52rhFYen2'],
            matchingAttempts: 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    console.log(`\nInvoking local matching engine findNextDriverAndCreateOffer() with updated code...`);
    
    // Execute matching locally (which should exclude 1BIk2VyuwEZLmHRVbXE52rhFYen2 and trigger fallback to stand!)
    await findNextDriverAndCreateOffer(mockRideId);

    console.log(`\n=== AUDITING RIDE RESULT POST MATCHING ===`);
    const finalSnap = await rideRef.get();
    const finalData = finalSnap.data() || {};
    
    console.log(`- status: ${finalData.status}`);
    console.log(`- lastMatchingFailureReason: ${finalData.lastMatchingFailureReason}`);
    console.log(`- matchingAttempts: ${finalData.matchingAttempts}`);
    console.log(`- stationDispatch: ${finalData.stationDispatch}`);
    console.log(`- stationDispatchType: ${finalData.stationDispatchType}`);
    console.log(`- stationDispatchStatus: ${finalData.stationDispatchStatus}`);
    console.log(`- stationSupportFallback: ${finalData.stationSupportFallback}`);
    console.log(`- stationDispatchReason: ${finalData.stationDispatchReason}`);
    console.log(`- stationDispatchFallbackAt: ${finalData.stationDispatchFallbackAt ? 'set' : 'none'}`);
    console.log(`- stationDispatchExpiresAt: ${finalData.stationDispatchExpiresAt ? finalData.stationDispatchExpiresAt.toDate().toISOString() : 'none'}`);

    // Cleanup mock ride and mock offer to not pollute the database
    console.log(`\nCleaning up mock documents...`);
    await rideRef.delete();
    await offerRef.delete().catch(() => {});
    console.log(`Simulation finished successfully!`);
    process.exit(0);
}

runSimulation().catch(err => {
    console.error("Simulation failed:", err);
    process.exit(1);
});
