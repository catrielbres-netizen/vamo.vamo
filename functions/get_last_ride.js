const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, '../service-account.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const passengerId = 'Fp2SoXCwKNPCpyc72ascUUyZvS32';
  const snapshot = await db.collection('rides')
    .where('passengerId', '==', passengerId)
    .get();

  if (snapshot.empty) {
    console.log('No rides found for passenger', passengerId);
    return;
  }

  // sort locally
  const docs = snapshot.docs.sort((a, b) => {
     const tA = a.data().createdAt?.toMillis() || 0;
     const tB = b.data().createdAt?.toMillis() || 0;
     return tB - tA; // descending
  });

  const mpDocs = docs.filter(d => d.data().mpPreferenceId);
  if (mpDocs.length === 0) {
      console.log('No MP rides found');
      return;
  }

  const ride = mpDocs[0].data();
  console.log('--- LAST MP RIDE ---');
  console.log('rideId:', mpDocs[0].id);
  console.log('passengerId:', ride.passengerId);
  console.log('driverId:', ride.driverId);
  console.log('paymentMethod:', ride.paymentMethod);
  console.log('paymentStatus:', ride.paymentStatus);
  console.log('paymentMode:', ride.paymentMode);
  console.log('mpPreferenceId:', ride.mpPreferenceId);
  console.log('mpPaymentId:', ride.mpPaymentId);
  console.log('mpPaymentStatus:', ride.mpPaymentStatus);
  console.log('paidAt:', ride.paidAt ? ride.paidAt.toDate() : null);
  console.log('paymentConfirmedAt:', ride.paymentConfirmedAt ? ride.paymentConfirmedAt.toDate() : null);
  console.log('finalTotal:', ride.pricing?.finalTotal);
  console.log('pricing.estimatedTotal:', ride.pricing?.estimatedTotal);
  console.log('completedRide.totalFare:', ride.completedRide?.totalFare);
  console.log('receipt:', JSON.stringify(ride.receipt, null, 2));

  // Check Mercado Pago settings of the driver
  if (ride.driverId) {
      console.log('--- DRIVER MP ACCOUNT ---');
      const driverMp = await db.collection('mp_accounts').doc(ride.driverId).get();
      if (driverMp.exists) {
          const mpData = driverMp.data();
          console.log('mpUserId:', mpData.mpUserId);
          console.log('status:', mpData.status);
          console.log('isSandbox?', String(mpData.accessToken || mpData.access_token).startsWith('TEST'));
      }
  }

}

run().catch(console.error).finally(() => process.exit(0));
