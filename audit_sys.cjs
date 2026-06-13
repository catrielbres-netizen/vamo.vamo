const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkConfig() {
  const sysSnap = await db.doc('system_config/global').get();
  console.log("system_config/global:", sysSnap.data());
  process.exit(0);
}

checkConfig();
