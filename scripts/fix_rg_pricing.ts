import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function fixPricing() {
    const rawsonSnap = await db.doc('cities/rawson').get();
    const rawsonData = rawsonSnap.data();

    if (!rawsonData || !rawsonData.pricing) {
        console.error("rawson pricing missing!");
        process.exit(1);
    }

    const cityRef = db.doc('cities/rio_gallegos');
    await cityRef.update({
        pricing: rawsonData.pricing
    });

    console.log("Updated cities/rio_gallegos with default pricing config from rawson!");
    process.exit(0);
}

fixPricing();
