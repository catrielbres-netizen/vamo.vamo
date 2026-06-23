const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
    await db.collection('settings').doc('pricing').set({
        rio_gallegos: {
            DAY_BASE_FARE: 800,
            NIGHT_BASE_FARE: 1000,
            DAY_KM_FARE: 600,
            NIGHT_KM_FARE: 800,
            WAITING_FARE_PER_MIN: 50,
            MINIMUM_FARE: 1200,
            NIGHT_SHIFT_START_HOUR: 22,
            NIGHT_SHIFT_END_HOUR: 6,
            dynamicMultiplier: 1.0,
            isDynamicActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true });
    console.log('Pricing set for Rio Gallegos!');
}
run().catch(console.error);
