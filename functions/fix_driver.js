const admin = require('firebase-admin');

// Initialize with the project ID from .firebaserc and default credentials
admin.initializeApp({
  projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

async function run() {
  const email = 'premium@gmail.com';
  console.log(`Searching for driver with email: ${email}...`);
  
  const usersSnap = await db.collection('users').where('email', '==', email).get();
  
  if (usersSnap.empty) {
    console.error('ERROR: Driver not found in users collection.');
    process.exit(1);
  }

  const userDoc = usersSnap.docs[0];
  const uid = userDoc.id;
  const userData = userDoc.data();

  console.log(`Found driver! UID: ${uid}, Name: ${userData.name}`);

  // Update 1: Set city in user profile
  console.log('Updating city to "Trelew" in users collection...');
  await db.doc(`users/${uid}`).update({
    city: 'Trelew'
  });

  // Update 2: Set currentLocation and status in drivers_locations
  console.log('Updating location to Trelew (-43.2489, -65.3051) in drivers_locations...');
  await db.doc(`drivers_locations/${uid}`).set({
    currentLocation: { lat: -43.2489, lng: -65.3051 },
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    driverStatus: 'online', 
    approved: true,
    isSuspended: false
  }, { merge: true });

  console.log('SUCCESS: Mock driver data is now consistent and located in Trelew.');
}

run().catch(err => {
  console.error('ERROR during update:', err);
  process.exit(1);
});
