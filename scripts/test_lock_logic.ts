import admin from 'firebase-admin';
import * as fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Mock dependencies if needed, but here we want to test the REAL code
import { lockWalletForRide } from '../functions/src/lib/wallet';

async function testLock() {
    const userId = '7hqhTZTheJYtF2C3n9GM7hvGajR2';
    const rideId = 'test_local_' + Date.now();
    
    console.log('Testing lock for ride:', rideId);
    
    await db.runTransaction(async (tx) => {
        await lockWalletForRide(userId, rideId, 100, tx, 'wallet');
    });
    
    console.log('Lock transaction committed.');
    const snap = await db.doc(`wallet_transactions/lock_${rideId}`).get();
    console.log('Transaction doc exists:', snap.exists);
    if (snap.exists) console.log('Data:', snap.data());
}

testLock().catch(console.error);
