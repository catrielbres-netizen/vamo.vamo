const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CESAR_UID  = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_UID  = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const DRIVER_UID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
const del = admin.firestore.FieldValue.delete();

async function main() {
    console.log('🔍 Buscando viajes activos/pendientes...\n');

    // 1. Rides activos de los pasajeros
    const ridesSnap = await db.collection('rides')
        .where('passengerIds', 'array-contains', CESAR_UID)
        .where('status', 'in', ['searching', 'driver_assigned', 'in_progress', 'paused', 'driver_arrived'])
        .get();

    console.log(`Rides activos de César: ${ridesSnap.size}`);
    for (const doc of ridesSnap.docs) {
        const d = doc.data();
        console.log(`  → Cancelando ride ${doc.id} (status: ${d.status})`);
        await doc.ref.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // 2. Shared ride groups activos
    const groupsSnap = await db.collection('shared_ride_groups')
        .where('passengerIds', 'array-contains', CESAR_UID)
        .where('status', 'in', ['forming', 'ready_for_driver', 'driver_assigned', 'in_progress'])
        .get();

    console.log(`Grupos compartidos activos de César: ${groupsSnap.size}`);
    for (const doc of groupsSnap.docs) {
        const d = doc.data();
        console.log(`  → Cancelando grupo ${doc.id} (status: ${d.status})`);
        await doc.ref.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // 3. Shared ride requests activas
    const reqsSnap = await db.collection('shared_ride_requests')
        .where('passengerId', 'in', [CESAR_UID, MARIA_UID])
        .where('status', 'in', ['pending', 'forming', 'searching', 'assigned', 'driver_assigned'])
        .get();

    console.log(`Requests activas: ${reqsSnap.size}`);
    for (const doc of reqsSnap.docs) {
        const d = doc.data();
        console.log(`  → Cancelando request ${doc.id} (status: ${d.status}, passenger: ${d.passengerName})`);
        await doc.ref.update({ status: 'cancelled' });
    }

    // 4. Limpiar perfil del conductor
    await db.doc(`users/${DRIVER_UID}`).update({
        activeRideId: del,
        currentRideId: del,
        driverStatus: 'online',
        isAvailable: true,
    });
    console.log(`\n✅ Conductor limpiado`);

    // 5. Verificación final
    const [c, m, d] = await Promise.all([
        db.doc(`users/${CESAR_UID}`).get(),
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${DRIVER_UID}`).get(),
    ]);
    const fields = ['sharedRideStatus','activeSharedRequestId','activeSharedRideGroupId','activeRideId','activeSharedRideId'];
    console.log('\n=== ESTADO FINAL ===');
    for (const f of fields) {
        const cv = c.data()?.[f] ?? 'VACÍO';
        const mv = m.data()?.[f] ?? 'VACÍO';
        if (cv !== 'VACÍO' || mv !== 'VACÍO') {
            console.log(`  ⚠️ César [${f}]: ${cv}`);
            console.log(`  ⚠️ María [${f}]: ${mv}`);
        }
    }
    const dd = d.data();
    console.log(`  Conductor: driverStatus=${dd?.driverStatus} activeRideId=${dd?.activeRideId ?? 'VACÍO'}`);
    console.log('\n✅ Limpieza completa.');
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
