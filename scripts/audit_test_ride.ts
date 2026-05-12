import admin from 'firebase-admin';
import * as fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function audit(rideId: string, pId: string, dId: string) {
    console.log('--- AUDIT REPORT ---');
    const ride = (await db.doc(`rides/${rideId}`).get()).data();
    const p = (await db.doc(`users/${pId}`).get()).data();
    const d = (await db.doc(`users/${dId}`).get()).data();
    const pw = (await db.doc(`wallets/${pId}`).get()).data();
    const dw = (await db.doc(`wallets/${dId}`).get()).data();

    console.log('RIDE:', { id: rideId, status: ride?.status, settledAt: ride?.settledAt?.toDate() });
    console.log('PASSENGER:', { id: pId, mirror: p?.currentBalance, wallet: pw?.cashBalance });
    console.log('DRIVER:', { id: dId, mirror: d?.currentBalance, wallet: dw?.cashBalance });

    console.log('\n--- WALLET TRANSACTIONS (PASSENGER) ---');
    const pTx = await db.collection('wallet_transactions')
        .where('userId', '==', pId)
        .where('rideId', '==', rideId)
        .get();
    pTx.forEach(t => console.log(t.id, t.data()));

    console.log('\n--- WALLET MOVEMENTS (DRIVER) ---');
    const dMov = await db.collection('wallet_movements')
        .where('userId', '==', dId)
        .where('rideId', '==', rideId)
        .get();
    dMov.forEach(m => console.log(m.id, m.data()));
}

audit('aTQsHe11P0B30gxBhJMo', '7hqhTZTheJYtF2C3n9GM7hvGajR2', 'hBBDZRKgBVQGetjHxZvNFst6pBg1').catch(console.error);
