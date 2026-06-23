const admin = require('firebase-admin');
const sa = require('C:/Users/catri/vamo.vamo/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

// ============================================================
// IDs conocidos
// ============================================================
const RIDE_ID    = 'shared_3gFMS7ICFskVdrCVjhcf';
const GROUP_ID   = '3gFMS7ICFskVdrCVjhcf';
const REQ_CESAR  = 'FZrvlzaIDglt8abQiIz2';
const REQ_MARIA  = 'DA0zj1qZPWiL3DiMNGJV';

const USERS = [
    { id: 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1', label: 'César/Eduardo pasajero' },
    { id: 'eMhDWqwmQMgoKMskjzTd2StwQaI3',  label: 'María pasajera' },
    { id: 'VNhou0ag4wXXPr6IXa3foO6SI8B3',  label: 'Eduardo conductor' },
];

// ============================================================
// Helpers
// ============================================================
function field(val) {
    if (val === undefined) return '❓ UNDEFINED';
    if (val === null)      return 'null';
    return String(val);
}

function snapInfo(snap) {
    return snap.exists ? snap.data() : null;
}

// ============================================================
// MAIN
// ============================================================
async function audit() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║    AUDITORÍA COMPLETA — DRY RUN — SOLO LECTURA          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // ── 1. Ride ──────────────────────────────────────────────
    const rideSnap = await db.doc(`rides/${RIDE_ID}`).get();
    const ride = snapInfo(rideSnap);
    console.log(`\n🚗 RIDE: ${RIDE_ID}`);
    if (!ride) {
        console.log('   ❌ NO EXISTE');
    } else {
        console.log(`   status            = ${field(ride.status)}`);
        console.log(`   driverId          = ${field(ride.driverId)}`);
        console.log(`   isSharedRide      = ${field(ride.isSharedRide)}`);
        console.log(`   sharedGroupId     = ${field(ride.sharedGroupId)}`);
        console.log(`   passengerIds      = ${JSON.stringify(ride.passengerIds)}`);
        console.log(`   seatMap           = ${JSON.stringify(ride.seatMap ?? 'LEGACY')}`);
        console.log('\n   ORDERED_STOPS:');
        (ride.orderedStops || []).forEach((s, i) =>
            console.log(`     [${i}] ${s.type.padEnd(8)} status=${String(s.status).padEnd(12)} reqId=${s.requestId || '⚠️MISSING'} passId=${s.passengerId || '⚠️MISSING'}`)
        );
        console.log('\n   SHARED_PASSENGERS:');
        (ride.sharedPassengers || []).forEach((p, i) =>
            console.log(`     [${i}] ${(p.passengerName||'?').padEnd(12)} status=${p.status} reqId=${p.requestId || '⚠️MISSING'}`)
        );
    }

    // ── 2. Group ─────────────────────────────────────────────
    const grpSnap = await db.doc(`shared_ride_groups/${GROUP_ID}`).get();
    const grp = snapInfo(grpSnap);
    console.log(`\n👥 GROUP: ${GROUP_ID}`);
    if (!grp) {
        console.log('   ❌ NO EXISTE');
    } else {
        console.log(`   status            = ${field(grp.status)}`);
        console.log(`   occupiedSeats     = ${field(grp.occupiedSeats)}`);
        console.log(`   requestIds        = ${JSON.stringify(grp.requestIds)}`);
        console.log(`   passengerIds      = ${JSON.stringify(grp.passengerIds)}`);
        console.log(`   finalRideId       = ${field(grp.finalRideId)}`);
        console.log(`   seatMap           = ${JSON.stringify(grp.seatMap ?? 'LEGACY')}`);
    }

    // ── 3. Requests ──────────────────────────────────────────
    for (const [rid, label] of [[REQ_CESAR, 'César'], [REQ_MARIA, 'María']]) {
        const rSnap = await db.doc(`shared_ride_requests/${rid}`).get();
        const r = snapInfo(rSnap);
        console.log(`\n📋 REQUEST ${label}: ${rid}`);
        if (!r) {
            console.log('   ❌ NO EXISTE');
        } else {
            console.log(`   status            = ${field(r.status)}`);
            console.log(`   passengerId       = ${field(r.passengerId)}`);
            console.log(`   passengerName     = ${field(r.passengerName)}`);
            console.log(`   groupId           = ${field(r.groupId)}`);
            console.log(`   finalRideId       = ${field(r.finalRideId)}`);
            console.log(`   seatCount         = ${field(r.seatCount ?? 'LEGACY')}`);
            console.log(`   selectedSeats     = ${JSON.stringify(r.selectedSeats ?? 'LEGACY')}`);
        }
    }

    // ── 4. Usuarios ──────────────────────────────────────────
    const userDataMap = {};
    for (const { id, label } of USERS) {
        const uSnap = await db.doc(`users/${id}`).get();
        const u = snapInfo(uSnap);
        userDataMap[id] = u;
        console.log(`\n👤 USUARIO ${label}: ${id}`);
        if (!u) {
            console.log('   ❌ NO EXISTE');
            continue;
        }
        console.log(`   name                  = ${field(u.name)}`);
        console.log(`   role                  = ${field(u.role)}`);
        console.log(`   activeRideId          = ${field(u.activeRideId)}`);
        console.log(`   activeSharedRequestId = ${field(u.activeSharedRequestId)}`);
        console.log(`   activeSharedRideGroupId = ${field(u.activeSharedRideGroupId ?? u.currentSharedRideGroupId)}`);
        console.log(`   sharedRideStatus      = ${field(u.sharedRideStatus)}`);
        if (u.role === 'driver') {
            console.log(`   driverStatus          = ${field(u.driverStatus)}`);
            console.log(`   isAvailable           = ${field(u.isAvailable)}`);
            console.log(`   canReceiveRides       = ${field(u.canReceiveRides)}`);
            console.log(`   enabled               = ${field(u.enabled)}`);
            console.log(`   approved              = ${field(u.approved)}`);
        }
    }

    // ── 5. Driver Location ───────────────────────────────────
    const DRIVER_ID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    const dlocSnap = await db.doc(`driver_locations/${DRIVER_ID}`).get();
    const dloc = snapInfo(dlocSnap);
    console.log(`\n📍 DRIVER LOCATION: ${DRIVER_ID}`);
    if (!dloc) {
        console.log('   ❌ NO EXISTE');
    } else {
        console.log(`   driverStatus    = ${field(dloc.driverStatus)}`);
        console.log(`   isAvailable     = ${field(dloc.isAvailable)}`);
        console.log(`   approved        = ${field(dloc.approved)}`);
        console.log(`   pendingOffers   = ${field(dloc.pendingOffers)}`);
        console.log(`   lastSeenAt      = ${dloc.lastSeenAt?.toDate?.() || 'N/A'}`);
    }

    // ══════════════════════════════════════════════════════════
    // DRY RUN — Determinar qué hay que limpiar
    // ══════════════════════════════════════════════════════════
    console.log('\n\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                    DRY RUN — PLAN DE LIMPIEZA           ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const ops = [];

    // Pasajeros: limpiar si tienen referencias al viaje cancelado
    for (const { id, label } of USERS.filter(u => u.label !== 'Eduardo conductor')) {
        const u = userDataMap[id];
        if (!u) continue;
        const fields = {};
        if (u.activeRideId)           fields['activeRideId [BEFORE]'] = u.activeRideId;
        if (u.activeSharedRequestId)  fields['activeSharedRequestId [BEFORE]'] = u.activeSharedRequestId;
        const groupKey = u.activeSharedRideGroupId ? 'activeSharedRideGroupId' : (u.currentSharedRideGroupId ? 'currentSharedRideGroupId' : null);
        if (groupKey && u[groupKey])  fields[`${groupKey} [BEFORE]`] = u[groupKey];
        if (u.sharedRideStatus)       fields['sharedRideStatus [BEFORE]'] = u.sharedRideStatus;
        if (Object.keys(fields).length > 0) {
            ops.push({
                doc: `users/${id}`,
                label: `${label} — limpiar estado compartido`,
                before: fields,
                after: {
                    'activeRideId':          'DELETE',
                    'activeSharedRequestId': 'DELETE',
                    ...(groupKey ? { [groupKey]: 'DELETE' } : {}),
                    'sharedRideStatus':      'DELETE',
                },
                risk: 'BAJO — solo limpia campos de estado, no toca wallet ni historial'
            });
        }
    }

    // Conductor: limpiar activeRideId si sigue apuntando al ride cancelado
    const conductor = userDataMap[DRIVER_ID];
    if (conductor) {
        const fields = {};
        if (conductor.activeRideId) fields['activeRideId [BEFORE]'] = conductor.activeRideId;
        if (Object.keys(fields).length > 0) {
            ops.push({
                doc: `users/${DRIVER_ID}`,
                label: 'Conductor — limpiar activeRideId',
                before: fields,
                after: { 'activeRideId': 'DELETE' },
                risk: 'BAJO — solo limpia referencia al viaje activo'
            });
        }
    }

    // Request César: si no está en estado terminal, marcar cancelled
    const reqCesarSnap = await db.doc(`shared_ride_requests/${REQ_CESAR}`).get();
    const reqCesar = snapInfo(reqCesarSnap);
    const TERMINAL_STATUSES = ['cancelled', 'completed', 'expired', 'dropped_off'];
    if (reqCesar && !TERMINAL_STATUSES.includes(reqCesar.status)) {
        ops.push({
            doc: `shared_ride_requests/${REQ_CESAR}`,
            label: 'Request César — forzar cancelled (status no terminal)',
            before: { 'status [BEFORE]': reqCesar.status },
            after: { 'status': 'cancelled', 'adminRepaired': true, 'adminRepairedAt': 'SERVER_TIMESTAMP' },
            risk: 'BAJO — request ya pertenece a viaje cancelado'
        });
    }

    // Ride: si no está cancelado, marcarlo
    if (ride && ride.status !== 'cancelled') {
        ops.push({
            doc: `rides/${RIDE_ID}`,
            label: 'Ride — forzar cancelled si no lo está',
            before: { 'status [BEFORE]': ride.status },
            after: { 'status': 'cancelled', 'adminRepaired': true },
            risk: 'BAJO — el grupo ya está cancelado'
        });
    }

    if (ops.length === 0) {
        console.log('✅ No hay operaciones de limpieza necesarias. Todos los campos ya están en estado limpio.\n');
    } else {
        console.log(`⚠️  Se encontraron ${ops.length} operación(es) a ejecutar:\n`);
        ops.forEach((op, i) => {
            console.log(`  [${i+1}] ${op.label}`);
            console.log(`       doc:    ${op.doc}`);
            console.log(`       antes:  ${JSON.stringify(op.before)}`);
            console.log(`       después:${JSON.stringify(op.after)}`);
            console.log(`       riesgo: ${op.risk}`);
            console.log('');
        });
        console.log('⏸  DRY RUN completado. NO se aplicó ningún cambio.');
        console.log('   Para aplicar: ejecutá este script con argumento --apply\n');
    }

    console.log('═══════════════════════════════════════════════════════════');
    process.exit(0);
}

audit().catch(e => {
    console.error('\n❌ Error en auditoría:', e.message);
    process.exit(1);
});
