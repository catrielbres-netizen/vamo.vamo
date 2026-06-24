const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
async function run() {
  const user = await db.collection('users').doc('rfc30gMgJ1hkhNkUTMHAUg977xE3').get();
  console.log('hasMandatoryPendingDocs:', user.data().hasMandatoryPendingDocs);
  console.log('profileCompleted:', user.data().profileCompleted);
  console.log('status:', user.data().status);
  console.log('documentsStatus:', user.data().documentsStatus);
  console.log('docsStatus:', user.data().docsStatus);
  process.exit(0);
}
run();
