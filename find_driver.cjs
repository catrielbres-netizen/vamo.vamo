const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
    const usersSnap = await db.collection('users').where('role', '==', 'driver').get();
    console.log(`Found ${usersSnap.size} drivers`);
    usersSnap.forEach(doc => {
        const data = doc.data();
        console.log(`Driver: ${data.name} - ${doc.id} - City: ${data.cityKey}`);
    });
}
run().catch(console.error);
