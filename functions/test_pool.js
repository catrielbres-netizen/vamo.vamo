const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

function getWeekId() {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(d);
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const argDate = new Date(y, m, day);
    const firstDayOfYear = new Date(y, 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}

async function runTest() {
    console.log("=== STARTING POOL TEST ===");
    const weekId = getWeekId();
    const cityKey = 'rawson';
    
    // Find a driver
    const driverSnap = await db.collection('users').where('role', '==', 'driver').limit(1).get();
    if (driverSnap.empty) {
        console.log("No driver found.");
        return;
    }
    const driverId = driverSnap.docs[0].id;
    
    // Check points before
    const pointsRef = db.collection('driver_points').doc(driverId);
    let pointsBefore = (await pointsRef.get()).data() || {};
    
    // Check pool before
    const poolRef = db.collection('cities').doc(cityKey).collection('weekly_pools').doc(weekId);
    let poolBefore = (await poolRef.get()).data() || {};
    
    console.log(`BEFORE - Pool currentAmount: ${poolBefore.currentAmount || 20000}`);
    console.log(`BEFORE - Driver trips: ${pointsBefore.weeklyTripsCount || 0}`);
    
    // Create a ride
    const rideRef = db.collection('rides').doc();
    console.log(`Creating test ride: ${rideRef.id}`);
    
    await rideRef.set({
        driverId: driverId,
        passengerId: 'TEST_PASSENGER',
        cityKey: cityKey,
        status: 'in_progress',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentMethod: 'cash',
        driverSubtypeSnapshot: 'professional'
    });
    
    // Trigger settlement
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await rideRef.update({
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedRide: true,
        totalFare: 1000,
        pricingSnapshot: { baseFare: 1000 },
        paymentSnapshot: { passengerTotal: 1000, driverTotal: 800 },
        v2MigrationPhase: true
    });
    
    console.log("Ride marked as completed. Waiting for cloud function...");
    
    // Wait for trigger
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Check after
    let pointsAfter = (await pointsRef.get()).data() || {};
    let poolAfter = (await poolRef.get()).data() || {};
    
    console.log(`AFTER - Pool currentAmount: ${poolAfter.currentAmount || 20000}`);
    console.log(`AFTER - Driver trips: ${pointsAfter.weeklyTripsCount || 0}`);
    
    // Clean up
    console.log("Cleaning up test ride...");
    await rideRef.delete();
    
    const fs = require('fs');
    fs.writeFileSync('../scratch/pool_test_result.json', JSON.stringify({
        rideId: rideRef.id,
        driverId,
        weekId,
        poolBefore,
        poolAfter,
        pointsBefore,
        pointsAfter
    }, null, 2));
    
    console.log("Done.");
}

runTest().catch(console.error);
