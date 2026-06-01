/**
 * Diagnóstico: Reservas no aparecen en el tab del conductor
 * Verifica rides con status 'scheduled' y compara con cityKey del conductor
 */
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const REAL_DRIVER_ID = '1BIk2VyuwEZLmHRVbXE52rhFYen2';

async function diagnose() {
    console.log('=== DIAGNÓSTICO: RESERVAS NO APARECEN ===\n');

    // 1. cityKey del conductor
    const userSnap = await db.doc(`users/${REAL_DRIVER_ID}`).get();
    const u = userSnap.data();
    const driverCity = u?.operatingAreaId || u?.cityKey || '';
    console.log(`Conductor cityKey: "${driverCity}" (operatingAreaId: "${u?.operatingAreaId}", cityKey: "${u?.cityKey}")\n`);

    // 2. Todos los viajes scheduled en Firestore
    console.log('--- Viajes con status "scheduled" en Firestore ---');
    const snap = await db.collection('rides')
        .where('status', '==', 'scheduled')
        .limit(20)
        .get();

    if (snap.empty) {
        console.log('⚠️  NO HAY viajes con status = scheduled');
    } else {
        snap.docs.forEach(doc => {
            const d = doc.data();
            const matchExact = (d.cityKey || '').toLowerCase() === driverCity.toLowerCase();
            const matchContains = (d.cityKey || '').toLowerCase().includes(driverCity.toLowerCase()) || 
                                  driverCity.toLowerCase().includes((d.cityKey || '').toLowerCase());
            console.log(`  rideId: ${doc.id}`);
            console.log(`    cityKey del viaje: "${d.cityKey}"`);
            console.log(`    scheduledAt: ${d.scheduledAt?.toDate?.()?.toISOString() || 'sin fecha'}`);
            console.log(`    passengerId: ${d.passengerId}`);
            console.log(`    isSimulation: ${d.isSimulation}`);
            console.log(`    interestedDriverIds: ${JSON.stringify(d.interestedDriverIds || [])}`);
            console.log(`    ¿Coincide con conductor? exact=${matchExact}, contains=${matchContains}`);
            console.log('');
        });
    }

    // 3. Últimos viajes scheduled+searching (incluyendo simulaciones)
    console.log('--- Viajes "scheduled" + "searching" recientes (sin filtro de ciudad) ---');
    const snap2 = await db.collection('rides')
        .where('status', 'in', ['scheduled', 'searching'])
        .limit(20)
        .get();

    if (snap2.empty) {
        console.log('No hay ninguno.');
    } else {
        snap2.docs.forEach(doc => {
            const d = doc.data();
            console.log(`  id=${doc.id} | status=${d.status} | city=${d.cityKey} | sim=${d.isSimulation} | scheduled=${d.scheduledAt?.toDate?.()?.toISOString()}`);
        });
    }

    // 4. Últimas rides creadas (independiente de status) para ver si la reserva existe
    console.log('\n--- Últimos 10 rides creados ---');
    const snap3 = await db.collection('rides')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
    snap3.docs.forEach(doc => {
        const d = doc.data();
        console.log(`  id=${doc.id} | status=${d.status} | city=${d.cityKey} | sim=${d.isSimulation} | scheduledAt=${d.scheduledAt?.toDate?.()?.toISOString() || 'N/A'} | createdAt=${d.createdAt?.toDate?.()?.toISOString()}`);
    });

    console.log('\n=== FIN ===');
    process.exit(0);
}

diagnose().catch(e => { console.error(e.message); process.exit(1); });
