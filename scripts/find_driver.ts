import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId
  });
}

const db = getFirestore();
const auth = getAuth();

async function run() {
  const email = 'cesareduardobres@gmail.com';
  console.log('Searching for:', email);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log('Auth UID found:', userRecord.uid);
  } catch (err: any) {
    console.log('User not found in Auth:', err.message);
  }

  if (!userRecord) {
     const snap = await db.collection('users').where('email', '==', email).get();
     if (!snap.empty) {
        console.log(`User found in Firestore with email! UID: ${snap.docs[0].id}`);
        userRecord = { uid: snap.docs[0].id };
     } else {
        console.log('User not found anywhere');
        return;
     }
  }

  const uid = userRecord.uid;

  console.log('\nChecking Firestore collections for UID:', uid);
  
  const collectionsToCheck = [
    'users',
    'wallets',
    'drivers_locations',
    'municipal_profiles',
    'driver_documents',
    'driver_vehicles'
  ];

  for (const col of collectionsToCheck) {
    const docRef = db.collection(col).doc(uid);
    const snap = await docRef.get();
    if (snap.exists) {
      console.log(`FOUND in ${col}/${uid}`);
    } else {
      console.log(`Not found in ${col}/${uid}`);
    }
  }

  // Check ledgers
  const ledgerQuery = await db.collection('ledger_events').where('driverId', '==', uid).get();
  if (!ledgerQuery.empty) {
    console.log(`FOUND ${ledgerQuery.size} documents in ledger_events`);
  }

  // Check fleets
  const fleetSnap = await db.collection('fleets').where('ownerId', '==', uid).get();
  if (!fleetSnap.empty) {
    console.log(`FOUND ${fleetSnap.size} documents in fleets`);
  }
}

run().catch(console.error).then(() => process.exit(0));
