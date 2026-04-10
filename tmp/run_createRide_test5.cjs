// tmp/run_createRide_test5.cjs
// Script to invoke createRideV1 in the Functions emulator and output required evidence.

const admin = require('firebase-admin');
// Initialize Admin SDK (will connect to emulator if env vars are set)
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f' });
}
const db = admin.firestore();

// Import the compiled callable function
const { createRideV1 } = require('./functions/lib/rides');

async function ensureUser(uid) {
  const userRef = db.doc(`users/${uid}`);
  await userRef.set({
    uid,
    email: 'test@example.com',
    role: 'passenger',
    termsAccepted: true,
    termsVersion: 'v1.3',
    activeRideId: null,
    city: 'Buenos Aires',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return userRef;
}

async function main() {
  const testUid = 'test_user_123';
  const userRef = await ensureUser(testUid);

  const mockRequest = {
    auth: { uid: testUid, token: {} },
    data: {
      origin: { lat: -34.6037, lng: -58.3816, cityKey: 'buenos_aires', city: 'Buenos Aires' },
      destination: { lat: -34.6090, lng: -58.3840, cityKey: 'buenos_aires', city: 'Buenos Aires' },
      serviceType: 'normal',
      clientRequestId: 'test123',
      dryRun: false
    },
    rawRequest: { headers: {}, ip: '127.0.0.1' }
  };

  console.log('--- Invoking createRideV1 ---');
  const result = await createRideV1(mockRequest);
  console.log('Result:', result);

  const rideId = result.rideId || (result.success && result.rideId);
  const pricingKey = result.resolvedCity || result.resolvedCity || (result.success && result.resolvedCity) || 'unknown';

  const rideSnap = await db.doc(`rides/${rideId}`).get();
  const userSnap = await userRef.get();
  const pricingSnap = await db.doc(`municipal_pricing/${pricingKey}`).get();

  console.log('--- Verification ---');
  console.log('Pricing key used:', pricingKey);
  console.log('Ride ID:', rideId);
  console.log('Ride exists:', rideSnap.exists);
  console.log('User activeRideId:', userSnap.data()?.activeRideId);
  console.log('Pricing exists:', pricingSnap.exists);
  console.log('Pricing data:', pricingSnap.data());
}

main().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});
