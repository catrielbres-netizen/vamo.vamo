import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!existsSync(serviceAccountPath)) {
  console.error('No service account found!');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function setupPaymentConfig() {
    const paymentConfigRef = db.collection('system_config').doc('payment_config');
    
    const configData = {
        MP_SINGLE_DRIVER_MODE: true,
        MP_SPLIT_ENABLED: true,
        VAMO_COMMISSION_PERCENT: 18,
        paymentProvider: "mercadopago",
        checkoutMode: "checkout_pro",
        ownerDriverUid: "VNhou0ag4wXXPr6IXa3foO6SI8B3", // Eduardo
        marketplaceOwnerMpUserId: "665467758", // Eduardo MP
        avoidSplitWhenSellerIsMarketplaceOwner: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await paymentConfigRef.set(configData, { merge: true });
    console.log("payment_config successfully updated:", configData);
}

setupPaymentConfig().then(() => process.exit(0)).catch(console.error);
