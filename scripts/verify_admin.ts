import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();
const targetEmail = 'gp1877774@gmail.com';

async function verify() {
  console.log(`Searching for: ${targetEmail}`);
  const snap = await db.collection('users').where('email', '==', targetEmail).get();
  
  if (snap.empty) {
    console.log('User not found in Firestore.');
    // Check if we can find ANY user to verify connectivity
    const someUser = await db.collection('users').limit(1).get();
    if (!someUser.empty) {
        console.log('Connectivity OK, sample user ID:', someUser.docs[0].id);
    } else {
        console.log('Firestore users collection seems empty or inaccessible.');
    }
  } else {
    const data = snap.docs[0].data();
    console.log(`FOUND User: ${snap.docs[0].id}`);
    console.log(`Role: ${data.role}`);
    console.log(`Email: ${data.email}`);
  }

  console.log('\nTesting Auth connectivity...');
  try {
    const list = await auth.listUsers(1);
    console.log('✅ Auth connectivity OK. Found users:', list.users.length);
  } catch (err: any) {
    console.error('❌ Auth connectivity FAILED:', err.message);
  }
}

import { getAuth } from 'firebase-admin/auth';
const auth = getAuth();

verify().catch(console.error);
