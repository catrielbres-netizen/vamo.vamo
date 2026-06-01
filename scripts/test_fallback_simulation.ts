import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
const serviceAccountPath = join(process.cwd(), 'firebase-adminsdk.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Import findNextDriverAndCreateOffer from the compiled functions output
import { findNextDriverAndCreateOffer } from '../functions/src/rides';

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
        notifiedDrivers: ['1BIk2VyuwEZLmHRVbXE52rhFYen2'], // Driver already notified!
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Mock ride created. Invoking matching engine findNextDriverAndCreateOffer()...`);
    
    // Execute matching
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

    // Cleanup mock ride to not pollute the database
    console.log(`\nCleaning up mock ride...`);
    await rideRef.delete();
    console.log(`Simulation finished successfully!`);
    process.exit(0);
}

runSimulation().catch(err => {
    console.error("Simulation failed:", err);
    process.exit(1);
});
