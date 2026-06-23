import * as admin from 'firebase-admin';

// Initialize the app if it hasn't been initialized
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'studio-6697160840-7c67f'
  });
}

const db = admin.firestore();

async function run() {
  const rides = await db.collection('rides').orderBy('createdAt', 'desc').limit(1).get();
  if (rides.empty) {
    console.log('No rides found');
    return;
  }
  const ride = rides.docs[0];
  console.log('--- LATEST RIDE ---');
  console.log(JSON.stringify({ id: ride.id, ...ride.data() }, null, 2));

  const offers = await db.collection('rides').doc(ride.id).collection('offers').get();
  console.log('--- OFFERS ---');
  offers.docs.forEach(doc => {
    console.log(JSON.stringify({ id: doc.id, ...doc.data() }, null, 2));
  });
}

run().catch(console.error);
