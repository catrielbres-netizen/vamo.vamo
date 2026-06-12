import * as admin from 'firebase-admin';

const serviceAccount = require('../service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function cleanup() {
    console.log('Starting cleanup...');
    const users = await db.collection('users').get();
    let cleaned = 0;
    
    // 1. Clean Users
    for (const doc of users.docs) {
        const data = doc.data();
        if (data.activeRideId || data.activeSharedRequestId || data.activeSharedRideGroupId || data.activeSharedGroupId) {
            console.log('Cleaning active state for user:', data.name || doc.id);
            await db.collection('users').doc(doc.id).update({
                activeRideId: admin.firestore.FieldValue.delete(),
                activeSharedRequestId: admin.firestore.FieldValue.delete(),
                activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
                activeSharedGroupId: admin.firestore.FieldValue.delete()
            });
            cleaned++;
        }
    }
    console.log('Cleaned', cleaned, 'users');

    // 2. Clean Active Shared Requests
    const reqs = await db.collection('shared_ride_requests').where('status', 'in', ['forming', 'pending_confirmation', 'confirmed', 'assigned', 'pickup_pending', 'picked_up', 'dropoff_pending', 'grouped', 'pending_group']).get();
    let reqsCleaned = 0;
    for (const doc of reqs.docs) {
        console.log('Cancelling request:', doc.id);
        await db.collection('shared_ride_requests').doc(doc.id).update({
            status: 'cancelled',
            cancelReason: 'admin_cleanup'
        });
        reqsCleaned++;
    }
    console.log('Cancelled', reqsCleaned, 'requests');

    // 3. Clean Active Shared Groups
    const groups = await db.collection('shared_ride_groups').where('status', 'in', ['forming', 'pending_passenger_confirmation', 'searching_driver', 'driver_assigned', 'ready_for_driver', 'ready_for_driver_dispatch', 'dispatched']).get();
    let groupsCleaned = 0;
    for (const doc of groups.docs) {
        console.log('Cancelling group:', doc.id);
        await db.collection('shared_ride_groups').doc(doc.id).update({
            status: 'cancelled'
        });
        groupsCleaned++;
    }
    console.log('Cancelled', groupsCleaned, 'groups');

    // 4. Clean Active Rides
    const rides = await db.collection('rides').where('status', 'in', ['pending', 'accepted', 'arrived', 'in_progress']).get();
    let ridesCleaned = 0;
    for (const doc of rides.docs) {
        console.log('Cancelling ride:', doc.id);
        await db.collection('rides').doc(doc.id).update({
            status: 'cancelled',
            cancelReason: 'admin_cleanup'
        });
        ridesCleaned++;
    }
    console.log('Cancelled', ridesCleaned, 'rides');

    console.log('Cleanup complete!');
}
cleanup().catch(console.error);
