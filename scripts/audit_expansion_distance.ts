import admin from 'firebase-admin';

async function auditExpansionDistance() {
  try {
    admin.initializeApp({
      projectId: 'studio-6697160840-7c67f'
    });
  } catch (e) {}

  const db = admin.firestore();
  
  // Search for ANY ride in the last 2 hours that used radius > 2.5
  const snap = await db.collection('rides')
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();

  const expandedRides = snap.docs
    .map(d => d.data())
    .filter(r => r.isSimulation === true && (r.searchRadiusKmUsed || 0) > 2.5)
    .slice(0, 10);

  console.log(`Found ${expandedRides.length} rides with expanded radius in the last 1000.`);
  
  for (const data of expandedRides) {
    console.log(`\nRide: ${data.id} (Zone: ${data.origin?.zoneName})`);
    console.log(`- Radius: ${data.searchRadiusKmUsed} km`);
    console.log(`- Attempts: ${data.matchingAttempts}`);
    console.log(`- Status: ${data.status}`);
    
    if (data.origin && data.driverLocation) {
       // Calculation of distance (approx)
       const lat1 = data.origin.lat;
       const lon1 = data.origin.lng;
       const lat2 = data.driverLocation.latitude;
       const lon2 = data.driverLocation.longitude;
       
       const dist = getDistance(lat1, lon1, lat2, lon2);
       console.log(`- Driver Distance: ${dist.toFixed(2)} km`);
    } else {
       console.log('- Driver distance data missing.');
    }
  }
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

auditExpansionDistance().catch(console.error);
