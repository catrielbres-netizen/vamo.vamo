import admin from 'firebase-admin';
import * as fs from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-67100ac4cc.json';
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function reset() {
    const uid = '7hqhTZTheJYtF2C3n9GM7hvGajR2';
    console.log('Resetting passenger account:', uid);
    
    await db.doc(`users/${uid}`).update({
        currentBalance: 12000,
        legacyMigrated: true,
        activeRideId: null
    });
    
    await db.doc(`wallets/${uid}`).set({
        userId: uid,
        cashBalance: 12000,
        legacyMigrated: true,
        lockedCash: 0,
        promoBalance: 0,
        lockedPromo: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('Reset complete.');
}

reset().catch(console.error);
