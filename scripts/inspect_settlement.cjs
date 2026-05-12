const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
async function check() {
    const r = await db.collection('rides').doc('prod_52092bee').get();
    const data = r.data();
    console.log('Completed Ride Data:', JSON.stringify(data.completedRide, null, 2));
}
check().catch(console.error);
