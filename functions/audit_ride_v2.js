const admin = require('firebase-admin');
const sa = require('C:/Users/catri/vamo.vamo/service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

async function run() {
    const rideId = 'shared_3gFMS7ICFskVdrCVjhcf';
    const groupId = '3gFMS7ICFskVdrCVjhcf';

    console.log('\n=== AUDIT VIAJE E2E (SOLO LECTURA) ===\n');

    // Ride
    const rideSnap = await db.doc(`rides/${rideId}`).get();
    if (!rideSnap.exists) {
        console.log('RIDE: ❌ NO EXISTE');
    } else {
        const r = rideSnap.data();
        console.log(`RIDE status=${r.status} driverId=${r.driverId||'NONE'} seatMap=${JSON.stringify(r.seatMap ?? 'LEGACY')}`);
        console.log('ORDERED_STOPS:');
        (r.orderedStops||[]).forEach((s,i) => {
            console.log(`  [${i}] type=${s.type} status=${s.status} reqId=${s.requestId||'⚠️MISSING'} passId=${s.passengerId||'⚠️MISSING'}`);
        });
        console.log('SHARED_PASSENGERS:');
        (r.sharedPassengers||[]).forEach((p,i) => {
            console.log(`  [${i}] name=${p.passengerName} status=${p.status} reqId=${p.requestId||'⚠️MISSING'}`);
        });
    }

    // Group
    const gSnap = await db.doc(`shared_ride_groups/${groupId}`).get();
    if (!gSnap.exists) {
        console.log('GROUP: ❌ NO EXISTE');
    } else {
        const g = gSnap.data();
        console.log(`\nGROUP status=${g.status} occupiedSeats=${g.occupiedSeats} seatMap=${JSON.stringify(g.seatMap ?? 'LEGACY')}`);
        console.log(`  requestIds=${JSON.stringify(g.requestIds)}`);
        
        for (const rid of (g.requestIds||[])) {
            const rSnap = await db.doc(`shared_ride_requests/${rid}`).get();
            if (!rSnap.exists) { console.log(`  REQUEST ${rid}: ❌ NO EXISTE`); continue; }
            const req = rSnap.data();
            console.log(`  REQUEST ${rid}: status=${req.status} seatCount=${req.seatCount??'LEGACY'} selectedSeats=${JSON.stringify(req.selectedSeats??'LEGACY')} name=${req.passengerName}`);
        }
    }

    // Users
    const users = [
        { id: 'cABhlnb9YCgWq3O7zF9bMFM5soo2', label: 'Eduardo' },
        { id: 'DPTW6GRx0seU0mktKJm5kxCqTst2', label: 'Maria' }
    ];
    console.log('\nUSERS:');
    for (const { id, label } of users) {
        const uSnap = await db.doc(`users/${id}`).get();
        if (!uSnap.exists) { console.log(`  ${label}: ❌ NO EXISTE`); continue; }
        const u = uSnap.data();
        console.log(`  ${label} (${u.name}): activeRideId=${u.activeRideId||'NONE'} sharedStatus=${u.sharedRideStatus||'N/A'} groupId=${u.activeSharedRideGroupId||'NONE'}`);
    }

    console.log('\n=== FIN AUDIT ===\n');
    process.exit(0);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
