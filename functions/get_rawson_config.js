const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function checkRawson() {
  const docRef = db.collection('cities').doc('rawson');
  const snap = await docRef.get();
  if (snap.exists) {
    console.log(JSON.stringify(snap.data(), null, 2));
  } else {
    console.log('Doc rawson does not exist');
  }
}

checkRawson().catch(console.error).finally(() => process.exit(0));
