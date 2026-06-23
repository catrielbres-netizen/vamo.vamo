const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MARIA_UID  = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const CESAR_UID  = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';

async function main() {
    const [m, c] = await Promise.all([
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${CESAR_UID}`).get(),
    ]);
    const md = m.data(), cd = c.data();

    console.log('\n=== CAMPOS CLAVE USUARIOS ===');
    const fields = ['sharedRideStatus','activeSharedRequestId','activeSharedRideGroupId','activeRideId','activeSharedRideId'];
    for (const f of fields) {
        console.log(`  César [${f}]:  ${cd?.[f] ?? 'VACÍO'}`);
        console.log(`  María [${f}]:  ${md?.[f] ?? 'VACÍO'}`);
    }

    // Auditar request de María
    const mariaReqId = md?.activeSharedRequestId;
    if (mariaReqId) {
        const req = await db.doc(`shared_ride_requests/${mariaReqId}`).get();
        const rd = req.data();
        console.log(`\n=== REQUEST DE MARÍA [${mariaReqId}] ===`);
        console.log('  status:       ', rd?.status);
        console.log('  seatCount:    ', rd?.seatCount);
        console.log('  selectedSeats:', JSON.stringify(rd?.selectedSeats));
        console.log('  groupId:      ', rd?.groupId);
        console.log('  sharedFareEstimate:', rd?.sharedFareEstimate);
    }

    // Auditar request de César
    const cesarReqId = cd?.activeSharedRequestId;
    if (cesarReqId) {
        const req = await db.doc(`shared_ride_requests/${cesarReqId}`).get();
        const rd = req.data();
        console.log(`\n=== REQUEST DE CÉSAR [${cesarReqId}] ===`);
        console.log('  status:       ', rd?.status);
        console.log('  seatCount:    ', rd?.seatCount);
    }

    // Auditar el ride compartido
    const rideIds = new Set([md?.activeRideId, md?.activeSharedRideId, cd?.activeRideId, cd?.activeSharedRideId].filter(Boolean));
    for (const rideId of rideIds) {
        const ride = await db.doc(`rides/${rideId}`).get();
        const rd = ride.data();
        console.log(`\n=== RIDE [${rideId}] ===`);
        if (!rd) { console.log('  NO EXISTE'); continue; }
        console.log('  status:         ', rd.status);
        console.log('  isSharedRide:   ', rd.isSharedRide);
        console.log('  driverId:       ', rd.driverId ?? 'VACÍO');
        console.log('  passengerIds:   ', JSON.stringify(rd.passengerIds));
        console.log('  serviceType:    ', rd.serviceType);
        console.log('  orderedStops:   ', (rd.orderedStops||[]).map(s => `${s.type}:${s.requestId?.slice(0,8)}:${s.status}`).join(' | '));
    }

    // Auditar el grupo
    const groupIds = new Set([md?.activeSharedRideGroupId, cd?.activeSharedRideGroupId].filter(Boolean));
    for (const gId of groupIds) {
        const g = await db.doc(`shared_ride_groups/${gId}`).get();
        const gd = g.data();
        console.log(`\n=== GRUPO [${gId}] ===`);
        if (!gd) { console.log('  NO EXISTE'); continue; }
        console.log('  status:       ', gd.status);
        console.log('  requestCount: ', gd.requestCount);
        console.log('  occupiedSeats:', gd.occupiedSeats);
        console.log('  finalRideId:  ', gd.finalRideId);
        console.log('  driverId:     ', gd.driverId);
        console.log('  seatMap:      ', JSON.stringify(gd.seatMap));
    }

    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
