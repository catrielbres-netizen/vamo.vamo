const admin = require('firebase-admin');

async function test() {
  try {
    admin.initializeApp();
    const db = admin.firestore();
    const docRef = db.collection('test_ping').doc('ping');
    await docRef.set({ ping: 'pong', timestamp: admin.firestore.FieldValue.serverTimestamp() });
    const snap = await docRef.get();
    console.log("Firebase connection successful:", snap.data());
    process.exit(0);
  } catch (err) {
    console.error("Firebase connection failed:", err.message);
    process.exit(1);
  }
}

test();
