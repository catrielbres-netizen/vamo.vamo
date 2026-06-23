import * as admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

async function main() {
    const activeStatuses = ['pending_group', 'forming', 'grouped', 'confirmed', 'assigned', 'driver_assigned', 'pickup_pending', 'picked_up'];
    const snap = await db.collection('shared_ride_requests')
        .where('status', 'in', activeStatuses)
        .get();

    const results = [];
    for (const doc of snap.docs) {
        const r: any = doc.data();
        let groupStatus = 'NO_GROUP';
        if (r.groupId) {
            const gSnap = await db.doc(`shared_ride_groups/${r.groupId}`).get();
            if (gSnap.exists) groupStatus = gSnap.data()?.status || 'NO_STATUS';
        }

        const terminalGroupStatuses = ['cancelled', 'expired', 'completed'];
        const isOrphan = !r.groupId;
        const groupIsTerminal = r.groupId && terminalGroupStatuses.includes(groupStatus);
        
        // Also include requests that have been active for > 60 min (which were marked HIGH or MEDIUM in audit)
        const createdAt = r.createdAt?._seconds ? r.createdAt._seconds * 1000 : null;
        const ageMinutes = createdAt ? Math.round((Date.now() - createdAt) / 60000) : -1;
        const isOld = ageMinutes > 60;

        if (isOrphan || groupIsTerminal || isOld) {
            let userSharedState = {};
            if (r.passengerId) {
                const uSnap = await db.doc(`users/${r.passengerId}`).get();
                if (uSnap.exists) {
                    const u: any = uSnap.data();
                    userSharedState = {
                        activeRideId: u.activeRideId || null,
                        activeSharedRequestId: u.activeSharedRequestId || null,
                        activeSharedRideGroupId: u.activeSharedRideGroupId || null
                    };
                }
            }

            results.push({
                id: doc.id,
                status: r.status,
                groupId: r.groupId || null,
                groupStatus,
                passengerId: r.passengerId || null,
                ageMinutes,
                userSharedState,
                driverAssigned: !!r.driverId,
                finalRideId: r.finalRideId || null
            });
        }
    }

    console.log(JSON.stringify(results, null, 2));
}

main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
