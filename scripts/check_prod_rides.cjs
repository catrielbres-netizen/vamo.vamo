const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
async function check() {
    const s = await db.collection('rides').where('passengerId', '==', 'prod_test_pass').get();
    console.log('Found:', s.size);
    s.docs.forEach(d => console.log(d.id, d.data().status, d.data().settledAt || 'UNSETTLED'));
}
check().catch(console.error);
