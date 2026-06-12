const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/catri/vamo.vamo/service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
async function run() {
    const users = await db.collection('users').get();
    for (const doc of users.docs) {
        const d = doc.data();
        if (d.activeRideId || d.activeSharedRideId || d.activeSharedRequestId || d.activeSharedRideGroupId || d.activeSharedGroupId) {
            console.log('Locked User:', doc.id, d.name || d.firstName);
            console.log('  activeRideId:', d.activeRideId);
            console.log('  activeSharedRideId:', d.activeSharedRideId);
            console.log('  activeSharedRequestId:', d.activeSharedRequestId);
            console.log('  activeSharedRideGroupId:', d.activeSharedRideGroupId);
            console.log('  activeSharedGroupId:', d.activeSharedGroupId);
        }
    }
    console.log('Done');
}
run();
