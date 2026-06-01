const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkConfig() {
    console.log('=== VERIFICACIÓN CONFIGURACIÓN FIRESTORE SHARED RIDE ===\n');

    const docSnap = await db.doc('features/sharedRide').get();
    if (!docSnap.exists) {
        console.log('⚠️  El documento features/sharedRide NO EXISTE en Firestore.');
    } else {
        const data = docSnap.data();
        console.log('Configuración actual en features/sharedRide:');
        console.log(JSON.stringify(data, null, 2));
    }

    console.log('\n=== FIN VERIFICACIÓN ===');
    process.exit(0);
}

checkConfig().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
