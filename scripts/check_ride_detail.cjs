const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
async function check() {
    const r = await db.collection('rides').doc('prod_f93e780f').get();
    console.log('Ride Data:', JSON.stringify(r.data(), null, 2));
}
check().catch(console.error);
