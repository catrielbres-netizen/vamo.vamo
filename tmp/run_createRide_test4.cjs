// tmp/run_createRide_test4.cjs
// Monkey-patch require to provide a simple logger if missing
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
  if (request === 'firebase-functions/logger') {
    return {
      log: console.log,
      info: console.info,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };
  }
  return originalRequire.apply(this, arguments);
};

// Initialize Firebase Admin (will connect to emulator if env vars are set)
const admin = require('firebase-admin');
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f' });
}
const db = admin.firestore();

// Require the compiled function (ensure cwd is project root)
const ridesModule = require('./functions/lib/rides');
const createRideV1 = ridesModule.createRideV1;

async function main() {
  const testUid = 'test_user_123';
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

  const rideId = result.rideId || (result.success && result.rideId);
  const pricingKey = result.resolvedCity || (result.resolvedCity) || 'unknown';

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
