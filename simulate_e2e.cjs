/**
 * E2E Simulator - VamO Compartido con asientos
 * Simula el flujo completo: pasajero crea grupo → segundo pasajero se une → conductor acepta
 */
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

// IDs conocidos
const CESAR_UID = 'kGYoQYSpGjWeVwJxo4dKBqOrjSy1';   // pasajero 1 (test)
const MARIA_UID = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';   // pasajero 2 (test)
const DRIVER_UID = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';  // conductor Eduardo

// Coordenadas fijas Rawson (ciudad habilitada para VamO Compartido)
const ORIGIN_CESAR = {
    lat: -43.3001, lng: -65.1020,
    address: 'Av. Rivadavia 350, Rawson',
    city: 'rawson'
};
const DEST_CESAR = {
    lat: -43.3089, lng: -65.1150,
    address: 'Centro Cívico, Rawson',
    city: 'rawson'
};
const ORIGIN_MARIA = {
    lat: -43.3005, lng: -65.1028,
    address: 'San Martín 120, Rawson',
    city: 'rawson'
};
const DEST_MARIA = {
    lat: -43.3085, lng: -65.1145,
    address: 'Centro Cívico, Rawson',
    city: 'rawson'
};

const CITY_KEY = 'rawson';
const FARE = 9500;

const { GoogleAuth } = require('google-auth-library');

// Cache de tokens para no re-autenticar en cada call
const tokenCache = {};

async function getIdToken(uid) {
    // Usar Admin SDK para crear custom token, luego canjearlo via Firebase REST
    // Como la API Key tiene restricción de referrer, usamos el endpoint de emulación de Auth
    // En su lugar, usamos una técnica alternativa: generar token OAuth2 de servicio y
    // llamar a las funciones directamente usando uid como claim
    const customToken = await auth.createCustomToken(uid, { uid });
    
    // Intercambiamos via el endpoint sin restricción de referrer
    const resp = await fetch(
        `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA`,
        {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Referer': 'https://vamoapp.com.ar'
            },
            body: JSON.stringify({ token: customToken, returnSecureToken: true })
        }
    );
    const json = await resp.json();
    if (!json.idToken) throw new Error('No idToken: ' + JSON.stringify(json).slice(0, 300));
    return json.idToken;
}

async function callFunction(uid, functionName, data) {
    const idToken = await getIdToken(uid);
    
    // Firebase Callable Functions v2 - Cloud Run URL
    const url = `https://us-central1-studio-6697160840-7c67f.cloudfunctions.net/${functionName}`;
    
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ data })
    });
    
    const text = await resp.text();
    let result;
    try { result = JSON.parse(text); } catch { throw new Error(`Invalid JSON from ${functionName}: ${text.slice(0,300)}`); }
    
    if (result.error) throw new Error(`${functionName} error: ${JSON.stringify(result.error)}`);
    return result.result;
}




function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmt(obj) {
    return JSON.stringify(obj, (k, v) => {
        if (v && typeof v === 'object' && v._seconds !== undefined)
            return new Date(v._seconds * 1000).toISOString();
        return v;
    }, 2);
}

async function auditGroup(groupId) {
    if (!groupId) return;
    const snap = await db.doc(`shared_ride_groups/${groupId}`).get();
    const g = snap.data();
    if (!g) return console.log('  ⚠️  Grupo no encontrado');
    console.log(`  Grupo ${groupId}:`);
    console.log(`    status: ${g.status}`);
    console.log(`    requestCount: ${g.requestCount}`);
    console.log(`    occupiedSeats: ${g.occupiedSeats}`);
    console.log(`    maxRequests: ${g.maxRequests}`);
    console.log(`    seatMap keys: ${g.seatMap ? Object.keys(g.seatMap).join(', ') : 'VACÍO'}`);
    console.log(`    driverId: ${g.driverId || 'VACÍO'}`);
    console.log(`    finalRideId: ${g.finalRideId || 'VACÍO'}`);
}

async function auditUser(uid, label) {
    const snap = await db.doc(`users/${uid}`).get();
    const u = snap.data();
    console.log(`  ${label}: sharedRideStatus=${u?.sharedRideStatus || 'VACÍO'} | activeGroupId=${u?.activeSharedRideGroupId || 'VACÍO'} | activeReqId=${u?.activeSharedRequestId || 'VACÍO'}`);
}

async function main() {
    console.log('\n🚀 ========== E2E SIMULATOR - VamO Compartido con Asientos ==========\n');

    // ── PRE-CHECK: limpiar si quedan residuos
    const [cesarSnap, mariaSnap, driverSnap] = await Promise.all([
        db.doc(`users/${CESAR_UID}`).get(),
        db.doc(`users/${MARIA_UID}`).get(),
        db.doc(`users/${DRIVER_UID}`).get(),
    ]);
    const cesar = cesarSnap.data();
    const maria = mariaSnap.data();
    
    if (cesar?.activeSharedRequestId || cesar?.sharedRideStatus) {
        console.log('⚠️  César tiene estado residual — limpiando...');
        await db.doc(`users/${CESAR_UID}`).update({
            sharedRideStatus: admin.firestore.FieldValue.delete(),
            activeSharedRequestId: admin.firestore.FieldValue.delete(),
            activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
            activeRideId: admin.firestore.FieldValue.delete(),
        });
    }
    if (maria?.activeSharedRequestId || maria?.sharedRideStatus) {
        console.log('⚠️  María tiene estado residual — limpiando...');
        await db.doc(`users/${MARIA_UID}`).update({
            sharedRideStatus: admin.firestore.FieldValue.delete(),
            activeSharedRequestId: admin.firestore.FieldValue.delete(),
            activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
            activeRideId: admin.firestore.FieldValue.delete(),
        });
    }
    console.log('✅ Ambiente limpio\n');

    // ── PASO 1: César solicita viaje compartido (2 asientos)
    console.log('📍 PASO 1: César solicita viaje compartido con 2 asientos...');
    let cesarResult;
    try {
        cesarResult = await callFunction(CESAR_UID, 'requestSharedRideV1', {
            origin: ORIGIN_CESAR,
            destination: DEST_CESAR,
            cityKey: CITY_KEY,
            individualFareReference: FARE,
            sharedRideNoticeAccepted: true,
            selectedSeats: ['rear_left', 'rear_center']
        });
        console.log('  ✅ César solicitó:', JSON.stringify(cesarResult));
    } catch (e) {
        console.log('  ❌ Error:', e.message);
        process.exit(1);
    }

    const groupId = cesarResult.groupId || cesarResult.requestId;
    const cesarRequestId = cesarResult.requestId;
    
    await sleep(2000);
    console.log('\n📊 Estado después de César:');
    await auditUser(CESAR_UID, 'César');
    
    // Buscar el grupo real
    const cesarUserSnap = await db.doc(`users/${CESAR_UID}`).get();
    const realGroupId = cesarUserSnap.data()?.activeSharedRideGroupId || groupId;
    await auditGroup(realGroupId);

    // ── PASO 2: María busca grupos cercanos
    await sleep(3000);
    console.log('\n📍 PASO 2: María busca grupos compartidos cercanos...');
    let nearbyGroups;
    try {
        nearbyGroups = await callFunction(MARIA_UID, 'listNearbySharedRideGroupsV1', {
            origin: ORIGIN_MARIA,
            destination: DEST_MARIA,
            cityKey: CITY_KEY
        });
        console.log('  Grupos encontrados:', nearbyGroups?.groups?.length || 0);
        if (nearbyGroups?.groups?.length > 0) {
            nearbyGroups.groups.forEach(g => {
                console.log(`  [${g.groupId}] pax=${g.passengerCount}/${g.maxPassengers} dist=${Math.round(g.distanceToPickupM)}m seats=${g.occupiedSeats?.join(',')||'VACÍO'}`);
            });
        }
    } catch (e) {
        console.log('  ⚠️  Error listando grupos:', e.message);
        nearbyGroups = { groups: [] };
    }

    // ── PASO 3: María se une al grupo de César
    await sleep(2000);
    console.log('\n📍 PASO 3: María se une al grupo (asientos: front_passenger + rear_right)...');
    let mariaResult;
    try {
        mariaResult = await callFunction(MARIA_UID, 'joinSharedRideGroupV1', {
            groupId: realGroupId,
            origin: ORIGIN_MARIA,
            destination: DEST_MARIA,
            cityKey: CITY_KEY,
            individualFareReference: FARE + 1000,
            sharedRideNoticeAccepted: true,
            selectedSeats: ['front_passenger', 'rear_right']
        });
        console.log('  ✅ María se unió:', JSON.stringify(mariaResult));
    } catch (e) {
        console.log('  ❌ Error al unirse:', e.message);
        process.exit(1);
    }

    await sleep(2000);
    console.log('\n📊 Estado después de que María se une:');
    await auditUser(CESAR_UID, 'César');
    await auditUser(MARIA_UID, 'María ');
    await auditGroup(realGroupId);

    // ── PASO 4: Verificar que el grupo lanzó búsqueda de conductor
    await sleep(3000);
    const groupSnap = await db.doc(`shared_ride_groups/${realGroupId}`).get();
    const groupData = groupSnap.data();
    
    console.log('\n📊 Estado final del grupo:');
    console.log(fmt({
        status: groupData?.status,
        requestCount: groupData?.requestCount,
        occupiedSeats: groupData?.occupiedSeats,
        maxRequests: groupData?.maxRequests,
        seatMap: groupData?.seatMap,
        finalRideId: groupData?.finalRideId,
        driverId: groupData?.driverId
    }));

    // ── PASO 5: Si el grupo lanzó driver search, esperar ride
    if (groupData?.status === 'ready_for_driver' || groupData?.status === 'searching_driver' || groupData?.finalRideId) {
        console.log('\n✅ GRUPO LISTO - Buscando conductor...');
        
        // Esperar hasta 30 segundos para que se asigne conductor
        for (let i = 0; i < 10; i++) {
            await sleep(3000);
            const gs = await db.doc(`shared_ride_groups/${realGroupId}`).get();
            const gd = gs.data();
            console.log(`  [${i+1}/10] grupo.status=${gd?.status} | finalRideId=${gd?.finalRideId || 'VACÍO'}`);
            if (gd?.finalRideId || gd?.driverId) {
                console.log(`\n✅ Conductor asignado! rideId=${gd.finalRideId} driverId=${gd.driverId}`);
                break;
            }
        }
    } else {
        console.log(`\n⚠️  Grupo en estado: ${groupData?.status} — no lanzó búsqueda automáticamente`);
        console.log('   Puede requerir trigger manual via launchSharedRideDriverSearchV1');
    }

    // ── DIAGNÓSTICO FINAL
    console.log('\n📊 DIAGNÓSTICO FINAL:');
    await auditUser(CESAR_UID, 'César');
    await auditUser(MARIA_UID, 'María ');
    const driverUserSnap = await db.doc(`users/${DRIVER_UID}`).get();
    const driverData = driverUserSnap.data();
    console.log(`  Conductor: driverStatus=${driverData?.driverStatus} | isAvailable=${driverData?.isAvailable} | activeRideId=${driverData?.activeRideId || 'VACÍO'}`);
    
    console.log('\n🏁 ========== FIN SIMULACIÓN ==========\n');
    process.exit(0);
}

main().catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });
