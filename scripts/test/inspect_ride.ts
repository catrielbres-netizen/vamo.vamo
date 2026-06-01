import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

async function inspectWallet() {
    const db = admin.firestore();
    const driverId = 'tester_driver_v4';
    
    console.log(`--- INSPECTING WALLET: ${driverId} ---`);
    const walletSnap = await db.collection('wallets').doc(driverId).get();
    if (!walletSnap.exists) {
        console.log("❌ Wallet not found!");
    } else {
        console.log(JSON.stringify(walletSnap.data(), null, 2));
    }

    console.log("--- MOVEMENTS ---");
    const moves = await db.collection(`wallets/${driverId}/movements`).orderBy('createdAt', 'desc').limit(5).get();
    moves.docs.forEach(d => {
        const m = d.data();
        console.log(`- ${m.type}: ${m.amount} (${m.note})`);
    });
}

inspectWallet().then(() => process.exit(0));
