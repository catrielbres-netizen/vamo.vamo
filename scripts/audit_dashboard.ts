
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function auditDashboardMetrics(cityKey: string) {
    console.log(`--- DASHBOARD AUDIT (City: ${cityKey}) ---`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Timestamp.fromDate(today);

    // 1. Pending Drivers
    const pendingSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .where('cityKey', '==', cityKey)
        .where('approved', '==', false)
        .get();
    console.log(`Pending Drivers (Raw): ${pendingSnap.size}`);

    // 2. Online Drivers
    const onlineSnap = await db.collection('users')
        .where('role', '==', 'driver')
        .where('cityKey', '==', cityKey)
        .where('driverStatus', '==', 'online')
        .get();
    console.log(`Online Drivers: ${onlineSnap.size}`);

    // 3. Active Rides
    const activeRidesSnap = await db.collection('rides')
        .where('cityKey', '==', cityKey)
        .where('status', 'in', ['searching', 'accepted', 'arrived', 'picked_up'])
        .get();
    console.log(`Active Rides: ${activeRidesSnap.size}`);

    // 4. Completed Today
    const completedTodaySnap = await db.collection('rides')
        .where('cityKey', '==', cityKey)
        .where('status', '==', 'completed')
        .where('completedAt', '>=', todayTs)
        .get();
    console.log(`Completed Today: ${completedTodaySnap.size}`);
    
    if (completedTodaySnap.size > 0) {
        console.log(`Example Completed Ride ID: ${completedTodaySnap.docs[0].id}`);
    }

    // 5. Check if any ride exists with DIFFERENT cityKey casing
    const rawsonCapSnap = await db.collection('rides')
        .where('cityKey', '==', 'Rawson')
        .get();
    console.log(`Rides with 'Rawson' (Capitalized): ${rawsonCapSnap.size}`);

    console.log('------------------------------------------');
}

auditDashboardMetrics('rawson').catch(console.error);
