import admin from 'firebase-admin';

async function checkSpecificRide() {
  try {
    admin.initializeApp({
      projectId: 'studio-6697160840-7c67f'
    });
  } catch (e) {}

  const db = admin.firestore();
  const runId = 'run_rw_1777779278896';
  console.log(`Auditing runId: ${runId}`);

  const snap = await db.collection('rides')
    .where('simulationRunId', '==', runId)
    .get();
      
  console.log(`Found ${snap.size} rides in this run.`);
  
  const results = snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id.substring(doc.id.length - 8),
      zone: data.origin?.zoneName || 'unknown',
      attempts: data.matchingAttempts,
      radius: data.searchRadiusKmUsed,
      status: data.status,
      matchSec: data.matchSeconds
    };
  });
  
  console.table(results);
}

checkSpecificRide().catch(console.error);
