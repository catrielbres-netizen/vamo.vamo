
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function setDynamicPricing(enabled: boolean, discount: number) {
    const pricingRef = db.doc('municipal_pricing/rawson');
    await pricingRef.update({
        'dynamicPricing.enabled': enabled,
        'dynamicPricing.currentDiscountPercent': discount,
        'dynamicPricing.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        'dynamicPricing.updatedBy': 'antigravity_validator'
    });
    console.log(`Rawson dynamicPricing set to: enabled=${enabled}, discount=${discount}`);
}

setDynamicPricing(true, 10).catch(console.error);
