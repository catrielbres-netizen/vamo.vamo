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

async function getEduardoDetails() {
    const uid = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    console.log("Eduardo UID:", uid);
    
    // Find MP Account details
    const mpAccountRef = db.collection('mp_accounts').doc(uid);
    const mpAccountSnap = await mpAccountRef.get();
    
    if (mpAccountSnap.exists) {
        const mpData = mpAccountSnap.data();
        console.log("Eduardo MP User ID:", mpData?.mpUserId);
    } else {
        console.log("Eduardo MP Account not found.");
    }
}

getEduardoDetails().then(() => process.exit(0)).catch(console.error);
