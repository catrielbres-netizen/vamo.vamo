const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function inspect() {
    console.log('=== INSPECCIÓN PASAJERO ESPECÍFICO ===\n');

    const passengerId = '8rWJKMMONDbOBm5fYeNHf2bxoUb2';
    const docSnap = await db.doc(`users/${passengerId}`).get();

    if (!docSnap.exists) {
        console.log(`❌ No existe el usuario en users/${passengerId}`);
    } else {
        const d = docSnap.data();
        console.log('Datos del pasajero:');
        console.log(JSON.stringify(d, null, 2));

        // Consultar su billetera
        const walletSnap = await db.collection('wallets')
            .where('userId', '==', passengerId)
            .get();
        if (walletSnap.empty) {
            console.log('\n❌ No existe billetera para este usuario.');
        } else {
            console.log('\nDatos de Billetera:');
            walletSnap.forEach(w => {
                console.log(JSON.stringify(w.data(), null, 2));
            });
        }
    }

    console.log('\n=== FIN INSPECCIÓN ===');
    process.exit(0);
}

inspect().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
