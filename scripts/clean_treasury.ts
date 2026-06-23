import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function cleanTreasury() {
  console.log("=== CLEANING TREASURY DATA ===");
  const accountsSnap = await db.collection('municipal_accounts').where('cityKey', '==', 'rawson').get();
  
  if (accountsSnap.empty) {
      console.log("No municipal_accounts found for rawson.");
      return;
  }
  
  const batch = db.batch();
  accountsSnap.forEach(doc => {
      batch.set(doc.ref, {
          currentBalance: 0,
          totalAccumulated: 0
      }, { merge: true });
  });
  
  await batch.commit();
  console.log("✅ Successfully reset municipal_accounts for rawson.");
}

cleanTreasury().catch(console.error);
