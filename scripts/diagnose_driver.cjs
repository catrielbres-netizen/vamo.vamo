const admin = require('firebase-admin');
const path = require('path');
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('service-account.json');

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'studio-6697160840-7c67f'
  });
}

const db = admin.firestore();

async function run() {
  const driverId = 'lqJ6fP8HxKerF7f4u0iK41dH2lw2';
  const rideId = '5n3gHc0wrEBw1FE9InDT';

  console.log('--- USER DOC (lqJ6...) ---');
  const userSnap = await db.collection('users').doc(driverId).get();
  console.log(JSON.stringify(userSnap.data(), null, 2));

  console.log('--- DRIVER LOCATION DOC (lqJ6...) ---');
  const locSnap = await db.collection('drivers_locations').doc(driverId).get();
  console.log(JSON.stringify(locSnap.data(), null, 2));

  console.log('--- OFFERS FOR RIDE ---');
  const offersSnap = await db.collection('rides').doc(rideId).collection('offers').get();
  if (offersSnap.empty) {
    console.log('No offers found for ride: ' + rideId);
  } else {
    offersSnap.docs.forEach(doc => {
      console.log(JSON.stringify({ id: doc.id, ...doc.data() }, null, 2));
    });
  }
}

run().catch(console.error);
