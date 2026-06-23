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
        return;
    }

    const doc = activeRideSnap.docs[0];
    const r: any = doc.data();

    console.log(`\n▶ ORDERED_STOPS[] completado con 'order':`);
    if (r.orderedStops) {
        r.orderedStops.forEach((s: any, i: number) => {
            console.log(`  [${i}] type=${s.type} | order=${s.order} | passengerId=${s.passengerId} | status=${s.status}`);
        });
    }
}

main().catch(console.error);
