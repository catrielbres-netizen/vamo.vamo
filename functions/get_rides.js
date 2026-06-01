const admin = require('firebase-admin');

// We don't have service account here easily, so we use the default fallback
try {
    admin.initializeApp();
} catch(e) {}

const db = admin.firestore();

async function run() {
    const uid = 'Fp2SoXCwKNPCpyc72ascUUyZvS32';
    
    // Get last rides where passengerId = uid
    const ridesRef = db.collection('rides');
    const q = ridesRef.where('passengerId', '==', uid).orderBy('createdAt', 'desc').limit(5);
    
    const snapshot = await q.get();
    
    if (snapshot.empty) {
        console.log('No rides found for user', uid);
        return;
    }
    
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log('--- RIDE ID:', doc.id);
        console.log('status:', data.status);
        console.log('paymentMethod:', data.paymentMethod);
        console.log('paymentStatus:', data.paymentStatus);
        console.log('driverId:', data.driverId);
        console.log('pricing:', data.pricing);
        console.log('completedRide:', data.completedRide);
        console.log('finalTotal:', data.finalTotal);
        console.log('mpPaymentId:', data.mpPaymentId);
        console.log('preferenceId:', data.preferenceId);
        console.log('createdAt:', data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt);
    });
}

run().catch(console.error);
