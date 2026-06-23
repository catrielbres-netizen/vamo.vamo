const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/catri/vamo.vamo/service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
async function run() {
    const users = await db.collection('users').where('activeRideId', '!=', null).get();
    for (const doc of users.docs) {
        const data = doc.data();
        const ride = await db.collection('rides').doc(data.activeRideId).get();
        if (!ride.exists || ride.data().status === 'completed') {
            console.log('Clearing user', doc.id, 'stuck on completed/nonexistent ride', data.activeRideId);
            await doc.ref.update({
                activeRideId: admin.firestore.FieldValue.delete(),
                activeSharedRideId: admin.firestore.FieldValue.delete(),
                activeSharedGroupId: admin.firestore.FieldValue.delete(),
                activeSharedRequestId: admin.firestore.FieldValue.delete()
            });
        }
    }
    console.log('Done');
}
run();
