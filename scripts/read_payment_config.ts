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

async function readPaymentConfig() {
    const paymentConfigRef = db.collection('system_config').doc('payment_config');
    const doc = await paymentConfigRef.get();
    if (doc.exists) {
        console.log("Config actual en Firestore:");
        console.log(JSON.stringify(doc.data(), null, 2));
    } else {
        console.log("No existe system_config/payment_config");
    }
}

readPaymentConfig().then(() => process.exit(0)).catch(console.error);
