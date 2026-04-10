import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function listUsers() {
  console.log('--- USERS IN DB (Sample 20) ---');
  const snap = await db.collection('users').limit(20).get();
  if (snap.empty) {
    console.log('No users found.');
  } else {
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`UID: ${doc.id} | Email: ${data.email} | Role: ${data.role} | Name: ${data.name}`);
    });
  }
}

listUsers().catch(console.error);
