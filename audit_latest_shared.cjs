const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CESAR_UID = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_UID = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const DRIVER_UID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

function fmt(obj) {
    return JSON.stringify(obj, (key, val) => {
        if (val && typeof val === 'object' && val._seconds !== undefined) {
            return new Date(val._seconds * 1000).toISOString();
        }
        return val;
    }, 2);
}

async function audit() {
    console.log('\n========== AUDITORÍA COMPARTIDO - ' + new Date().toISOString() + ' ==========\n');

    // 1. Estado de usuarios
    const [cesarSnap, mariaSnap, driverSnap] = await Promise.all([
        db.doc(`users/${CESAR_UID}`).get(),
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${DRIVER_UID}`).get(),
    ]);

    const cesar = cesarSnap.data();
    const maria = mariaSnap.data();
    const driver = driverSnap.data();

    console.log('=== CÉSAR (pasajero 1) ===');
    console.log('  sharedRideStatus:', cesar?.sharedRideStatus || 'VACÍO');
    console.log('  activeSharedRequestId:', cesar?.activeSharedRequestId || 'VACÍO');
    console.log('  activeSharedRideGroupId:', cesar?.activeSharedRideGroupId || 'VACÍO');
    console.log('  activeRideId:', cesar?.activeRideId || 'VACÍO');

    console.log('\n=== MARÍA (pasajero 2) ===');
    console.log('  sharedRideStatus:', maria?.sharedRideStatus || 'VACÍO');
    console.log('  activeSharedRequestId:', maria?.activeSharedRequestId || 'VACÍO');
    console.log('  activeSharedRideGroupId:', maria?.activeSharedRideGroupId || 'VACÍO');
    console.log('  activeRideId:', maria?.activeRideId || 'VACÍO');

    console.log('\n=== CONDUCTOR (Eduardo) ===');
    console.log('  driverStatus:', driver?.driverStatus || 'VACÍO');
    console.log('  isAvailable:', driver?.isAvailable);
    console.log('  activeRideId:', driver?.activeRideId || 'VACÍO');

    // 2. Buscar el grupo activo
    const groupId = cesar?.activeSharedRideGroupId || maria?.activeSharedRideGroupId;
    if (!groupId) {
        console.log('\n⚠️  NO HAY GROUP ID activo en ningún usuario');
        
        // buscar el más reciente en Firestore
        const recentGroups = await db.collection('shared_ride_groups')
            .orderBy('createdAt', 'desc')
            .limit(3)
            .get();
        
        console.log('\n📋 Últimos 3 grupos en Firestore:');
        recentGroups.forEach(doc => {
            const d = doc.data();
            console.log(`  [${doc.id}] status=${d.status} requestCount=${d.requestCount} occupiedSeats=${d.occupiedSeats} createdAt=${d.createdAt?.toDate?.()?.toISOString?.()}`);
        });
        return;
    }

    console.log('\n=== GRUPO:', groupId, '===');
    const groupSnap = await db.doc(`shared_ride_groups/${groupId}`).get();
    const group = groupSnap.data();

    if (!group) {
        console.log('  ⛔ GRUPO NO EXISTE');
        return;
    }

    console.log('  status:', group.status);
    console.log('  requestCount:', group.requestCount);
    console.log('  maxRequests:', group.maxRequests);
    console.log('  occupiedSeats:', group.occupiedSeats);
    console.log('  maxSeats:', group.maxSeats);
    console.log('  requestIds:', group.requestIds);
    console.log('  passengerIds:', group.passengerIds);
    console.log('  seatMap:', fmt(group.seatMap));
    console.log('  sharedFarePerPassenger:', group.sharedFarePerPassenger);
    console.log('  estimatedSharedTotal:', group.estimatedSharedTotal);
    console.log('  driverSearchStartsAt:', group.driverSearchStartsAt?.toDate?.()?.toISOString?.() || 'VACÍO');
    console.log('  expiresAt:', group.expiresAt?.toDate?.()?.toISOString?.() || 'VACÍO');
    console.log('  finalRideId:', group.finalRideId || 'VACÍO');
    console.log('  driverId:', group.driverId || 'VACÍO');

    // 3. Requests individuales
    if (group.requestIds?.length > 0) {
        console.log('\n=== REQUESTS ===');
        for (const reqId of group.requestIds) {
            const reqSnap = await db.doc(`shared_ride_requests/${reqId}`).get();
            const req = reqSnap.data();
            if (!req) { console.log(`  [${reqId}] NO EXISTE`); continue; }
            console.log(`\n  [${reqId}]`);
            console.log('    passengerId:', req.passengerId);
            console.log('    status:', req.status);
            console.log('    roleInGroup:', req.roleInGroup);
            console.log('    seatCount:', req.seatCount ?? 'VACÍO');
            console.log('    seatLabels:', req.seatLabels ?? 'VACÍO');
            console.log('    selectedSeats:', req.selectedSeats ?? 'VACÍO');
            console.log('    sharedFareEstimate:', req.sharedFareEstimate ?? 'VACÍO');
            console.log('    finalFareCash:', req.finalFareCash ?? 'VACÍO');
            console.log('    individualFareReference:', req.individualFareReference ?? 'VACÍO');
            console.log('    pickupStatus:', req.pickupStatus ?? 'VACÍO');
        }
    }

    // 4. Ride final si existe
    if (group.finalRideId) {
        console.log('\n=== RIDE FINAL:', group.finalRideId, '===');
        const rideSnap = await db.doc(`rides/${group.finalRideId}`).get();
        const ride = rideSnap.data();
        if (ride) {
            console.log('  status:', ride.status);
            console.log('  driverId:', ride.driverId || 'VACÍO');
            console.log('  isSharedRide:', ride.isSharedRide);
            console.log('  stops:', ride.stops?.map(s => `${s.type}:${s.status}`).join(' → '));
        }
    }

    // 5. Diagnóstico
    console.log('\n=== DIAGNÓSTICO ===');
    const issues = [];
    
    if (!group.maxRequests) issues.push('⚠️  maxRequests no definido en grupo');
    if (!group.maxSeats) issues.push('⚠️  maxSeats no definido en grupo');
    if (group.status === 'forming' && group.requestCount >= (group.maxRequests ?? 2)) issues.push('🔴 CRÍTICO: grupo lleno pero status=forming (debería ser ready_for_driver)');
    if (cesar?.sharedRideStatus === 'completed' || cesar?.sharedRideStatus === 'searching_driver') issues.push(`⚠️  César sharedRideStatus=${cesar.sharedRideStatus} inesperado`);
    if (maria?.sharedRideStatus === 'completed' || maria?.sharedRideStatus === 'searching_driver') issues.push(`⚠️  María sharedRideStatus=${maria.sharedRideStatus} inesperado`);
    
    const mariaGroupId = maria?.activeSharedRideGroupId;
    if (mariaGroupId && mariaGroupId !== groupId) issues.push(`🔴 CRÍTICO: María tiene groupId diferente (${mariaGroupId} vs ${groupId})`);
    if (!mariaGroupId) issues.push('⚠️  María no tiene activeSharedRideGroupId');

    if (issues.length === 0) {
        console.log('  ✅ Sin problemas críticos detectados');
    } else {
        issues.forEach(i => console.log(' ', i));
    }

    console.log('\n========== FIN AUDITORÍA ==========\n');
    process.exit(0);
}

audit().catch(e => { console.error(e); process.exit(1); });
