import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// IMPORTANT: No hardcoded credentials. 
// Uses GOOGLE_APPLICATION_CREDENTIALS env var via applicationDefault()
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
});

const db = admin.firestore();
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE_URL = `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

async function getIdToken(email: string): Promise<string> {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            email,
            password: '123456',
            returnSecureToken: true
        }),
        headers: { 
            'Content-Type': 'application/json',
            'Referer': `https://${AUTH_DOMAIN}`
        }
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`Auth Error (${email}): ${JSON.stringify(data)}`);
    return data.idToken;
}

async function callFunction(name: string, token: string, data: any) {
    const url = `${BASE_URL}/${name}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ data }),
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const resData: any = await res.json();
        if (!res.ok) throw new Error(`Function Error ${name}: ${JSON.stringify(resData)}`);
        return resData.result;
    } catch (err: any) {
        console.error(`Error calling ${name}:`, err.message);
        throw err;
    }
}

async function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function testSingleRide() {
    console.log('🏁 INICIANDO VIAJE DE PRUEBA (CAJA NEGRA)');
    
    const passengerEmail = 'autorcompositoreducisneros@gmail.com';
    const driverEmail = 'cesareduardobres@gmail.com';
    const passengerId = '7hqhTZTheJYtF2C3n9GM7hvGajR2';
    const driverId = 'hBBDZRKgBVQGetjHxZvNFst6pBg1';

    console.log('[AUTH] Obteniendo tokens reales...');
    const pToken = await getIdToken(passengerEmail);
    const dToken = await getIdToken(driverEmail);

    // 1. Create Ride
    console.log('[PASAJERO] Solicitando viaje (createRideV1)...');
    const paymentMethod = process.env.TEST_PAYMENT_METHOD || 'wallet';
    const createRes = await callFunction('createRideV1', pToken, {
        origin: { address: 'Rawson Centro', lat: -43.30, lng: -65.04 },
        destination: { address: 'Playa Unión', lat: -43.33, lng: -65.03 },
        paymentMethod: paymentMethod,
        serviceType: 'professional',
        cityKey: 'rawson'
    });
    const rideId = createRes.rideId;
    console.log(`[OK] Viaje creado: ${rideId}`);

    // 2. Wait for Matching & Offer
    console.log('[CONDUCTOR] Esperando oferta (polling 60s)...');
    let offerId = '';
    for (let i = 0; i < 30; i++) {
        const offerSnap = await db.collection('rideOffers')
            .where('rideId', '==', rideId)
            .where('driverId', '==', driverId)
            .get();
        if (!offerSnap.empty) {
            offerId = offerSnap.docs[0].id;
            break;
        }
        await sleep(2000);
    }
    if (!offerId) throw new Error('Matching timeout: Oferta no encontrada para el conductor.');
    console.log(`[OK] Oferta recibida: ${offerId}`);

    // 3. Accept
    console.log('[CONDUCTOR] Aceptando (acceptRideV2)...');
    await callFunction('acceptRideV2', dToken, { rideId });

    // 4. Arrived
    console.log('[CONDUCTOR] Llegué (driverArrivedV1)...');
    await callFunction('driverArrivedV1', dToken, { rideId });

    // 5. Start
    console.log('[CONDUCTOR] Iniciando (startRideV1)...');
    await callFunction('startRideV1', dToken, { rideId });

    // 6. Finish
    console.log('[CONDUCTOR] Finalizando (finishRideV1)...');
    await callFunction('finishRideV1', dToken, { rideId });

    console.log('[AUDITORÍA] Esperando liquidación (polling 60s)...');
    let ride: any = null;
    for (let i = 0; i < 20; i++) {
        const rideSnap = await db.doc(`rides/${rideId}`).get();
        ride = rideSnap.data();
        if (ride?.status === 'completed' && ride?.settledAt) {
            console.log(`[OK] Liquidación detectada en el intento ${i + 1}`);
            break;
        }
        await sleep(3000);
    }

    console.log('\n--- RESULTADO FINAL ---');
    console.log(`Status: ${ride?.status}`);
    console.log(`SettledAt: ${ride?.settledAt ? 'SI' : 'NO'}`);
    console.log(`Passenger Balance Mirror: ${(await db.doc(`users/${passengerId}`).get()).data()?.currentBalance}`);
    console.log(`Driver Balance Mirror: ${(await db.doc(`users/${driverId}`).get()).data()?.currentBalance}`);
    
    if (ride?.status === 'completed' && ride?.settledAt) {
        console.log('\n✅ PRUEBA DE CAJA NEGRA EXITOSA');
    } else {
        console.log('\n❌ FALLA EN LIQUIDACIÓN O ESTADO');
    }
}

testSingleRide().catch(console.error);
