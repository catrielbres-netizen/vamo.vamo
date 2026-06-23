const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkProfile() {
  const user = await db.collection('users').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3').get();
  console.log(`\n=== USER PROFILE ===`);
  const data = user.data();
  console.log("currentBalance:", data.currentBalance);

  const loc = await db.collection('drivers_locations').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3').get();
  console.log("walletBalance in loc:", loc.data().walletBalance);

  process.exit(0);
}

checkProfile();
