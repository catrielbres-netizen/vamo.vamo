import admin from 'firebase-admin';

async function compareRuns() {
  try {
    admin.initializeApp({
      projectId: 'studio-6697160840-7c67f'
    });
  } catch (e) {}

  const db = admin.firestore();
  
  const beforeId = 'run_rw_1777772689272';
  const afterId = 'run_rw_1777779278896';

  console.log(`--- COMPARISON: ${beforeId} vs ${afterId} ---`);

  const [beforeSnap, afterSnap] = await Promise.all([
    db.collection('simulation_runs').doc(beforeId).get(),
    db.collection('simulation_runs').doc(afterId).get()
  ]);

  const beforeData = beforeSnap.data() || {};
  const afterData = afterSnap.data() || {};

  // Fetch rides for both runs
  const [beforeRidesSnap, afterRidesSnap] = await Promise.all([
    db.collection('rides').where('simulationRunId', '==', beforeId).get(),
    db.collection('rides').where('simulationRunId', '==', afterId).get()
  ]);

  const beforeRides = beforeRidesSnap.docs.map(d => d.data());
  const afterRides = afterRidesSnap.docs.map(d => d.data());

  const getStats = (rides: any[]) => {
    const total = rides.length;
    const completed = rides.filter(r => r.status === 'completed').length;
    const cancelled = rides.filter(r => r.status === 'cancelled').length;
    
    const latencies = rides
      .filter(r => r._phs_assigned_at && r.createdAt)
      .map(r => {
        const start = r.createdAt._seconds + r.createdAt._nanoseconds / 1e9;
        const end = r._phs_assigned_at._seconds + r._phs_assigned_at._nanoseconds / 1e9;
        return end - start;
      });
      
    const avgMatch = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    
    // Peripheral zones
    const peripheral = rides.filter(r => ['Área 12', 'Área 16', 'Periferia Sur'].includes(r.origin?.zoneName));
    const periLatencies = peripheral
      .filter(r => r._phs_assigned_at && r.createdAt)
      .map(r => {
        const start = r.createdAt._seconds + r.createdAt._nanoseconds / 1e9;
        const end = r._phs_assigned_at._seconds + r._phs_assigned_at._nanoseconds / 1e9;
        return end - start;
      });
    const avgPeriMatch = periLatencies.length > 0 ? periLatencies.reduce((a, b) => a + b, 0) / periLatencies.length : 0;

    const timeouts = rides.filter(r => r.cancelReason?.toLowerCase().includes('timeout')).length;

    return { total, completed, cancelled, timeouts, avgMatch, avgPeriMatch, peripheral: peripheral.length };
  };

  const beforeStats = getStats(beforeRides);
  const afterStats = getStats(afterRides);

  console.log('\n1. GENERAL METRICS');
  console.table({
    Metric: ['Total Rides', 'Completion Rate', 'Cancelled/Failed', 'SUCCESS Timeouts', 'Avg Match (Overall)', 'Avg Match (Peripheral)'],
    Before: [
      beforeStats.total, 
      `${((beforeStats.completed / beforeStats.total) * 100).toFixed(1)}%`, 
      beforeStats.cancelled,
      beforeStats.timeouts,
      `${beforeStats.avgMatch.toFixed(1)}s`,
      `${beforeStats.avgPeriMatch.toFixed(1)}s`
    ],
    After: [
      afterStats.total, 
      `${((afterStats.completed / afterStats.total) * 100).toFixed(1)}%`, 
      afterStats.cancelled,
      afterStats.timeouts,
      `${afterStats.avgMatch.toFixed(1)}s`,
      `${afterStats.avgPeriMatch.toFixed(1)}s`
    ]
  });

  console.log('\n2. RIDES WITH RADIUS > 2.5 KM');
  const expansionRides = afterRides.filter(r => (r.searchRadiusKmUsed || 0) > 2.5);
  if (expansionRides.length > 0) {
    console.table(expansionRides.map(r => ({
      id: r.id?.substring(0, 8) || 'N/A',
      zone: r.origin?.zoneName || 'unknown',
      radius: r.searchRadiusKmUsed,
      attempts: r.matchingAttempts,
      matchSec: r.matchSeconds,
      driver: r.driverId
    })));
  } else {
    console.log('No rides used radius > 2.5 km in this sample.');
  }

  console.log('\n3. STUCK RIDES & FINANCIAL ISOLATION');
  const active = afterRides.filter(r => r.status === 'searching' || r.status === 'accepted');
  console.log(`Active/Stuck rides: ${active.length}`);
  
  // Check for any wallet/transaction docs created during the run
  // (Simplified check for this run's timestamp range)
  const startTime = afterData.createdAt?.toDate ? afterData.createdAt.toDate() : new Date();
  const txSnap = await db.collection('platform_transactions')
    .where('createdAt', '>=', startTime)
    .limit(1)
    .get();
  console.log(`Platform Transactions found: ${txSnap.size}`);
}

compareRuns().catch(console.error);
