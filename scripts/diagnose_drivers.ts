import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccountPath = join(process.cwd(), 'firebase-adminsdk.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function main() {
    const driversSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .get();

    console.log(`Analyzing ${driversSnap.size} drivers...`);
    for (const doc of driversSnap.docs) {
        const d = doc.data();
        const uid = doc.id;
        const walletSnap = await db.collection('wallets').doc(uid).get();
        const balance = walletSnap.exists ? (walletSnap.data()?.cashBalance || 0) : (d.currentBalance || 0);
        
        console.log(`---`);
        console.log(`ID: ${uid}`);
        console.log(`Name: ${d.name} ${d.surname}`);
        console.log(`driverRiskLevel: ${d.driverRiskLevel}`);
        console.log(`riskReasons: ${JSON.stringify(d.riskReasons)}`);
        console.log(`currentBalance (doc): ${d.currentBalance}`);
        console.log(`cashBalance (wallet): ${balance}`);
        console.log(`isSuspended: ${d.isSuspended}`);
        console.log(`approved: ${d.approved}`);
        console.log(`municipalStatus: ${d.municipalStatus}`);
        console.log(`driverSubtype: ${d.driverSubtype}`);
        console.log(`driverStatus: ${d.driverStatus}`);
    }
}

main().catch(console.error);
