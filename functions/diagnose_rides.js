const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

function normalizeCity(city) {
    if (!city) return "";
    let n = city.trim().toLowerCase();
    if (n.includes(',')) n = n.split(',')[0].trim();
    n = n.replace(/^[a-z][0-9]{4}\s+/, '').trim();
    return n;
}

async function run() {
  console.log(`--- RECENT RIDES AUDIT ---`);
  const ridesSnap = await db.collection('rides').orderBy('createdAt', 'desc').limit(5).get();
  
  if (ridesSnap.empty) {
      console.log('No rides found');
  } else {
      for (const rideDoc of ridesSnap.docs) {
          const rideData = rideDoc.data();
          const rawCity = rideData.city;
          const normalized = normalizeCity(rawCity);
          
          console.log(`\nID: ${rideDoc.id}`);
          console.log(`- CreatedAt: ${rideData.createdAt?.toDate()}`);
          console.log(`- Status: ${rideData.status}`);
          console.log(`- Raw City: "${rawCity}"`);
          console.log(`- Normalized: "${normalized}"`);
          console.log(`- Origin Address: "${rideData.origin?.address}"`);
          console.log(`- Origin City: "${rideData.origin?.city}"`);
          console.log(`- Notified Count: ${rideData.notifiedDrivers?.length || 0}`);
          if (rideData.cancelReason) console.log(`- Cancel Reason: ${rideData.cancelReason}`);
      }
  }
}

run().catch(console.error);
