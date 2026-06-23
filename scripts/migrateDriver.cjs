const admin = require('firebase-admin');

const serviceAccount = require('../service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
  const uid = 'tjDMD6GVF6OYe0h7w4kkjoXaHP93';
  const ownerId = 'EvYVBYpEI7aJ8LnKbBfYPU8iAaL2';
  const vehicleId = 'UFJVHF54';

  console.log(`Checking user: ${uid}`);
  const userRef = db.collection('users').doc(uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    console.log("User does not exist in users collection!");
    return;
  }

  const data = doc.data();
  console.log("Current user data:", JSON.stringify({
    role: data.role,
    driverSubtype: data.driverSubtype,
    vehicleOwnerId: data.vehicleOwnerId,
    vehicleId: data.vehicleId
  }, null, 2));

  let needsUpdate = false;
  const updateData = {};

  if (!data.vehicleOwnerId || data.vehicleOwnerId !== ownerId) {
    updateData.vehicleOwnerId = ownerId;
    needsUpdate = true;
  }

  if (!data.vehicleId || data.vehicleId !== vehicleId) {
    updateData.vehicleId = vehicleId;
    needsUpdate = true;
  }

  if (needsUpdate) {
    console.log("Migrating user with:", updateData);
    await userRef.update(updateData);
    console.log("Migration complete.");
  } else {
    console.log("User already has correct vehicleOwnerId and vehicleId.");
  }
}

migrate().then(() => process.exit(0)).catch(e => {
  console.error("Error migrating:", e);
  process.exit(1);
});
