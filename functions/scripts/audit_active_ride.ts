import * as admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

async function main() {
    const activeRideSnap = await db.collection('rides')
        .where('isSharedRide', '==', true)
        .where('status', 'in', ['driver_assigned', 'in_progress', 'pickup_pending', 'waiting_passenger', 'in_ride'])
        .get();

    if (activeRideSnap.empty) {
        console.log("No active shared rides found.");
        return;
    }

    const doc = activeRideSnap.docs[0];
    const r: any = doc.data();

    console.log(`\n======================================================`);
    console.log(`  AUDITORÍA DEL VIAJE COMPARTIDO ACTIVO`);
    console.log(`======================================================\n`);
    console.log(`- rideId (masterRideId): ${doc.id}`);
    console.log(`- groupId: ${r.sharedGroupId || r.groupId || 'undefined'}`);
    console.log(`- driverId: ${r.driverId}`);
    console.log(`- status: ${r.status}`);
    console.log(`- currentStopIndex: ${r.currentStopIndex !== undefined ? r.currentStopIndex : 'N/A'}`);
    console.log(`- passengerIds (del doc raíz si existe): ${r.passengerIds ? JSON.stringify(r.passengerIds) : 'N/A'}`);
    
    console.log(`\n▶ SHARED_PASSENGERS[]:`);
    if (r.sharedPassengers) {
        r.sharedPassengers.forEach((p: any, i: number) => {
            console.log(`  [${i}] passengerId=${p.passengerId} | requestId=${p.requestId} | status=${p.status}`);
        });
    } else {
        console.log(`  No sharedPassengers array found.`);
    }

    console.log(`\n▶ ORDERED_STOPS[]:`);
    if (r.orderedStops) {
        r.orderedStops.forEach((s: any, i: number) => {
            console.log(`  [${i}] type=${s.type} | passengerId=${s.passengerId} | requestId=${s.requestId} | status=${s.status}`);
        });
    } else {
        console.log(`  No orderedStops array found.`);
    }

    // Try to get group info
    const groupId = r.sharedGroupId || r.groupId;
    if (groupId) {
        const gSnap = await db.collection('shared_ride_groups').doc(groupId).get();
        if (gSnap.exists) {
            const g: any = gSnap.data();
            console.log(`\n▶ GRUPO COMPARTIDO (${groupId}):`);
            console.log(`  - status: ${g.status}`);
            console.log(`  - requestIds: ${JSON.stringify(g.requestIds)}`);
            console.log(`  - passengerIds: ${JSON.stringify(g.passengerIds)}`);
        }
    }
}

main().catch(console.error);
