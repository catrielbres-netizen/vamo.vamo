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

async function fix() {
  console.log('--- ACTUALIZANDO MUNICIPAL PROFILE DE CESAR ---');
  
  const cesarId = 'rTfLc4wzaZhqdp0uw9TiezR0xNK2';
  const muniProfileRef = db.collection('municipal_profiles').doc(cesarId);
  const userRef = db.collection('users').doc(cesarId);

  // Update municipal_profiles
  await muniProfileRef.update({
    cityKey: 'rio_gallegos',
    municipalCode: 'RI-00045'
  });
  console.log(`Updated municipal_profiles/${cesarId} -> cityKey: 'rio_gallegos', municipalCode: 'RI-00045'`);

  // Just to be absolutely sure, update the users doc as well (the user said it's correct but we make sure the municipalCode matches)
  await userRef.update({
    cityKey: 'rio_gallegos',
    operatingAreaId: 'rio_gallegos',
    municipalCode: 'RI-00045'
  });
  console.log(`Updated users/${cesarId} -> cityKey: 'rio_gallegos', municipalCode: 'RI-00045'`);

  console.log('--- ELIMINANDO TEST DRIVER ---');
  const testDriverId = 'test_city_driver_1';
  await db.collection('municipal_profiles').doc(testDriverId).delete();
  console.log(`Deleted municipal_profiles/${testDriverId}`);
  await db.collection('users').doc(testDriverId).delete();
  console.log(`Deleted users/${testDriverId}`);
  
  console.log('Done!');
}

fix().catch(console.error);
