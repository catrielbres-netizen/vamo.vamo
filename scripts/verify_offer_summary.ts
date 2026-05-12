import admin from 'firebase-admin';


if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function verifyEnrichment() {
    console.log("--- VERIFYING OFFER ENRICHMENT ---");
    const passengerId = "test_passenger_phase2b";
    const driverId = "test_driver_phase2b";
    const offerId = `offer_verify_${Date.now()}`;

    // 1. Fetch risk summary using the REAL utility
    console.log("Fetching risk summary for passenger...");
    const { getPassengerRiskSummary } = await import('../functions/src/lib/antifraud.ts');
    const summary = await getPassengerRiskSummary(passengerId);
    console.log("Summary:", JSON.stringify(summary, null, 2));

    // 2. Create mock offer with this summary
    console.log("Creating enriched rideOffer...");
    const offerData = {
        rideId: "mock_ride_123",
        driverId,
        passengerId,
        status: 'pending',
        passengerRiskSummary: summary,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('rideOffers').doc(offerId).set(offerData);
    console.log("Offer created with ID:", offerId);

    // 3. Verify in Firestore
    const snap = await db.collection('rideOffers').doc(offerId).get();
    const data = snap.data();
    if (data?.passengerRiskSummary?.trustScore === 50) {
        console.log("SUCCESS: Offer is correctly enriched with trustScore 50.");
    } else {
        console.log("FAILURE: Offer enrichment failed.");
    }

    console.log("--- VERIFICATION COMPLETE ---");
}

verifyEnrichment().catch(console.error);
