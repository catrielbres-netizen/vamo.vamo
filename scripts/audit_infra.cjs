
const admin = require('firebase-admin');
const serviceAccount = require('C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runAudit() {
  console.log('--- AUDIT INFRASTRUCTURE START ---');
  
  // A. Documento del viaje (11:39:49)
  console.log('\n[A] RIDE DOCUMENT AUDIT');
  const ridesSnap = await db.collection('rides').orderBy('createdAt', 'desc').limit(5).get();
  let targetRideId = null;
  ridesSnap.forEach(doc => {
    const data = doc.data();
    const createdAt = data.createdAt ? data.createdAt.toDate().toLocaleString() : 'unknown';
    if (createdAt.includes('11:39') || createdAt.includes('11:40')) {
      targetRideId = doc.id;
      console.log(`Found Target Ride: ${doc.id}`);
      console.log(`- Status: ${data.status}`);
      console.log(`- Matching Attempts: ${data.matchingAttempts}`);
      console.log(`- Notified Drivers: ${JSON.stringify(data.notifiedDrivers)}`);
      console.log(`- Current Offered Driver: ${data.currentOfferedDriverId}`);
    }
  });

  if (!targetRideId) console.log('Target ride not found in last 5 entries.');

  // B. rideOffers
  console.log('\n[B] RIDEOFFERS AUDIT');
  if (targetRideId) {
    const offersSnap = await db.collection('rideOffers').where('rideId', '==', targetRideId).get();
    console.log(`Offers for ${targetRideId}: ${offersSnap.size}`);
  }

  // C & D. Driver César Audit
  console.log('\n[C & D] DRIVER AUDIT (CÉSAR)');
  const cesarUid = 'hBBDZRKgBVQGetjHxZvNFst6pBg1';
  const driverDoc = await db.collection('users').doc(cesarUid).get();
  if (driverDoc.exists) {
    const p = driverDoc.data();
    console.log(`Profile Found: ${p.name}`);
    console.log(`- Role: ${p.role}`);
    console.log(`- Subtype: ${p.driverSubtype}`);
    console.log(`- Services: ${JSON.stringify(p.servicesOffered)}`);
    console.log(`- Approved: ${p.approved}`);
    console.log(`- Muni Status: ${p.municipalStatus}`);
    console.log(`- Balance: ${p.currentBalance}`);
    console.log(`- CityKey: ${p.cityKey}`);
    
    const locDoc = await db.collection('drivers_locations').doc(cesarUid).get();
    if (locDoc.exists) {
      const l = locDoc.data();
      console.log(`Location Document Found:`);
      console.log(`- Status: ${l.driverStatus}`);
      console.log(`- Approved: ${l.approved}`);
      console.log(`- Muni Status: ${l.municipalStatus}`);
      console.log(`- Geohash: ${l.geohash}`);
      console.log(`- Lat/Lng: ${JSON.stringify(l.currentLocation)}`);
      console.log(`- Updated: ${l.updatedAt?.toDate().toLocaleString()}`);
    } else {
      console.log('Location document MISSING.');
    }
  } else {
    console.log('César profile MISSING.');
  }

  // E. Configurations Audit
  console.log('\n[E] CONFIGURATIONS AUDIT');
  const paths = [
    'config/matching',
    'cities/rawson',
    'municipal_pricing/rawson',
    'city_pricing/rawson',
    'pricing/rawson',
    'platform_config/global'
  ];
  for (const path of paths) {
    const doc = await db.doc(path).get();
    console.log(`- ${path}: ${doc.exists ? 'EXISTS' : 'MISSING'}`);
    if (doc.exists && path.includes('pricing')) {
        console.log(`  (Data: ${JSON.stringify(doc.data())})`);
    }
  }

  // Check collections existence by listing 1 doc
  const collections = ['driver_queue', 'rideOffers', 'drivers_locations', 'rides', 'users', 'operatingAreas'];
  for (const col of collections) {
    const snap = await db.collection(col).limit(1).get();
    console.log(`- Collection ${col}: ${snap.empty ? 'EMPTY/MISSING' : 'HAS_DATA'}`);
  }

  console.log('\n--- AUDIT INFRASTRUCTURE END ---');
}

runAudit().catch(console.error);
