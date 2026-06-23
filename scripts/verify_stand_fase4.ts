import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

// Override with correct credentials
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('service-account.json');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function verifyStand() {
  const standId = 'stand_170e4b0f';
  console.log(`Buscando parada: ${standId}`);
  
  const doc = await db.collection('taxi_stands').doc(standId).get();
  
  if (!doc.exists) {
    console.log('❌ La parada no existe.');
    return;
  }
  
  const data = doc.data();
  console.log('✅ Documento encontrado:');
  console.log(JSON.stringify(data, null, 2));
}

verifyStand().catch(console.error);
