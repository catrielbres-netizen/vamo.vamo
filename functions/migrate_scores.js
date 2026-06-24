const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  console.log("Starting DB Migration for VamO Score...");
  const usersSnapshot = await db.collection('users').get();
  
  const batch = db.batch();
  let count = 0;

  usersSnapshot.forEach(doc => {
    const data = doc.data();
    // Only migrate if not already set, to prevent overwriting if run multiple times
    if (data.reputationScore === undefined) {
      batch.update(doc.ref, {
        reputationScore: 100,
        reputationLevel: 'Excelente' // Starting level
      });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Migrated ${count} users successfully.`);
  } else {
    console.log("No users needed migration.");
  }
  process.exit(0);
}
run();
