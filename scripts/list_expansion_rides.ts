import admin from 'firebase-admin';

async function listExpansionRides() {
  try {
    admin.initializeApp({
      projectId: 'studio-6697160840-7c67f'
    });
  } catch (e) {}

  const db = admin.firestore();
  
  // Fetch recent rides and filter in memory
  const snap = await db.collection('rides')
    .orderBy('createdAt', 'desc')
    .limit(500) 
    .get();

  const expansionRides = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(r => r.isSimulation === true && (r.searchRadiusKmUsed || 0) > 2.5);

  console.log(`\n--- SAMPLES OF RADIUS EXPANSION (> 2.5km) ---`);
  if (expansionRides.length > 0) {
    const table = expansionRides.slice(0, 10).map(r => {
      const start = r.createdAt?._seconds || 0;
      const end = r._phs_assigned_at?._seconds || r.updatedAt?._seconds || 0;
      return {
        rideId: r.id.substring(r.id.length - 8),
        zona: r.origin?.zoneName || 'unknown',
        radius: `${r.searchRadiusKmUsed}km`,
        attempts: r.matchingAttempts,
        status: r.status,
        matchSec: end > start ? `${(end - start).toFixed(0)}s` : 'N/A',
        driver: r.driverId || 'N/A'
      };
    });
    console.table(table);
  } else {
    console.log('No expansion rides found in the last 500 records. (Density is high!)');
  }
}

listExpansionRides().catch(console.error);
