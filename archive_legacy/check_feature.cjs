const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
    const snap = await db.doc('features/sharedRide').get();
    console.log('featureConfig:', JSON.stringify(snap.data(), null, 2));
    
    // También verificar los users de test
    const CESAR_UID = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
    const MARIA_UID = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
    const c = (await db.doc(`users/${CESAR_UID}`).get()).data();
    const m = (await db.doc(`users/${MARIA_UID}`).get()).data();
    console.log('\nCésar cityKey:', c?.cityKey, '| sharedRideAlphaTester:', c?.sharedRideAlphaTester);
    console.log('María  cityKey:', m?.cityKey, '| sharedRideAlphaTester:', m?.sharedRideAlphaTester);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
