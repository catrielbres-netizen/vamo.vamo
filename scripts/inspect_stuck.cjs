const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/catri/vamo.vamo/service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
async function run() {
    console.log('Querying active rides...');
    const users = await db.collection('users').where('activeRideId', '!=', null).get();
    for (const doc of users.docs) {
        const data = doc.data();
        const rideId = data.activeRideId;
        const ride = await db.collection('rides').doc(rideId).get();
        console.log(`User ${doc.id} (${data.firstName} ${data.lastName})`);
        console.log(`  activeRideId: ${rideId}`);
        console.log(`  ride exists: ${ride.exists}`);
        if (ride.exists) {
            console.log(`  ride status: ${ride.data().status}`);
            console.log(`  isSharedRide: ${ride.data().isSharedRide}`);
            console.log(`  receiptsGenerated: ${ride.data().sharedReceiptsGenerated}`);
        }
        console.log(`  activeSharedRideId: ${data.activeSharedRideId}`);
        console.log(`  activeSharedGroupId: ${data.activeSharedGroupId}`);
        console.log(`  activeSharedRequestId: ${data.activeSharedRequestId}`);
    }
    console.log('Done');
}
run();
