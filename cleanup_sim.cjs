/**
 * Cleanup del E2E de simulación + ride viejo del conductor
 */
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CESAR_UID  = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_UID  = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const DRIVER_UID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

async function main() {
    console.log('\n🧹 Limpiando rides de simulación...\n');

    // ── 1. Leer estado actual
    const [cSnap, mSnap, dSnap] = await Promise.all([
        db.doc(`users/${CESAR_UID}`).get(),
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${DRIVER_UID}`).get(),
    ]);
    const c = cSnap.data(), m = mSnap.data(), d = dSnap.data();

    console.log('Antes:');
    console.log('  César:     sharedRideStatus=' + (c?.sharedRideStatus||'VACÍO') + ' activeGroupId=' + (c?.activeSharedRideGroupId||'VACÍO'));
    console.log('  María:     sharedRideStatus=' + (m?.sharedRideStatus||'VACÍO') + ' activeGroupId=' + (m?.activeSharedRideGroupId||'VACÍO'));
    console.log('  Conductor: driverStatus=' + d?.driverStatus + ' activeRideId=' + (d?.activeRideId||'VACÍO'));

    // ── 2. Recolectar IDs a limpiar
    const groupIds = new Set();
    const rideIds = new Set();

    if (c?.activeSharedRideGroupId) groupIds.add(c.activeSharedRideGroupId);
    if (m?.activeSharedRideGroupId) groupIds.add(m.activeSharedRideGroupId);
    if (c?.activeRideId) rideIds.add(c.activeRideId);
    if (m?.activeRideId) rideIds.add(m.activeRideId);
    if (d?.activeRideId) rideIds.add(d.activeRideId);

    // Agregar rides compartidos conocidos por prefijo
    const allRideIds = [...rideIds];
    for (const gId of groupIds) {
        allRideIds.push(`shared_${gId}`);
    }

    console.log('\n  Groups a cancelar:', [...groupIds]);
    console.log('  Rides a cancelar:', allRideIds);

    // ── 3. Cancelar grupos
    for (const gId of groupIds) {
        try {
            await db.doc(`shared_ride_groups/${gId}`).update({
                status: 'cancelled',
                cancelReason: 'simulator_cleanup',
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log('  ✅ Grupo cancelado:', gId);

            // Cancelar requests dentro del grupo
            const groupSnap = await db.doc(`shared_ride_groups/${gId}`).get();
            const reqIds = groupSnap.data()?.requestIds || [];
            for (const rId of reqIds) {
                try {
                    await db.doc(`shared_ride_requests/${rId}`).update({
                        status: 'cancelled',
                        updatedAt: FieldValue.serverTimestamp()
                    });
                } catch {}
            }
        } catch (e) {
            console.log('  ⚠️  Grupo ya no existe o error:', gId, e.message);
        }
    }

    // ── 4. Cancelar rides
    for (const rId of allRideIds) {
        try {
            const rSnap = await db.doc(`rides/${rId}`).get();
            if (rSnap.exists) {
                await db.doc(`rides/${rId}`).update({
                    status: 'cancelled',
                    cancelReason: 'simulator_cleanup',
                    updatedAt: FieldValue.serverTimestamp()
                });
                console.log('  ✅ Ride cancelado:', rId);
            }
        } catch (e) {
            console.log('  ⚠️  Ride no existe o error:', rId, e.message);
        }
    }

    // ── 5. Limpiar usuarios
    const userCleanup = {
        sharedRideStatus: FieldValue.delete(),
        activeSharedRequestId: FieldValue.delete(),
        activeSharedRideGroupId: FieldValue.delete(),
        activeRideId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
    };
    await Promise.all([
        db.doc(`users/${CESAR_UID}`).update(userCleanup),
        db.doc(`users/${MARIA_UID}`).update(userCleanup),
    ]);
    console.log('  ✅ César y María limpiados');

    // ── 6. Limpiar conductor
    await db.doc(`users/${DRIVER_UID}`).update({
        activeRideId: FieldValue.delete(),
        driverStatus: 'online',
        isAvailable: true,
        updatedAt: FieldValue.serverTimestamp()
    });
    console.log('  ✅ Conductor liberado');

    // ── 7. Verificar estado final
    const [c2, m2, d2] = await Promise.all([
        db.doc(`users/${CESAR_UID}`).get(),
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${DRIVER_UID}`).get(),
    ]);
    console.log('\nDespués:');
    console.log('  César:     sharedRideStatus=' + (c2.data()?.sharedRideStatus||'VACÍO') + ' activeGroupId=' + (c2.data()?.activeSharedRideGroupId||'VACÍO'));
    console.log('  María:     sharedRideStatus=' + (m2.data()?.sharedRideStatus||'VACÍO') + ' activeGroupId=' + (m2.data()?.activeSharedRideGroupId||'VACÍO'));
    console.log('  Conductor: driverStatus=' + d2.data()?.driverStatus + ' isAvailable=' + d2.data()?.isAvailable + ' activeRideId=' + (d2.data()?.activeRideId||'VACÍO'));

    console.log('\n✅ Limpieza completa. Ambiente listo.\n');
    process.exit(0);
}
main().catch(e => { console.error('❌', e); process.exit(1); });
