const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function inspect() {
    console.log('=== INSPECCIÓN DE VIAJES RECIENTES ===\n');

    const snap = await db.collection('rides')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

    if (snap.empty) {
        console.log('No hay viajes.');
        process.exit(0);
    }

    for (const doc of snap.docs) {
        const d = doc.data();
        console.log(`\n--------------------------------------`);
        console.log(`Ride ID: ${doc.id}`);
        console.log(`  status: ${d.status}`);
        console.log(`  passengerId: ${d.passengerId}`);
        console.log(`  cityKey: ${d.cityKey}`);
        console.log(`  pricingMunicipalityKey: ${d.pricingMunicipalityKey}`);
        console.log(`  serviceType: ${d.serviceType}`);
        console.log(`  isSimulation: ${d.isSimulation}`);
        console.log(`  matchingAttempts: ${d.matchingAttempts}`);
        console.log(`  lastMatchingFailureReason: ${d.lastMatchingFailureReason}`);
        console.log(`  cancelReason: ${d.cancelReason}`);
        console.log(`  createdAt: ${d.createdAt?.toDate?.()?.toISOString()}`);
        console.log(`  origin: ${d.origin?.lat}, ${d.origin?.lng} (${d.origin?.address})`);
        console.log(`  destination: ${d.destination?.lat}, ${d.destination?.lng} (${d.destination?.address})`);
        console.log(`  notifiedDrivers: ${d.notifiedDrivers?.join(', ') || 'ninguno'}`);

        // Buscar offers de este ride
        const offersSnap = await db.collection('rideOffers')
            .where('rideId', '==', doc.id)
            .get();
        console.log(`  Offers creadas (${offersSnap.size}):`);
        for (const offer of offersSnap.docs) {
            const o = offer.data();
            console.log(`    - Offer ID: ${offer.id}`);
            console.log(`      driverId: ${o.driverId}`);
            console.log(`      status: ${o.status}`);
            console.log(`      sentAt: ${o.sentAt?.toDate?.()?.toISOString()}`);
            console.log(`      expiresAt: ${o.expiresAt?.toDate?.()?.toISOString()}`);
        }
    }

    console.log('\n=== FIN INSPECCIÓN ===');
    process.exit(0);
}

inspect().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
