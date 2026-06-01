const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function diagnose() {
    console.log('=== DIAGNÓSTICO RÁPIDO: PASAJERO Y VIAJES ===\n');

    // 1. Obtener todos los conductores online de una vez
    const locSnap = await db.collection('drivers_locations')
        .where('driverStatus', '==', 'online')
        .get();

    console.log(`Total de registros online en drivers_locations: ${locSnap.size}`);

    const realRawsonDrivers = [];
    const testRawsonDrivers = [];
    const otherDrivers = [];

    for (const doc of locSnap.docs) {
        const d = doc.data();
        const driverId = doc.id;
        
        const isTest = driverId.startsWith('stress_driver_') || driverId.startsWith('test_driver_') || d.isTestDriver === true;
        const cityKey = d.cityKey || '';

        const driverInfo = {
            id: driverId,
            cityKey,
            approved: d.approved,
            isSuspended: d.isSuspended,
            walletBalance: d.walletBalance,
            isTestDriver: isTest,
            driverSubtype: d.driverSubtype
        };

        if (cityKey === 'rawson') {
            if (isTest) {
                testRawsonDrivers.push(driverInfo);
            } else {
                realRawsonDrivers.push(driverInfo);
            }
        } else {
            otherDrivers.push(driverInfo);
        }
    }

    console.log(`\n--- CONDUCTORES EN RAWSON ---`);
    console.log(`Real drivers online in Rawson: ${realRawsonDrivers.length}`);
    console.log(`Test drivers online in Rawson: ${testRawsonDrivers.length}`);
    console.log(`Other cities online: ${otherDrivers.length}`);

    if (realRawsonDrivers.length > 0) {
        console.log('\nDetalles de Conductores REALES en Rawson:');
        for (const dr of realRawsonDrivers) {
            console.log(`\n  driverId: ${dr.id}`);
            console.log(`    cityKey: ${dr.cityKey}`);
            console.log(`    approved: ${dr.approved}`);
            console.log(`    isSuspended: ${dr.isSuspended}`);
            console.log(`    walletBalance: ${dr.walletBalance}`);
            console.log(`    driverSubtype: ${dr.driverSubtype}`);

            // Fetch user profile
            const userSnap = await db.doc(`users/${dr.id}`).get();
            if (userSnap.exists) {
                const u = userSnap.data();
                console.log(`    --- Perfil en users/ ---`);
                console.log(`    role: ${u.role}`);
                console.log(`    approved: ${u.approved}`);
                console.log(`    isSuspended: ${u.isSuspended}`);
                console.log(`    municipalStatus: ${u.municipalStatus}`);
                console.log(`    activeRideId: ${u.activeRideId || 'ninguno'}`);
                console.log(`    driverSubtype: ${u.driverSubtype}`);
                console.log(`    currentBalance: ${u.currentBalance}`);
            }
        }
    }

    // 2. Viajes en estado 'searching'
    console.log('\n--- 2. Viajes activos en estado "searching" ---');
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'searching')
        .get();

    if (ridesSnap.empty) {
        console.log('No hay viajes en estado "searching" ahora mismo.');
    } else {
        console.log(`Hay ${ridesSnap.size} viajes en estado searching:`);
        for (const r of ridesSnap.docs) {
            const d = r.data();
            console.log(`\n  rideId: ${r.id}`);
            console.log(`    passengerId: ${d.passengerId}`);
            console.log(`    cityKey: ${d.cityKey}`);
            console.log(`    pricingMunicipalityKey: ${d.pricingMunicipalityKey}`);
            console.log(`    serviceType: ${d.serviceType}`);
            console.log(`    isSimulation: ${d.isSimulation}`);
            console.log(`    matchingAttempts: ${d.matchingAttempts}`);
            console.log(`    lastMatchingFailureReason: ${d.lastMatchingFailureReason}`);
            console.log(`    createdAt: ${d.createdAt?.toDate?.()?.toISOString()}`);
        }
    }

    // 3. Últimos 5 viajes
    console.log('\n--- 3. Últimos 5 viajes creados ---');
    const recentRides = await db.collection('rides')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
    for (const r of recentRides.docs) {
        const d = r.data();
        console.log(`  rideId=${r.id}, status=${d.status}, cityKey=${d.cityKey}, serviceType=${d.serviceType}, cancelReason=${d.cancelReason}, isSimulation=${d.isSimulation}, at=${d.createdAt?.toDate?.()?.toISOString()}`);
    }

    console.log('\n=== FIN DIAGNÓSTICO ===');
    process.exit(0);
}

diagnose().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
