
const admin = require('firebase-admin');
const serviceAccount = require('C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runAudit() {
  const doc = await db.doc('config/matching').get();
  console.log('--- CONFIG/MATCHING ---');
  if (doc.exists) {
    console.log(JSON.stringify(doc.data(), null, 2));
  } else {
    console.log('Document config/matching does NOT exist.');
  }
}

runAudit().catch(console.error);
