
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function checkCities() {
    const snap = await db.collection('cities').limit(5).get();
    snap.forEach(doc => {
        console.log(`City Document ID: "${doc.id}"`);
    });
}

checkCities().catch(console.error);
