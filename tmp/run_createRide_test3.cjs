// tmp/run_createRide_test3.cjs
// Change working directory to functions so that module resolution works
process.chdir('functions');

const admin = require('firebase-admin');
const { logger } = require('firebase-functions/logger'); // ensure logger works

// Initialize Admin SDK (will connect to emulator if env vars are set)
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f' });
}
const db = admin.firestore();

// Import the compiled function
const ridesModule = require('./lib/rides');
const createRideV1 = ridesModule.createRideV1; // callable wrapper

async function main() {
  const testUid = 'test_user_123';
  // Ensure user exists
  const userRef = db.doc(`users/${testUid}`);
  await userRef.set({
    uid: testUid,
    email: 'test@example.com',
    role: 'passenger',
    termsAccepted: true,
    termsVersion: 'v1.3',
    activeRideId: null,
    city: 'Buenos Aires',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

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

  const rideId = result.rideId || result.success && result.rideId; // result may be {success:true, rideId}
  const pricingKey = result.resolvedCity || result.resolvedCity || 'unknown';

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
