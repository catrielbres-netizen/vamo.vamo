const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function check() {
    console.log('=== VERIFICACIÓN DE PASAJEROS ACTIVOS ===\n');

    const snap = await db.collection('users')
        .where('role', '==', 'passenger')
        .get();

    console.log(`Total pasajeros en users: ${snap.size}`);

    let activeCount = 0;
    snap.forEach(doc => {
        const d = doc.data();
        const hasActiveRide = !!d.activeRideId;
        const hasActiveShared = !!d.activeSharedRequestId || !!d.activeSharedRideGroupId;
        
        if (hasActiveRide || hasActiveShared || d.isOnline) {
            activeCount++;
            console.log(`\nPasajero ID: ${doc.id}`);
            console.log(`  Nombre: ${d.name} ${d.surname || ''}`);
            console.log(`  email: ${d.email}`);
            console.log(`  cityKey: ${d.cityKey}`);
            console.log(`  isOnline: ${d.isOnline}`);
            console.log(`  activeRideId: ${d.activeRideId || 'ninguno'}`);
            console.log(`  activeSharedRequestId: ${d.activeSharedRequestId || 'ninguno'}`);
            console.log(`  activeSharedRideGroupId: ${d.activeSharedRideGroupId || 'ninguno'}`);
        }
    });

    console.log(`\nPasajeros activos o online encontrados: ${activeCount}`);
    console.log('\n=== FIN VERIFICACIÓN ===');
    process.exit(0);
}

check().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
