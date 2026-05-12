
import * as admin from 'firebase-admin';
import { getDb } from './lib/firebaseAdmin';

async function simulateRideCompletion(driverId: string) {
    const db = getDb();
    const userRef = db.collection('users').doc(driverId);
    
    console.log(`🚀 Simulating ride completion for driver: ${driverId}`);
    
    // 1. Get current state
    const snap = await userRef.get();
    if (!snap.exists) {
        console.error("Driver not found");
        return;
    }
    const data = snap.data();
    console.log("Current Daily Stats:", JSON.stringify(data?.dailyStats, null, 2));
    
    // 2. We can't easily trigger the Cloud Function locally without a real ride
    // but we can check if the code logic would work.
    // Instead, I'll check the logs of the production function after a real ride.
}

// simulateRideCompletion('TEST_DRIVER_ID');
