import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkPricing() {
    const p1 = await db.doc('pricing/rio_gallegos_v1').get();
    const p2 = await db.doc('pricing/rio_gallegos').get();
    
    console.log("pricing/rio_gallegos_v1 exists:", p1.exists);
    if (p1.exists) console.log(JSON.stringify(p1.data(), null, 2));
    
    console.log("pricing/rio_gallegos exists:", p2.exists);
    if (p2.exists) console.log(JSON.stringify(p2.data(), null, 2));

    process.exit(0);
}

checkPricing();
