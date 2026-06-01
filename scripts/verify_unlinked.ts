import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function verify() {
  const driverId = '1BIk2VyuwEZLmHRVbXE52rhFYen2';
  
  const userDoc = await db.collection('users').doc(driverId).get();
  const mpDoc = await db.collection('mp_accounts').doc(driverId).get();
  
  console.log(`=== VERIFICACIÓN PARA ${driverId} ===`);
  
  if (userDoc.exists) {
    const userData = userDoc.data()!;
    console.log(`\nDocumento: users/${driverId}`);
    console.log(`- mpLinked: ${userData.mpLinked}`);
    console.log(`- mpAccountStatus: ${userData.mpAccountStatus}`);
  } else {
    console.log(`Documento users/${driverId} NO ENCONTRADO.`);
  }

  if (mpDoc.exists) {
    const mpData = mpDoc.data()!;
    console.log(`\nDocumento: mp_accounts/${driverId}`);
    console.log(`- status: ${mpData.status}`);
  } else {
    console.log(`Documento mp_accounts/${driverId} NO ENCONTRADO.`);
  }
}

verify().catch(console.error);
