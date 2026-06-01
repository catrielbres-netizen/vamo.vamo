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
    const uid = '1BIk2VyuwEZLmHRVbXE52rhFYen2';
    const userSnap = await db.collection('users').doc(uid).get();
    const walletSnap = await db.collection('wallets').doc(uid).get();

    console.log('USER DOC:', JSON.stringify(userSnap.data(), null, 2));
    console.log('WALLET DOC:', JSON.stringify(walletSnap.data(), null, 2));
}

main().catch(console.error);
