import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'firebase-adminsdk.json');

async function manageDynamicPricing() {
    if (!fs.existsSync(serviceAccountPath)) {
        console.error(`❌ ERROR: Service account not found at ${serviceAccountPath}`);
        process.exit(1);
    }

    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountPath)
            });
        }
    } catch (error: any) {
        console.error("❌ Failed to initialize Admin SDK:", error.message);
        process.exit(1);
    }

    const db = admin.firestore();
    const city = 'rawson';
    const docRef = db.collection('municipal_pricing').doc(city);

    const action = process.argv[2]; // 'check', 'enable', 'disable'

    try {
        const doc = await docRef.get();
        if (!doc.exists) {
            console.error(`❌ City ${city} not found in municipal_pricing.`);
            process.exit(1);
        }

        const data = doc.data() || {};
        const dp = data.dynamicPricing || {};

        if (action === 'check') {
            console.log(`\n📊 Current state for ${city}:`);
            console.log(`- Enabled: ${dp.enabled}`);
            console.log(`- Current Discount: ${dp.currentDiscountPercent}%`);
            console.log(`- Last updated by: ${dp.updatedBy}`);
        } else if (action === 'enable') {
            const percent = parseInt(process.argv[3]) || 10;
            console.log(`\n🚀 Enabling dynamic pricing for ${city} at ${percent}%...`);
            await docRef.update({
                'dynamicPricing.enabled': true,
                'dynamicPricing.currentDiscountPercent': percent,
                'dynamicPricing.updatedBy': 'admin_manual_activation'
            });
            console.log("✅ Dynamic pricing enabled.");
        } else if (action === 'disable') {
            console.log(`\n🛑 Disabling dynamic pricing for ${city}...`);
            await docRef.update({
                'dynamicPricing.enabled': false,
                'dynamicPricing.currentDiscountPercent': 0,
                'dynamicPricing.updatedBy': 'safety_reset_after_passenger_ui_test'
            });
            console.log("✅ Dynamic pricing disabled.");
        } else {
            console.log("Usage: npx tsx scripts/admin/manage_dynamic_pricing.ts <check|enable|disable> [percent]");
        }

    } catch (error: any) {
        console.error("❌ FAILED:", error.message);
        process.exit(1);
    }
}

manageDynamicPricing();
