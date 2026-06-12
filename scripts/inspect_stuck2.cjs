const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/catri/vamo.vamo/service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
async function run() {
    console.log('Querying users...');
    const users = await db.collection('users').get();
    for (const doc of users.docs) {
        const data = doc.data();
        if (data.activeRideId || data.activeSharedRideId || data.activeSharedGroupId || data.activeSharedRequestId) {
            console.log(`User ${doc.id} (${data.firstName} ${data.lastName})`);
            console.log(`  activeRideId: ${data.activeRideId}`);
            console.log(`  activeSharedRideId: ${data.activeSharedRideId}`);
            console.log(`  activeSharedGroupId: ${data.activeSharedGroupId}`);
            console.log(`  activeSharedRequestId: ${data.activeSharedRequestId}`);
            
            await doc.ref.update({
                activeRideId: admin.firestore.FieldValue.delete(),
                activeSharedRideId: admin.firestore.FieldValue.delete(),
                activeSharedGroupId: admin.firestore.FieldValue.delete(),
                activeSharedRequestId: admin.firestore.FieldValue.delete()
            });
            console.log('  -> CLEARED');
        }
    }
    console.log('Done');
}
run();
