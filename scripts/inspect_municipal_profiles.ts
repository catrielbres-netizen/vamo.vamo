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

async function run() {
  console.log('Buscando en municipal_profiles para rio_gallegos...');
  const snap = await db.collection('municipal_profiles')
    .where('cityKey', '==', 'rio_gallegos')
    .get();

  snap.forEach(doc => {
    console.log(`Doc ID: ${doc.id}`);
    console.log(doc.data());
    console.log('---');
  });

  console.log('Buscando a Cesar Eduardo Bres en municipal_profiles...');
  const allMuni = await db.collection('municipal_profiles').get();
  for (const doc of allMuni.docs) {
    const data = doc.data();
    if (data.driverName && data.driverName.toLowerCase().includes('cesar')) {
       console.log('Found Cesar:', doc.id, data);
    }
  }

  console.log('Buscando al Test Driver...');
  for (const doc of allMuni.docs) {
    const data = doc.data();
    if (data.driverName && data.driverName.toLowerCase().includes('test')) {
       console.log('Found Test Driver:', doc.id, data);
    }
  }
}

run().catch(console.error);
