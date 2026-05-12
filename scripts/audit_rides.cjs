
const admin = require('firebase-admin');

admin.initializeApp({
    projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

async function auditRides() {
    console.log('--- AUDITING RECENT RIDES ---');
    const ridesSnap = await db.collection('rides').orderBy('createdAt', 'desc').limit(5).get();
    
    ridesSnap.forEach(doc => {
        const ride = doc.data();
        console.log(`\nRide ID: ${doc.id}`);
        console.log(`Status: ${ride.status}`);
        console.log(`Settled: ${!!ride.settledAt}`);
        console.log(`Passenger: ${ride.passengerName} (Points: ${ride.completedRide?.pointsAwarded || 0})`);
    });
}

auditRides().catch(console.error);
