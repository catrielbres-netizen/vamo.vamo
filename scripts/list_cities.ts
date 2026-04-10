import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
console.log(`Using Project ID: ${projectId}`);

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function listCities() {
  console.log('--- SCANNING CITIES ---');
  try {
      const snap = await db.collection('cities').get();
      console.log(`Total documents found in 'cities': ${snap.size}`);
      snap.forEach(doc => {
        console.log(`CityKey: ${doc.id} | Name: ${doc.data().name}`);
      });
  } catch (err) {
      console.error('Error:', err);
  }
}

listCities().catch(console.error);
