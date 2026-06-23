import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function listPricing() {
    const snap = await db.collection('pricing').get();
    snap.forEach(doc => {
        console.log("Pricing doc:", doc.id);
    });
    process.exit(0);
}

listPricing();
