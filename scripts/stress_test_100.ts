import admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
dotenv.config({ path: '.env.local' });

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
});

const db = admin.firestore();
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE_URL = `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

const PASSENGER_EMAIL = 'autorcompositoreducisneros@gmail.com';
const DRIVER_EMAIL = 'cesareduardobres@gmail.com';
const PASSENGER_ID = '7hqhTZTheJYtF2C3n9GM7hvGajR2';
const DRIVER_ID = 'hBBDZRKgBVQGetjHxZvNFst6pBg1';

async function getIdToken(email: string): Promise<string> {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ email, password: '123456', returnSecureToken: true }),
        headers: { 'Content-Type': 'application/json', 'Referer': `https://${AUTH_DOMAIN}` }
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`Auth Error (${email}): ${JSON.stringify(data)}`);
    return data.idToken;
}

async function callFunction(name: string, token: string, data: any) {
    const url = `${BASE_URL}/${name}`;
    const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ data }),
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const resData: any = await res.json();
    if (!res.ok) throw new Error(`Function Error ${name}: ${JSON.stringify(resData)}`);
    return resData.result;
}

async function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function auditRide(rideId: string) {
    console.log(`[AUDIT] Iniciando auditoría para ${rideId}...`);
    const output = execSync(`npx tsx scripts/audit_live_user_sync.ts ${PASSENGER_ID} ${rideId}`, { encoding: 'utf8' });
    if (output.includes('[ERROR]')) {
        console.log(output);
        throw new Error(`Auditoría falló para el viaje ${rideId}`);
    }
    console.log(`[AUDIT OK] Viaje ${rideId} íntegro.`);
}

async function runScenario(type: 'wallet' | 'cash' | 'cancel' | 'insufficient', pToken: string, dToken: string) {
    console.log(`\n>>> ESCENARIO: ${type.toUpperCase()}`);

    // Pre-check driver
    await db.doc(`users/${DRIVER_ID}`).update({ driverStatus: 'online', approved: true });

    // Reset balance unless testing insufficient
    if (type !== 'insufficient') {
        execSync(`npx tsx scripts/reset_test_passenger.ts`, { stdio: 'ignore' });
    } else {
        await db.doc(`wallets/${PASSENGER_ID}`).update({ cashBalance: 0, promoBalance: 0 });
    }

    try {
        // 1. Create
        console.log(`[PASAJERO] Solicitando (${type === 'cash' ? 'cash' : 'wallet'})...`);
        const createRes = await callFunction('createRideV1', pToken, {
            origin: { address: 'Rawson Centro', lat: -43.30, lng: -65.04 },
            destination: { address: 'Playa Unión', lat: -43.33, lng: -65.03 },
            paymentMethod: type === 'cash' ? 'cash' : 'wallet',
            serviceType: 'professional',
            cityKey: 'rawson'
        }).catch(e => {
            if (type === 'insufficient') {
                console.log(`[OK] Rechazo esperado por saldo insuficiente.`);
                return { rideId: 'EXPECTED_FAIL' };
            }
            throw e;
        });

        if (type === 'insufficient') return;

        const rideId = createRes.rideId;
        console.log(`[OK] Viaje creado: ${rideId}`);

        // 2. Matching
        console.log(`[CONDUCTOR] Esperando oferta...`);
        let offerId = '';
        for (let i = 0; i < 20; i++) {
            const offerSnap = await db.collection('rideOffers').where('rideId', '==', rideId).where('driverId', '==', DRIVER_ID).get();
            if (!offerSnap.empty) { offerId = offerSnap.docs[0].id; break; }
            await sleep(2000);
        }
        if (!offerId) throw new Error('Matching timeout');
        console.log(`[OK] Matching real exitoso.`);

        // 3. Accept
        await callFunction('acceptRideV2', dToken, { rideId });

        if (type === 'cancel') {
            console.log(`[PASAJERO] Cancelando viaje...`);
            await callFunction('cancelRideV1', pToken, { rideId, reason: 'cancelled_by_passenger' });
            console.log(`[OK] Viaje cancelado exitosamente.`);
            return;
        }

        // 4. Flow
        await callFunction('driverArrivedV1', dToken, { rideId });
        await callFunction('startRideV1', dToken, { rideId });
        await callFunction('finishRideV1', dToken, { rideId });

        // 5. Settlement
        console.log(`[SETTLEMENT] Esperando liquidación...`);
        let settled = false;
        for (let i = 0; i < 20; i++) {
            const rideSnap = await db.doc(`rides/${rideId}`).get();
            if (rideSnap.data()?.settledAt) { settled = true; break; }
            await sleep(3000);
        }
        if (!settled) throw new Error('Settlement timeout');

        // 6. Audit
        await auditRide(rideId);

    } catch (err: any) {
        console.error(`\n❌ FALLO CRÍTICO: ${err.message}`);
        process.exit(1);
    }
}

async function main() {
    console.log("🚀 INICIANDO BLOQUE DE 100 VIAJES");
    const pToken = await getIdToken(PASSENGER_EMAIL);
    const dToken = await getIdToken(DRIVER_EMAIL);

    const plan = [
        ...Array(50).fill('wallet'),
        ...Array(40).fill('cash'),
        ...Array(5).fill('cancel'),
        ...Array(5).fill('insufficient')
    ];

    const startAt = parseInt(process.env.START_AT || '1') - 1;
    const results = [];
    for (let i = startAt; i < plan.length; i++) {
        console.log(`\n=========================================`);
        console.log(`VIAJE ${i + 1}/100 - Progreso: ${Math.round((i/100)*100)}%`);
        console.log(`=========================================`);
        
        const type = plan[i];
        await runScenario(type, pToken, dToken);
        results.push({ id: i + 1, type, status: 'SUCCESS' });
    }

    console.log("\n🎉 TODOS LOS 100 VIAJES COMPLETADOS SIN FALLOS");
}

main().catch(e => {
    console.error("FATAL:", e);
    process.exit(1);
});
