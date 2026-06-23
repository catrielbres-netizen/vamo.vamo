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

async function checkMunicipalData() {
  console.log("=== CHECK MUNICIPAL DATA ===");
  
  const munProfiles = await db.collection('municipal_profiles').where('cityKey', '==', 'rawson').get();
  console.log(`Found ${munProfiles.size} documents in 'municipal_profiles' for Rawson.`);
  
  if (munProfiles.size > 0) {
      console.log(`Examples of IDs:`, munProfiles.docs.slice(0, 3).map(d => d.id));
  }

  const rawsonCity = await db.doc('cities/rawson').get();
  if (rawsonCity.exists) {
      console.log("Rawson City 'stats' field:");
      console.dir(rawsonCity.data()?.stats, { depth: null });
  } else {
      console.log("cities/rawson not found!");
  }
}

checkMunicipalData().catch(console.error);
