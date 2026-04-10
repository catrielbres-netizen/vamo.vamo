console.log('🚀 Script starting...');
// scripts/demo/create_demo_users.ts
/**
 * Demo user creation script for VamO.
 * Creates (if not existing) a passenger and a driver user in Firebase Auth
 * and ensures corresponding Firestore documents exist.
 *
 * Usage: npx tsx scripts/demo/create_demo_users.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import admin from 'firebase-admin';
// Using Firebase Admin SDK for Firestore

// ------------------------------------------------------------------
// 1️⃣ Initialise Firebase Admin SDK (uses GOOGLE_APPLICATION_CREDENTIALS)
// ------------------------------------------------------------------
if (!admin.apps.length) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    console.log(`🔑 Using service account from: ${serviceAccountPath}`);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
  } else {
    console.log('⚠️ GOOGLE_APPLICATION_CREDENTIALS not set, using applicationDefault()');
    admin.initializeApp();
  }
}
const auth = admin.auth();
const firestore = admin.firestore();

interface DemoUser {
  email: string;
  password: string;
  role: 'passenger' | 'driver';
}

const demoUsers: DemoUser[] = [
  {
    email: 'demo_passenger@vamo.com',
    password: 'vamo2024pass',
    role: 'passenger',
  },
  {
    email: 'demo_driver@vamo.com',
    password: 'vamo2024pass',
    role: 'driver',
  },
];

async function ensureUser(user: DemoUser) {
  let uid: string;
  try {
    const created = await auth.createUser({
      email: user.email,
      password: user.password,
      emailVerified: true,
    });
    uid = created.uid;
    console.log(`✅ Created Auth user ${user.email} (uid=${uid})`);
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(user.email);
      uid = existing.uid;
      console.log(`⚠️ User already exists ${user.email} (uid=${uid})`);
    } else {
      console.error(`❌ Error creating ${user.email}:`, e);
      throw e;
    }
  }

  // Firestore document (merge = true)
  const userDoc = firestore.doc(`users/${uid}`);
  const baseData: any = {
    uid,
    email: user.email,
    role: user.role,
    activeRideId: null,
    termsAccepted: true,
    acceptedDriverTerms: true,
    termsVersion: "v1.3",
    acceptedTermsAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (user.role === 'driver') {
    Object.assign(baseData, {
      approved: true,
      driverStatus: 'online',
      isSuspended: false,
    });
  }

  await userDoc.set(baseData, { merge: true });
  console.log(`✅ Firestore user document ensured for ${user.email}`);
}

async function main() {
  for (const u of demoUsers) {
    await ensureUser(u);
  }
  console.log('\n✅ Demo users ready. You can now run `npm run demo:auth`.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
