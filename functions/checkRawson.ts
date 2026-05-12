
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkRawson() {
    const pricingRef = db.doc('municipal_pricing/rawson');
    const snap = await pricingRef.get();
    if (!snap.exists) {
        console.log('Rawson pricing document not found.');
        return;
    }
    const data = snap.data();
    console.log('Rawson Pricing Config:', JSON.stringify(data, null, 2));
    console.log('dynamicPricing.enabled:', data?.dynamicPricing?.enabled);
    console.log('dynamicPricing.currentDiscountPercent:', data?.dynamicPricing?.currentDiscountPercent);
}

checkRawson().catch(console.error);
