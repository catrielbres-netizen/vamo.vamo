const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CESAR_UID  = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_UID  = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const DRIVER_UID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

async function main() {
    console.log('🧹 Limpiando campos residuales...\n');

    const del = admin.firestore.FieldValue.delete();

    await Promise.all([
        db.doc(`users/${CESAR_UID}`).update({
            activeSharedRideId: del,
            activeRideId: del,
            activeSharedRequestId: del,
            activeSharedRideGroupId: del,
            sharedRideStatus: del,
        }),
        db.doc(`users/${MARIA_UID}`).update({
            activeSharedRideId: del,
            activeRideId: del,
            activeSharedRequestId: del,
            activeSharedRideGroupId: del,
            sharedRideStatus: del,
        }),
        db.doc(`users/${DRIVER_UID}`).update({
            activeRideId: del,
            driverStatus: 'online',
            isAvailable: true,
        }),
    ]);

    const [c, m, d] = await Promise.all([
        db.doc(`users/${CESAR_UID}`).get(),
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${DRIVER_UID}`).get(),
    ]);

    const cd = c.data(), md = m.data(), dd = d.data();
    const fields = ['sharedRideStatus','activeSharedRequestId','activeSharedRideGroupId','activeRideId','activeSharedRideId'];

    console.log('=== DESPUÉS ===');
    for (const f of fields) {
        console.log(`  César [${f}]:  ${cd?.[f] ?? 'VACÍO'}`);
        console.log(`  María [${f}]:  ${md?.[f] ?? 'VACÍO'}`);
    }
    console.log(`  Conductor driverStatus: ${dd?.driverStatus} isAvailable: ${dd?.isAvailable} activeRideId: ${dd?.activeRideId ?? 'VACÍO'}`);

    console.log('\n✅ Ambiente limpio y listo.');
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
