import * as admin from 'firebase-admin';
import * as serviceAccount from './serviceAccountKey.json';

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

async function auditRide() {
    const rideId = 'shared_3gFMS7ICFskVdrCVjhcf';
    const groupId = '3gFMS7ICFskVdrCVjhcf';

    console.log('\n=== AUDITORÍA DE VIAJE COMPARTIDO (SOLO LECTURA) ===\n');

    // 1. Auditar Ride
    const rideSnap = await db.doc(`rides/${rideId}`).get();
    if (!rideSnap.exists) {
        console.log(`❌ Ride ${rideId} NO encontrado en Firestore.`);
    } else {
        const ride = rideSnap.data() as any;
        console.log(`✅ Ride encontrado: ${rideId}`);
        console.log(`   status: ${ride.status}`);
        console.log(`   driverId: ${ride.driverId || 'SIN CONDUCTOR'}`);
        console.log(`   passengerIds: ${JSON.stringify(ride.passengerIds)}`);
        console.log(`   isSharedRide: ${ride.isSharedRide}`);
        console.log(`   seatMap: ${JSON.stringify(ride.seatMap ?? 'N/A (legacy)')}`);
        console.log('\n   --- orderedStops ---');
        (ride.orderedStops || []).forEach((s: any, i: number) => {
            console.log(`   [${i}] type=${s.type} | status=${s.status} | requestId=${s.requestId || '⚠️ MISSING'} | passengerId=${s.passengerId || '⚠️ MISSING'} | address=${s.location?.address || s.address || 'N/A'}`);
        });
        console.log('\n   --- sharedPassengers ---');
        (ride.sharedPassengers || []).forEach((p: any, i: number) => {
            console.log(`   [${i}] name=${p.passengerName} | status=${p.status} | requestId=${p.requestId || '⚠️ MISSING'} | passengerId=${p.passengerId || '⚠️ MISSING'}`);
        });
    }

    // 2. Auditar Group
    console.log('\n   --- SharedRideGroup ---');
    const groupSnap = await db.doc(`shared_ride_groups/${groupId}`).get();
    if (!groupSnap.exists) {
        console.log(`❌ Group ${groupId} NO encontrado.`);
    } else {
        const group = groupSnap.data() as any;
        console.log(`   status: ${group.status}`);
        console.log(`   requestIds: ${JSON.stringify(group.requestIds)}`);
        console.log(`   passengerIds: ${JSON.stringify(group.passengerIds)}`);
        console.log(`   occupiedSeats: ${group.occupiedSeats}`);
        console.log(`   seatMap: ${JSON.stringify(group.seatMap ?? 'N/A (legacy)')}`);
        console.log(`   finalRideId: ${group.finalRideId || 'N/A'}`);
    }

    // 3. Auditar Requests individuales
    console.log('\n   --- SharedRideRequests ---');
    if (groupSnap.exists) {
        const group = groupSnap.data() as any;
        for (const rid of (group.requestIds || [])) {
            const reqSnap = await db.doc(`shared_ride_requests/${rid}`).get();
            if (!reqSnap.exists) {
                console.log(`   ❌ Request ${rid} NO encontrado`);
                continue;
            }
            const req = reqSnap.data() as any;
            console.log(`   Request ${rid}:`);
            console.log(`     passengerId: ${req.passengerId}`);
            console.log(`     passengerName: ${req.passengerName}`);
            console.log(`     status: ${req.status}`);
            console.log(`     seatCount: ${req.seatCount ?? 'N/A (legacy)'}`);
            console.log(`     selectedSeats: ${JSON.stringify(req.selectedSeats ?? 'N/A (legacy)')}`);
        }
    }

    // 4. Auditar usuarios: Eduardo y María
    console.log('\n   --- Usuarios ---');
    const eduardoId = 'cABhlnb9YCgWq3O7zF9bMFM5soo2';
    const mariaId = 'DPTW6GRx0seU0mktKJm5kxCqTst2';
    const conductorQuery = await db.collection('users').where('role', '==', 'driver').where('activeRideId', '==', rideId).limit(1).get();
    
    for (const userId of [eduardoId, mariaId]) {
        const uSnap = await db.doc(`users/${userId}`).get();
        if (!uSnap.exists) {
            console.log(`   ❌ Usuario ${userId} no encontrado`);
            continue;
        }
        const u = uSnap.data() as any;
        console.log(`   ${u.name || userId}:`);
        console.log(`     activeRideId: ${u.activeRideId || 'ninguno'}`);
        console.log(`     activeSharedRequestId: ${u.activeSharedRequestId || 'ninguno'}`);
        console.log(`     activeSharedRideGroupId: ${u.activeSharedRideGroupId || 'ninguno'}`);
        console.log(`     sharedRideStatus: ${u.sharedRideStatus || 'N/A'}`);
    }

    if (!conductorQuery.empty) {
        const cond = conductorQuery.docs[0].data() as any;
        console.log(`   Conductor: ${cond.name || conductorQuery.docs[0].id}`);
        console.log(`     activeRideId: ${cond.activeRideId}`);
    } else {
        console.log('   ⚠️ No se encontró conductor con activeRideId = rideId por query. Verificar manualmente.');
    }

    console.log('\n=== FIN DE AUDITORÍA ===\n');
    process.exit(0);
}

auditRide().catch(e => {
    console.error('Error en auditoría:', e);
    process.exit(1);
});
