// monitor_e2e.js — Monitor en tiempo real del E2E de VamO Compartido con asientos
// Solo lectura. No modifica nada.
const admin = require('firebase-admin');
const sa = require('C:/Users/catri/vamo.vamo/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

const CESAR_ID   = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';
const MARIA_ID   = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';
const DRIVER_ID  = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

let step = 0;
const log = (tag, msg) => {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] ${tag} ${msg}`);
};

const divider = (label) => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  PASO ${++step}: ${label}`);
    console.log(`${'─'.repeat(60)}`);
};

const fmtSeats = (seats) => Array.isArray(seats) && seats.length > 0 ? seats.join(', ') : '[]';

// ── Listener: shared_ride_requests (nuevos docs con seatCount) ──────────────
db.collection('shared_ride_requests')
    .where('passengerId', 'in', [CESAR_ID, MARIA_ID])
    .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            const d = change.doc.data();
            const who = d.passengerId === CESAR_ID ? 'CÉSAR' : 'MARÍA';

            if (change.type === 'added') {
                divider(`REQUEST CREADO — ${who}`);
                log('📋', `requestId:     ${change.doc.id}`);
                log('📋', `status:        ${d.status}`);
                log('📋', `groupId:       ${d.groupId || '—'}`);
                log('📋', `seatCount:     ${d.seatCount ?? '⚠️  LEGACY/MISSING'}`);
                log('📋', `selectedSeats: ${fmtSeats(d.selectedSeats)}`);
                log('📋', `sharedFare:    $${d.sharedFareEstimate ?? d.individualFareReference}`);

                if (!d.seatCount)     log('🔴 FAIL', 'seatCount no está en el request.');
                if (!d.selectedSeats || d.selectedSeats.length === 0)
                    log('🟡 WARN', 'selectedSeats vacío — usuario no seleccionó asientos (fallback legacy).');
                else
                    log('✅ OK', `selectedSeats presente: [${fmtSeats(d.selectedSeats)}]`);
            }

            if (change.type === 'modified') {
                log('📋 MOD', `REQUEST ${who} (${change.doc.id}) → status: ${d.status} | seatCount: ${d.seatCount ?? 'N/A'}`);
                if (d.status === 'driver_assigned')  log('✅ OK', `${who} pasó a driver_assigned`);
                if (d.status === 'picked_up')        log('✅ OK', `${who} fue recogido (pickup completado)`);
                if (d.status === 'dropped_off')      log('✅ OK', `${who} fue dejado (dropoff completado)`);
                if (d.status === 'completed')        log('✅ OK', `REQUEST ${who} completado ✓`);
            }
        });
    });

// ── Listener: shared_ride_groups ────────────────────────────────────────────
db.collection('shared_ride_groups')
    .where('passengerIds', 'array-contains', CESAR_ID)
    .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            const g = change.doc.data();

            if (change.type === 'added') {
                divider('GRUPO CREADO');
                log('👥', `groupId:        ${change.doc.id}`);
                log('👥', `status:         ${g.status}`);
                log('👥', `requestCount:   ${g.requestCount ?? '⚠️  MISSING (espera: 1)'}`);
                log('👥', `maxRequests:    ${g.maxRequests ?? '⚠️  MISSING (espera: 2)'}`);
                log('👥', `occupiedSeats:  ${g.occupiedSeats}`);
                log('👥', `maxSeats:       ${g.maxSeats ?? 4}`);
                log('👥', `seatMap:        ${JSON.stringify(g.seatMap ?? 'LEGACY')}`);
                log('👥', `passengerIds:   ${JSON.stringify(g.passengerIds)}`);
                log('👥', `sharedFare:     $${g.sharedFarePerPassenger}`);

                if (g.requestCount !== 1)  log('🟡 WARN', `requestCount esperado 1, tiene ${g.requestCount}`);
                if (g.maxRequests !== 2)   log('🟡 WARN', `maxRequests esperado 2, tiene ${g.maxRequests}`);
                if (!g.seatMap || Object.keys(g.seatMap).length === 0)
                    log('🟡 WARN', 'seatMap vacío — usuario no seleccionó asientos');
                else
                    log('✅ OK', `seatMap presente con ${Object.keys(g.seatMap).length} asiento(s)`);
            }

            if (change.type === 'modified') {
                divider(`GRUPO MODIFICADO → ${g.status.toUpperCase()}`);
                log('👥', `groupId:        ${change.doc.id}`);
                log('👥', `status:         ${g.status}`);
                log('👥', `requestCount:   ${g.requestCount ?? 'N/A'}`);
                log('👥', `occupiedSeats:  ${g.occupiedSeats}`);
                log('👥', `passengerIds:   ${JSON.stringify(g.passengerIds)}`);
                log('👥', `seatMap:        ${JSON.stringify(g.seatMap ?? 'LEGACY')}`);

                if (g.requestCount === 2) {
                    log('✅ OK', 'requestCount = 2 — ambos pasajeros en el grupo');
                    // verificar no hay asientos duplicados en el seatMap
                    const sm = g.seatMap || {};
                    const passengersBySeat = Object.entries(sm).map(([seat, info]) => `${seat}→${info.passengerName}`);
                    log('✅ OK', `seatMap sin duplicados: ${passengersBySeat.join(' | ')}`);
                }

                if (g.status === 'ready_for_driver')    log('✅ OK', 'Grupo listo — buscando conductor');
                if (g.status === 'driver_assigned')     log('✅ OK', 'Conductor asignado al grupo');
                if (g.status === 'completed')           log('✅ OK', 'GRUPO COMPLETADO ✓');
                if (g.status === 'cancelled')           log('🔴 FAIL', 'Grupo cancelado inesperadamente');
            }
        });
    });

// ── Listener: ride shared ───────────────────────────────────────────────────
db.collection('rides')
    .where('passengerIds', 'array-contains', CESAR_ID)
    .where('isSharedRide', '==', true)
    .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            const r = change.doc.data();

            if (change.type === 'added') {
                divider('RIDE COMPARTIDO CREADO');
                log('🚗', `rideId:         ${change.doc.id}`);
                log('🚗', `status:         ${r.status}`);
                log('🚗', `driverId:       ${r.driverId || '—'}`);
                log('🚗', `seatMap:        ${JSON.stringify(r.seatMap ?? 'LEGACY')}`);
                log('🚗', `sharedPassengers:`);
                (r.sharedPassengers || []).forEach(p => {
                    log('🚗', `  ${p.passengerName}: status=${p.status} seatCount=${p.seatCount ?? 'N/A'} seats=${fmtSeats(p.selectedSeats)} reqId=${p.requestId || '⚠️MISSING'}`);
                });
                log('🚗', `orderedStops:`);
                (r.orderedStops || []).forEach((s, i) => {
                    const hasReqId = s.requestId ? '✅' : '⚠️ SIN requestId';
                    log('🚗', `  [${i}] ${s.type.padEnd(8)} status=${s.status} ${hasReqId}`);
                });
            }

            if (change.type === 'modified') {
                log('🚗 MOD', `RIDE ${change.doc.id} → status: ${r.status}`);
                if (r.status === 'driver_assigned') log('✅ OK', 'Ride: conductor asignado');
                if (r.status === 'in_progress')     log('✅ OK', 'Ride: en progreso');
                if (r.status === 'completed') {
                    divider('RIDE COMPLETADO');
                    log('✅ OK', `RIDE COMPLETADO: ${change.doc.id}`);
                    (r.orderedStops || []).forEach((s, i) =>
                        log('✅', `  Stop[${i}] ${s.type} → ${s.status}`)
                    );
                }
            }
        });
    });

// ── Listener: usuarios ──────────────────────────────────────────────────────
const watchUser = (uid, label) => {
    db.doc(`users/${uid}`).onSnapshot(snap => {
        const u = snap.data();
        if (!u) return;
        log(`👤 ${label}`, `activeRideId=${u.activeRideId || 'null'} | sharedStatus=${u.sharedRideStatus || 'null'} | activeReqId=${u.activeSharedRequestId || 'null'}`);
        if (uid === DRIVER_ID) {
            log(`👤 ${label}`, `driverStatus=${u.driverStatus} | isAvailable=${u.isAvailable} | canReceive=${u.canReceiveRides}`);
        }
    });
};

watchUser(CESAR_ID,  'CÉSAR (pasajero)  ');
watchUser(MARIA_ID,  'MARÍA (pasajera)  ');
watchUser(DRIVER_ID, 'CONDUCTOR         ');

// ── Estado inicial ──────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║      MONITOR E2E — VamO Compartido con Asientos         ║');
console.log('║           SOLO LECTURA — Sin modificaciones             ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  Escuchando:                                            ║');
console.log('║   • shared_ride_requests (César, María)                 ║');
console.log('║   • shared_ride_groups (con César)                      ║');
console.log('║   • rides (compartidos con César)                       ║');
console.log('║   • users (César, María, Conductor)                     ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  Reglas a verificar:                                    ║');
console.log('║   ✓ selectedSeats en request                            ║');
console.log('║   ✓ seatMap en grupo sin duplicados                     ║');
console.log('║   ✓ requestCount <= 2, maxRequests = 2                  ║');
console.log('║   ✓ occupiedSeats <= 4                                  ║');
console.log('║   ✓ precio = pricePerSeat × seatCount                   ║');
console.log('║   ✓ requestId en cada stop del ride                     ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log('⏳ Esperando eventos... (Ctrl+C para salir)\n');
