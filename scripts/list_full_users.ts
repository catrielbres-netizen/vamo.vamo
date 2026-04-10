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

async function listUsers() {
  console.log('--- STARTING EXHAUSTIVE SCAN ---');
  try {
      const snap = await db.collection('users').get();
      console.log(`Total documents found in 'users': ${snap.size}`);
      if (snap.empty) {
        console.log('No users found in Firestore. Collection is empty.');
      } else {
        snap.forEach(doc => {
          const data = doc.data();
          console.log(`UID: ${doc.id} | Email: ${data.email} | Role: ${data.role}`);
        });
      }
  } catch (err) {
      console.error('Error accessing Firestore:', err);
  }
}

listUsers().catch(console.error);
