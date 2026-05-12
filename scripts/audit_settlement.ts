
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const serviceAccountPath = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

if (!getApps().length) {
    initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
}

const db = getFirestore();

async function auditLastRide() {
    console.log('--- AUDIT: LAST COMPLETED RIDE ---');
    
    // Look for last rides regardless of status to see if any are stuck in "completed" without settledAt
    const snap = await db.collection('rides')
        .orderBy('updatedAt', 'desc')
        .limit(10)
        .get();

    if (snap.empty) {
        console.log('No rides found.');
        return;
    }

    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.status === 'completed' || data.status === 'in_progress') {
            console.log('Ride ID:', doc.id);
            console.log('Status:', data.status);
            console.log('Settled At exists:', !!data.settledAt);
            console.log('CompletedRide exists:', !!data.completedRide);
            console.log('SettlementError exists:', !!data.settlementError);
            if (data.settlementError) {
                console.log('Error Message:', data.settlementError);
            }
            console.log('Pricing:', JSON.stringify(data.pricing, null, 2));
            console.log('Driver ID:', data.driverId);
            console.log('Passenger ID:', data.passengerId);
            console.log('UpdatedAt:', data.updatedAt?.toDate().toLocaleString());
            console.log('----------------------------------');
            
            // Only need the very first one that is completed but not settled
            if (data.status === 'completed' && !data.settledAt) {
                // Keep going to see if there are more
            }
        }
    }
}

auditLastRide().catch(console.error);
