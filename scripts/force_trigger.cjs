const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
async function run() {
    await db.collection('rides').doc('prod_f93e780f').update({ forceTrigger: Date.now() });
    console.log('Updated prod_f93e780f');
}
run().catch(console.error);
