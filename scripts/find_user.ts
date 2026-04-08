import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();
const email = 'gp1877774@gmail.com';

async function find() {
  console.log(`Checking for email: ${email}`);
  const snap = await db.collection('users').where('email', '==', email).get();
  if (snap.empty) {
    console.log('User not found.');
    const allUsers = await db.collection('users').limit(5).get();
    console.log('Sample users in DB:');
    allUsers.forEach(d => console.log(`- ${d.data().email}`));
  } else {
    console.log(`User found! UID: ${snap.docs[0].id}`);
    console.log(JSON.stringify(snap.docs[0].data(), null, 2));
  }
}

find().catch(console.error);
