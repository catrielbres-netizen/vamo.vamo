const geofire = require('geofire-common');
const hash = geofire.geohashForLocation([-43.3000316, -65.102042]);
console.log(`Computed hash for -43.30, -65.10: ${hash}`);

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkRide() {
  const ride = await db.collection('rides').doc('Pe1ctzoHo6SXxxUSItBO').get();
  console.log(`\n=== RIDE DATA ===`);
  const data = ride.data();
  console.log(`Origin: ${data.origin.lat}, ${data.origin.lng}`);
  
  const rideHash = geofire.geohashForLocation([data.origin.lat, data.origin.lng]);
  console.log(`Ride Hash: ${rideHash}`);
  
  const dist = geofire.distanceBetween([-43.3000316, -65.102042], [data.origin.lat, data.origin.lng]);
  console.log(`Distance driver to ride: ${dist} km`);

  // Try query
  const bounds = geofire.geohashQueryBounds([data.origin.lat, data.origin.lng], 8000);
  console.log("Bounds:", bounds);
  let found = false;
  for (const b of bounds) {
      if (hash >= b[0] && hash <= b[1]) {
          found = true;
          console.log(`Hash ${hash} is within bounds [${b[0]}, ${b[1]}]`);
      }
  }
  console.log(`Driver found in bounds? ${found}`);
  
  process.exit(0);
}

checkRide();
