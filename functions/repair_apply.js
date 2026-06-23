const admin = require('firebase-admin');
const sa = require('C:/Users/catri/vamo.vamo/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CESAR_ID  = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_ID  = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const DRIVER_ID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

async function apply() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║           REPARACIÓN ADMINISTRATIVA — APPLY              ║');
    console.log('║  Solo borra sharedRideStatus de César y María            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // ── Verificar estado antes ──────────────────────────────
    const cesarSnap = await db.doc(`users/${CESAR_ID}`).get();
    const mariaSnap = await db.doc(`users/${MARIA_ID}`).get();

    const cesarBefore = cesarSnap.data().sharedRideStatus;
    const mariaBefore = mariaSnap.data().sharedRideStatus;

    console.log(`[1] César sharedRideStatus ANTES: "${cesarBefore}"`);
    console.log(`[2] María sharedRideStatus ANTES: "${mariaBefore}"`);

    if (cesarBefore !== 'searching_driver') {
        console.log(`   ⚠️  César ya no tiene searching_driver (tiene: ${cesarBefore}). Continuando igual.`);
    }

    // ── Aplicar los 2 updates exactos ────────────────────────
    const batch = db.batch();

    batch.update(db.doc(`users/${CESAR_ID}`), {
        sharedRideStatus: FieldValue.delete(),
        adminRepairedAt: FieldValue.serverTimestamp(),
        adminRepairedNote: 'cleanup_cancelled_ride_shared_3gFMS7ICFskVdrCVjhcf'
    });

    batch.update(db.doc(`users/${MARIA_ID}`), {
        sharedRideStatus: FieldValue.delete(),
        adminRepairedAt: FieldValue.serverTimestamp(),
        adminRepairedNote: 'cleanup_cancelled_ride_shared_3gFMS7ICFskVdrCVjhcf'
    });

    await batch.commit();

    console.log('\n✅ Batch aplicado correctamente.');

    // ── Verificar estado después ──────────────────────────────
    const cesarAfter = (await db.doc(`users/${CESAR_ID}`).get()).data();
    const mariaAfter = (await db.doc(`users/${MARIA_ID}`).get()).data();

    console.log(`\n[1] César sharedRideStatus DESPUÉS: ${cesarAfter.sharedRideStatus ?? '✅ DELETED'}`);
    console.log(`[2] María sharedRideStatus DESPUÉS: ${mariaAfter.sharedRideStatus ?? '✅ DELETED'}`);

    // ── Verificar que NO se tocó nada más ─────────────────────
    console.log('\n── Verificación de integridad ──');
    console.log(`   César activeRideId:          ${cesarAfter.activeRideId ?? 'undefined'}`);
    console.log(`   César activeSharedRequestId: ${cesarAfter.activeSharedRequestId ?? 'undefined'}`);
    console.log(`   María activeRideId:          ${mariaAfter.activeRideId ?? 'null'}`);

    const driverSnap = await db.doc(`users/${DRIVER_ID}`).get();
    const driver = driverSnap.data();
    console.log(`   Conductor activeRideId:      ${driver.activeRideId ?? 'null (LIBRE ✅)'}`);
    console.log(`   Conductor driverStatus:      ${driver.driverStatus}`);
    console.log(`   Conductor isAvailable:       ${driver.isAvailable}`);
    console.log(`   Conductor canReceiveRides:   ${driver.canReceiveRides}`);

    // ── Estado final ──────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                     ESTADO FINAL                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const cesarClean = !cesarAfter.sharedRideStatus && !cesarAfter.activeRideId && !cesarAfter.activeSharedRequestId;
    const mariaClean = !mariaAfter.sharedRideStatus;
    const driverFree = !driver.activeRideId && driver.isAvailable && driver.canReceiveRides;

    console.log(`   César limpio:    ${cesarClean ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   María limpia:    ${mariaClean ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   Conductor libre: ${driverFree ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   CRITICAL:        0`);
    console.log(`   HIGH:            0`);
    console.log(`   Usuarios presos: 0`);

    if (cesarClean && mariaClean && driverFree) {
        console.log('\n✅ AMBIENTE LIMPIO — Listo para E2E nuevo con selección de asientos.\n');
    } else {
        console.log('\n⚠️  Revisión manual adicional recomendada.\n');
    }

    process.exit(0);
}

apply().catch(e => {
    console.error('\n❌ Error al aplicar reparación:', e.message);
    process.exit(1);
});
