import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'studio-6697160840-7c67f' });
const db = admin.firestore();

async function run() {
  const usersSnap = await db.collection('users').where('activeRideId', '>=', '').get();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.activeRideId || data.activeSharedRequestId) {
        console.log(`User ${doc.id} has activeRideId: ${data.activeRideId}, shared: ${data.activeSharedRequestId}`);
        const rideId = data.activeRideId;
        
        let shouldClean = false;

        if (rideId) {
            if (rideId.startsWith('shared_group_')) {
                const groupSnap = await db.collection('shared_ride_groups').doc(rideId).get();
                if (!groupSnap.exists || groupSnap.data()?.status === 'completed' || groupSnap.data()?.status === 'cancelled') {
                    shouldClean = true;
                }
            } else {
                const rideSnap = await db.collection('rides').doc(rideId).get();
                if (!rideSnap.exists || rideSnap.data()?.status === 'completed' || rideSnap.data()?.status === 'cancelled') {
                    shouldClean = true;
                }
            }
        }
        
        if (!rideId && data.activeSharedRequestId) {
            const reqSnap = await db.collection('shared_ride_requests').doc(data.activeSharedRequestId).get();
            if (!reqSnap.exists || reqSnap.data()?.status === 'completed' || reqSnap.data()?.status === 'cancelled' || reqSnap.data()?.status === 'dropped_off') {
                shouldClean = true;
            }
        }

        if (shouldClean) {
            console.log(`Cleaning user ${doc.id}...`);
            await doc.ref.update({
                activeRideId: admin.firestore.FieldValue.delete(),
                activeSharedRequestId: admin.firestore.FieldValue.delete(),
                activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
                sharedRideStatus: admin.firestore.FieldValue.delete()
            });
        }
    }
  }
  console.log('Done');
}

run().catch(console.error);
