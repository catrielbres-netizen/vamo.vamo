import admin from 'firebase-admin';

async function auditRadiusExpansion() {
  try {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f'
    });
  } catch (e) {}

  const db = admin.firestore();
  console.log('--- RADIUS EXPANSION AUDIT ---');

  // Fetch recent rides and filter in memory to avoid index requirements
  const ridesSnap = await db.collection('rides')
    .limit(10) 
    .get();

  console.log(`Fetched ${ridesSnap.size} recent rides for auditing.`);

  const expansionRides = ridesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any));

  if (expansionRides.length === 0) {
    console.log('❌ No rides found with matchingAttempts > 1.');
    return;
  }

  console.log(`✅ Found ${expansionRides.length} rides that used radius expansion:`);
  
  const table = expansionRides.map(r => ({
    id: r.id,
    attempts: r.matchingAttempts,
    radius: r.searchRadiusKmUsed || 'missing',
    status: r.status,
    zone: r.origin?.zoneName || 'unknown',
    matchSec: r.matchSeconds || 'N/A',
    createdUTC: r.createdAt?.toDate ? r.createdAt.toDate().toISOString().substring(11, 19) : 'N/A'
  }));

  console.table(table);
}

auditRadiusExpansion().catch(console.error);
