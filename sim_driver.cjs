const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
    const uid = 'rTfLc4wzaZhqdp0uw9TiezR0xNK2';
    
    await db.collection('users').doc(uid).update({
        isOnline: true,
        status: 'active',
        approved: true,
        municipalStatus: 'active'
    });
    
    await db.collection('public_driver_profiles').doc(uid).set({
        driverId: uid,
        name: 'Cesar Bres',
        cityKey: 'rio_gallegos',
        isActive: true,
        vehicleModel: 'Auto Test',
        vehiclePlate: 'ABC 123'
    }, { merge: true });

    console.log('Driver set online in Rio Gallegos. Overriding location for next 10 mins...');
    
    for (let i = 0; i < 120; i++) {
        await db.collection('drivers_locations').doc(uid).set({
            cityKey: 'rio_gallegos',
            serviceType: 'taxi',
            driverSubtype: 'professional',
            status: 'online',
            location: new admin.firestore.GeoPoint(-51.6226, -69.2181),
            geohash: '4qyf2fkut3',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log('Finished simulating.');
}
run().catch(console.error);
