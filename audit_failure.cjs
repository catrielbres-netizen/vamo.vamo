const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkFailure() {
  const ride = await db.collection('rides').doc('Pe1ctzoHo6SXxxUSItBO').get();
  const data = ride.data();
  console.log("lastMatchingFailureReason:", data.lastMatchingFailureReason);
  console.log("matchingAttempts:", data.matchingAttempts);
  console.log("searchRadiusKmUsed:", data.searchRadiusKmUsed);
  process.exit(0);
}

checkFailure();
