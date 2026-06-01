const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function inspect() {
    console.log('=== INSPECCIÓN LOCATION CONDUCTOR ===\n');

    const driverId = '1BIk2VyuwEZLmHRVbXE52rhFYen2';
    const docSnap = await db.doc(`drivers_locations/${driverId}`).get();

    if (!docSnap.exists) {
        console.log(`❌ No existe en drivers_locations/${driverId}`);
    } else {
        const d = docSnap.data();
        console.log('Datos de drivers_locations:');
        console.log(JSON.stringify(d, null, 2));
        
        if (d.lastSeenAt) {
            const lastSeen = d.lastSeenAt.toDate();
            console.log(`\nlastSeenAt (Date): ${lastSeen.toISOString()}`);
            console.log(`Diferencia en minutos: ${(Date.now() - lastSeen.getTime()) / (60 * 1000)}`);
        }
    }

    console.log('\n=== FIN INSPECCIÓN ===');
    process.exit(0);
}

inspect().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
