import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId
  });
}

const db = getFirestore();
const auth = getAuth();

async function deleteDriver() {
  const uid = 'W0ZgybBVmVbEx0UXUmleUeGG6Fq2';
  const email = 'cesareduardobres@gmail.com';

  console.log(`Starting deletion for ${email} (UID: ${uid})...`);

  // 1. Delete from Auth
  try {
    await auth.deleteUser(uid);
    console.log(`✅ Deleted from Firebase Auth.`);
  } catch (err: any) {
    console.log(`⚠️ Error deleting from Auth (maybe already deleted?):`, err.message);
  }

  // 2. Delete Firestore docs
  const cols = [
    'users',
    'wallets',
    'drivers_locations',
    'municipal_profiles',
    'driver_documents',
    'driver_vehicles'
  ];

  for (const col of cols) {
    try {
      await db.collection(col).doc(uid).delete();
      console.log(`✅ Deleted document ${col}/${uid}`);
    } catch (err: any) {
      console.log(`⚠️ Error deleting ${col}/${uid}:`, err.message);
    }
  }

  console.log('Done!');
}

deleteDriver().catch(console.error).then(() => process.exit(0));
