const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function auditLastRide() {
    try {
        const snapshot = await db.collection('rides')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log("No rides found.");
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        const auditData = {
            rideId: doc.id,
            status: data.status,
            passengerId: data.passengerId,
            driverId: data.driverId,
            paymentMethod: data.paymentMethod,
            selectedPaymentMethod: data.selectedPaymentMethod,
            paymentLabel: data.paymentLabel,
            paymentStatus: data.paymentStatus,
            mpPreferenceId: data.mpPreferenceId,
            mpPaymentId: data.mpPaymentId,
            paidAt: data.paidAt ? data.paidAt.toDate().toISOString() : null,
            paymentConfirmedAt: data.paymentConfirmedAt ? data.paymentConfirmedAt.toDate().toISOString() : null,
            mpIsSandbox: data.mpIsSandbox,
            mpCheckoutUrl: data.mpCheckoutUrl,
            completedRide: data.completedRide,
            paymentSnapshot: data.paymentSnapshot,
            pricing: data.pricing,
            createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
        };

        fs.writeFileSync('C:\\Users\\catri\\.gemini\\antigravity\\brain\\a741f071-fc76-4117-84e7-0427428821b6\\scratch\\last_ride_audit.json', JSON.stringify(auditData, null, 2));
        console.log("Audit complete.");
        
    } catch (error) {
        console.error("Error fetching ride:", error);
    }
}

auditLastRide();
