
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function syncUserStats(userId: string) {
    console.log(`\n--- SYNCING STATS FOR USER: ${userId} ---`);
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        console.error('User not found.');
        return;
    }
    const user = userSnap.data() as any;

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    console.log(`Current Date (en-CA): ${todayStr}`);

    // 1. Get all completed rides for this user (either as driver or passenger)
    const ridesQuery = user.role === 'driver' 
        ? db.collection('rides').where('driverId', '==', userId).where('status', '==', 'completed')
        : db.collection('rides').where('passengerId', '==', userId).where('status', '==', 'completed');

    const ridesSnap = await ridesQuery.get();
    console.log(`Total completed rides found: ${ridesSnap.size}`);

    let todayCount = 0;
    let totalPoints = 0;
    let totalVamoPoints = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    // Adjust for ARG time if needed, but simple comparison for now
    
    ridesSnap.forEach(doc => {
        const ride = doc.data();
        const createdAt = ride.createdAt?.toDate();
        const rideDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(createdAt);
        
        if (rideDateStr === todayStr) {
            todayCount++;
        }
        
        totalPoints += (ride.completedRide?.pointsAwarded || 1);
        totalVamoPoints += Math.ceil((ride.pricing?.totalFare || ride.pricing?.estimated?.total || 0) * 0.01);
    });

    console.log(`Rides today: ${todayCount}`);
    console.log(`Calculated Weekly/Total Points: ${totalPoints}`);
    console.log(`Calculated Vamo Points: ${totalVamoPoints}`);

    const updates: any = {
        updatedAt: FieldValue.serverTimestamp()
    };

    if (user.role === 'driver') {
        updates['stats.ridesCompleted'] = ridesSnap.size;
        updates.weeklyPoints = totalPoints;
        updates.dailyStats = {
            ...(user.dailyStats || {}),
            lastResetDate: todayStr,
            ridesCount: todayCount,
            // Keep existing earnings and km if possible, or recalculate if ride data is available
        };
    } else {
        updates['passengerStats.completedRides'] = ridesSnap.size;
        updates.vamoPoints = totalVamoPoints;
    }

    await userRef.update(updates);
    console.log('User stats synchronized successfully.');
}

async function runSync() {
    // Sync the driver from the screenshot
    await syncUserStats('hBBDZRKgBVQGetjHxZvNFst6pBg1');
    // Sync the passenger from the screenshot
    await syncUserStats('7hqhTZTheJYtF2C3n9GM7hvGajR2');
}

runSync().catch(console.error);
