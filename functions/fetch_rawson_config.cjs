const admin = require('firebase-admin');
const serviceAccount = require('./vamo-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function fetchRawson() {
    const firestore = admin.firestore();
    const snap = await firestore.collection('cities').doc('rawson').get();
    
    if (!snap.exists) {
        console.log("rawson does not exist");
        return;
    }
    
    const data = snap.data();
    console.log("Rawson Config:", JSON.stringify(data.config || {}, null, 2));
}

fetchRawson().catch(console.error);
