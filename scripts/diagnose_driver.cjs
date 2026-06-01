/**
 * Diagnóstico: ¿Por qué el conductor no recibe viajes normales?
 * Verifica: drivers_locations, users (profile), drivers, rideOffers, rides recientes
 */
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function diagnose() {
    console.log('=== DIAGNÓSTICO: CONDUCTOR SIN VIAJES ===\n');

    // 1. Buscar conductores online en drivers_locations
    console.log('--- 1. Conductores ONLINE en drivers_locations ---');
    const locSnap = await db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .get();

    if (locSnap.empty) {
        console.log('⚠️  NO HAY CONDUCTORES ONLINE en drivers_locations');
    } else {
        console.log(`✅ ${locSnap.size} conductor(es) online:`);
        for (const doc of locSnap.docs) {
            const d = doc.data();
            const lat = d.currentLocation?.lat ?? d.currentLocation?.latitude;
            const lng = d.currentLocation?.lng ?? d.currentLocation?.longitude;
            console.log(`\n  driverId: ${doc.id}`);
            console.log(`    status: ${d.driverStatus}`);
            console.log(`    approved: ${d.approved}`);
            console.log(`    isSuspended: ${d.isSuspended}`);
            console.log(`    isTestDriver: ${d.isTestDriver}`);
            console.log(`    cityKey: ${d.cityKey}`);
            console.log(`    geohash: ${d.geohash || 'FALTANTE ⚠️'}`);
            console.log(`    currentLocation: ${lat !== undefined ? `lat=${lat}, lng=${lng}` : 'FALTANTE ⚠️'}`);
            console.log(`    walletBalance: ${d.walletBalance ?? 'no seteado'}`);
            console.log(`    pendingOffers: ${d.pendingOffers ?? 0}`);

            // 2. Verificar perfil en users/
            const userSnap = await db.doc(`users/${doc.id}`).get();
            if (!userSnap.exists) {
                console.log(`    ❌ USUARIO NO EXISTE en users/${doc.id}`);
            } else {
                const u = userSnap.data();
                console.log(`    --- Perfil users/ ---`);
                console.log(`    role: ${u.role}`);
                console.log(`    approved: ${u.approved}`);
                console.log(`    isSuspended: ${u.isSuspended}`);
                console.log(`    municipalStatus: ${u.municipalStatus}`);
                console.log(`    profileCompleted: ${u.profileCompleted}`);
                console.log(`    driverStatus: ${u.driverStatus}`);
                console.log(`    activeRideId: ${u.activeRideId || 'ninguno'}`);
                console.log(`    currentBalance: ${u.currentBalance ?? 'no seteado'}`);
                console.log(`    driverRiskLevel: ${u.driverRiskLevel || 'no seteado'}`);
                console.log(`    termsAccepted: ${u.termsAccepted}, termsVersion: ${u.termsVersion}`);
                console.log(`    driverSubtype: ${u.driverSubtype || 'no seteado'}`);
                console.log(`    vehicle: ${u.vehicle ? `${u.vehicle.brand} ${u.vehicle.model} - ${u.vehicle.plate}` : 'FALTANTE ⚠️'}`);
            }

            // 3. Verificar en drivers/
            const driverSnap = await db.doc(`drivers/${doc.id}`).get();
            if (!driverSnap.exists) {
                console.log(`    ❌ GHOST DRIVER: no existe en drivers/${doc.id}`);
            } else {
                const dr = driverSnap.data();
                console.log(`    ✅ drivers/ → approved: ${dr.approved}, isSuspended: ${dr.isSuspended}`);
            }

            // 4. Verificar rideOffers pendientes para este conductor
            const offersSnap = await db.collection('rideOffers')
                .where('driverId', '==', doc.id)
                .where('status', '==', 'pending')
                .limit(5)
                .get();
            console.log(`    rideOffers pendientes: ${offersSnap.size}`);
            if (!offersSnap.empty) {
                offersSnap.docs.forEach(o => {
                    const od = o.data();
                    console.log(`      → offerId=${o.id}, rideId=${od.rideId}, expiresAt=${od.expiresAt?.toDate?.().toISOString()}`);
                });
            }
        }
    }

    // 5. Viajes en estado 'searching' ahora mismo
    console.log('\n--- 2. Viajes activos en estado "searching" ---');
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'searching')
        .where('isSimulation', '==', false)
        .limit(10)
        .get();

    if (ridesSnap.empty) {
        // Intentar sin filtro de simulación
        const ridesSnap2 = await db.collection('rides')
            .where('status', '==', 'searching')
            .limit(10)
            .get();
        if (ridesSnap2.empty) {
            console.log('No hay viajes en estado "searching" ahora mismo.');
        } else {
            ridesSnap2.docs.forEach(r => {
                const d = r.data();
                console.log(`  rideId=${r.id}, cityKey=${d.cityKey}, isSimulation=${d.isSimulation}, attempts=${d.matchingAttempts}, lastFailure=${d.lastMatchingFailureReason}`);
            });
        }
    } else {
        ridesSnap.docs.forEach(r => {
            const d = r.data();
            console.log(`  rideId=${r.id}, cityKey=${d.cityKey}, attempts=${d.matchingAttempts}, lastFailure=${d.lastMatchingFailureReason}`);
        });
    }

    // 6. Últimos viajes reales (no simulación) cancelados por NO_DRIVERS
    console.log('\n--- 3. Últimos viajes cancelados por NO_DRIVERS ---');
    const cancelledSnap = await db.collection('rides')
        .where('cancelReason', '==', 'MAX_MATCHING_ATTEMPTS_REACHED')
        .orderBy('cancelledAt', 'desc')
        .limit(5)
        .get();
    if (cancelledSnap.empty) {
        console.log('Ninguno reciente.');
    } else {
        cancelledSnap.docs.forEach(r => {
            const d = r.data();
            console.log(`  rideId=${r.id}, cityKey=${d.cityKey}, isSimulation=${d.isSimulation}, at=${d.cancelledAt?.toDate?.()?.toISOString()}`);
        });
    }

    console.log('\n=== FIN DIAGNÓSTICO ===');
    process.exit(0);
}

diagnose().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
