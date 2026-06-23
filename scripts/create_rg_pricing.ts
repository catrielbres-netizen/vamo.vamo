import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function createPricing() {
    const rawsonDoc = await db.doc('pricing/rawson_v1').get();
    
    if (!rawsonDoc.exists) {
        console.error("rawson_v1 pricing not found!");
        process.exit(1);
    }

    const pricingData = rawsonDoc.data()!;
    // Set some defaults for Rio Gallegos just in case, but keep the structure the same
    pricingData.cityKey = "rio_gallegos";
    pricingData.version = 1;
    pricingData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    pricingData.updatedBy = "admin";
    
    // We can tweak base fares if needed, but cloning Rawson is fine for testing
    
    await db.doc('pricing/rio_gallegos_v1').set(pricingData);
    console.log("Created pricing/rio_gallegos_v1 based on Rawson.");
    
    process.exit(0);
}

createPricing();
