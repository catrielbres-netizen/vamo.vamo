const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();
async function check() {
    const d = await db.collection('users').doc('prod_test_driver_part').get();
    const data = d.data();
    console.log('Driver Balance:', data.currentBalance);
    console.log('Daily Earnings:', data.dailyStats?.earningsDaily);
    console.log('Financial Stats:', data.financialStats);
}
check().catch(console.error);
