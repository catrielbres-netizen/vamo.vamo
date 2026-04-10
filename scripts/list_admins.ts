import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function listAdmins() {
  console.log('--- ADMIN USERS IN DB ---');
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  if (snap.empty) {
    console.log('No admin users found.');
  } else {
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`UID: ${doc.id} | Email: ${data.email} | Name: ${data.name}`);
    });
  }
}

listAdmins().catch(console.error);
