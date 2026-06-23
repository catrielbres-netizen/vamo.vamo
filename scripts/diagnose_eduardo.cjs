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
  const driverId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

  console.log('--- USER DOC (Eduardo) ---');
  const userSnap = await db.collection('users').doc(driverId).get();
  console.log(JSON.stringify(userSnap.data(), null, 2));

  console.log('--- DRIVER LOCATION DOC (Eduardo) ---');
  const locSnap = await db.collection('drivers_locations').doc(driverId).get();
  console.log(JSON.stringify(locSnap.data(), null, 2));
}

run().catch(console.error);
