const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();

admin.auth().getUserByEmail('q@gmail.com').then(async user => {
  const locationRef = db.doc(`drivers_locations/${user.uid}`);
  await locationRef.set({
    isOnline: true,
    status: 'online',
    driverStatus: 'online',
    location: new admin.firestore.GeoPoint(-43.3000, -65.1023),
    cityKey: 'rawson',
    city: 'Rawson',
    isSuspended: false,
    municipalSuspended: false,
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  const userRef = db.doc(`users/${user.uid}`);
  await userRef.set({
    isOnline: true,
    status: 'online',
    driverStatus: 'online',
    approved: true,
    isSuspended: false,
    municipalStatus: 'active'
  }, { merge: true });
  
  const muniRef = db.doc(`municipal_profiles/${user.uid}`);
  await muniRef.set({
    municipalStatus: 'active',
    isSuspended: false
  }, { merge: true });

  console.log('Done');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
