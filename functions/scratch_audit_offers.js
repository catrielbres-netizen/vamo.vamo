
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkOffers() {
    console.log("--- RECENT RIDE OFFERS ---");
    const snap = await db.collection('rideOffers').orderBy('sentAt', 'desc').limit(10).get();
    snap.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id} | Status: ${data.status} | Reason: ${data.reason || 'N/A'} | RideId: ${data.rideId}`);
    });
}

checkOffers().catch(console.error);
