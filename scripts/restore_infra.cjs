
const admin = require('firebase-admin');
const serviceAccount = require('C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function restore() {
  console.log('Restoring minimal infrastructure...');
  
  await db.doc('config/system').set({
    matchingEnabled: true,
    expressEnabled: true,
    globalMaintenance: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await db.doc('config/matching').set({
    rawsonBroadcastEnabled: true,
    trelewBroadcastEnabled: false,
    playaUnionBroadcastEnabled: true,
    maxMatchingAttempts: 10,
    offerDurationSeconds: 20,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await db.doc('platform_config/global').set({
    minDriverBalance: 100,
    appVersion: '1.0.0',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log('Restore complete.');
}

restore().catch(console.error);
