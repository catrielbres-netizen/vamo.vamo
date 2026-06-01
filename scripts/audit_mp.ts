import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Load service account
const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function audit() {
  console.log("--- START AUDIT ---");
  // Get all mp_accounts documents in case mpLinked is false but the account exists
  
  // First check users that have mpLinked=true or mpAccountStatus existing
  const usersSnapshot = await db.collection('users')
    .orderBy('mpLinkedAt', 'desc')
    .limit(5)
    .get();
  
  // Let's just find the most recently updated mp_accounts
  const mpAccountsSnapshot = await db.collection('mp_accounts')
    .orderBy('linkedAt', 'desc')
    .limit(5)
    .get();

  console.log("=== Recent mp_accounts ===");
  if (mpAccountsSnapshot.empty) {
    console.log("No mp_accounts found.");
  } else {
    for (const doc of mpAccountsSnapshot.docs) {
      const mpData = doc.data();
      const driverId = doc.id;
      
      console.log(`\nMP Account Document: mp_accounts/${driverId}`);
      console.log(`- mpUserId: ${mpData.mpUserId}`);
      console.log(`- status: ${mpData.status}`);
      console.log(`- linkedAt: ${mpData.linkedAt ? mpData.linkedAt.toDate() : 'undefined'}`);
      console.log(`- country: ${mpData.country}`);
      console.log(`- expiresAt: ${mpData.expiresAt ? mpData.expiresAt.toDate() : 'undefined'}`);
      console.log(`- scope: ${mpData.scope}`);
      
      if (String(mpData.mpUserId) !== '310292531') {
        console.log(`\n⚠️ ALERT: mpUserId NO COINCIDE! Esperado: 310292531, Obtenido: ${mpData.mpUserId}`);
      } else {
        console.log(`\n✅ OK: mpUserId coincide con 310292531`);
      }

      // get user
      const userDoc = await db.collection('users').doc(driverId).get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        console.log(`\nUser Document: users/${driverId}`);
        console.log(`- mpLinked: ${userData.mpLinked}`);
        console.log(`- mpAccountStatus: ${userData.mpAccountStatus}`);
        console.log(`- mpLinkedAt: ${userData.mpLinkedAt ? userData.mpLinkedAt.toDate() : 'undefined'}`);
      } else {
        console.log(`\nNo users document found for driver ${driverId}`);
      }
    }
  }

  console.log("\n--- END AUDIT ---");
}

audit().catch(console.error);
