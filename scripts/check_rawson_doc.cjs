const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
async function check() {
    const s = await db.collection('cities').doc('rawson').get();
    console.log(JSON.stringify(s.data(), null, 2));
}
check().catch(console.error);
