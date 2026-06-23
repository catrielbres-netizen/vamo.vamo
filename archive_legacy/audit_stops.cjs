const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CESAR_UID  = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_UID  = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';

async function main() {
    // Find the active ride for César
    const cesarSnap = await db.doc(`users/${CESAR_UID}`).get();
    const cesarData = cesarSnap.data();
    const rideId = cesarData?.activeRideId;

    if (!rideId) {
        console.log('❌ César no tiene activeRideId. Buscando rides recientes...');
        const rides = await db.collection('rides')
            .where('passengerIds', 'array-contains', CESAR_UID)
            .orderBy('createdAt', 'desc')
            .limit(3)
            .get();
        rides.forEach(r => {
            const d = r.data();
            console.log(`Ride ${r.id}: status=${d.status}, createdAt=${d.createdAt?.toDate?.()}`);
        });
        return;
    }

    console.log(`\n=== RIDE ACTIVO: ${rideId} ===`);
    const rideSnap = await db.doc(`rides/${rideId}`).get();
    const ride = rideSnap.data();
    console.log(`status: ${ride?.status}`);
    console.log(`passengerIds: ${JSON.stringify(ride?.passengerIds)}`);
    console.log(`\n=== ORDERED STOPS (con passengerId) ===`);
    
    if (!ride?.orderedStops) {
        console.log('❌ Sin orderedStops');
        return;
    }

    ride.orderedStops.forEach((stop, i) => {
        const isMaría = stop.passengerId === MARIA_UID;
        const isCésar = stop.passengerId === CESAR_UID;
        const who = isMaría ? '✅ MARÍA' : (isCésar ? '✅ CÉSAR' : `❌ DESCONOCIDO(${stop.passengerId})`);
        console.log(`Stop ${i+1}: ${stop.type.toUpperCase()} | ${stop.passengerName} | ${who} | status:${stop.status}`);
    });

    console.log(`\n=== PERFIL USUARIOS ===`);
    const mariaSnap = await db.doc(`users/${MARIA_UID}`).get();
    const mariaData = mariaSnap.data();
    console.log(`César [activeRideId]: ${cesarData?.activeRideId}`);
    console.log(`María [activeRideId]: ${mariaData?.activeRideId}`);
    console.log(`María UID: ${MARIA_UID}`);
    console.log(`César UID: ${CESAR_UID}`);

    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
