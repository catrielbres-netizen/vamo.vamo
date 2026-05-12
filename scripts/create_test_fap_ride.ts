
import * as admin from 'firebase-admin';
import { resolve } from 'path';

// Initialize Firebase Admin
// Make sure you have GOOGLE_APPLICATION_CREDENTIALS set or are running in an environment with access
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function createTestRide(email: string) {
    console.log(`Searching for user with email: ${email}...`);
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    
    if (userSnap.empty) {
        console.error("User not found.");
        return;
    }

    const user = userSnap.docs[0];
    const userId = user.id;
    const userData = user.data();

    console.log(`Creating mock Express ride for ${userData.name} (${userId})...`);

    const rideId = `test_fap_${Date.now()}`;
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 3600000);

    const testRide = {
        id: rideId,
        passengerId: userId,
        passengerName: userData.name || 'Test User',
        driverId: 'driver_express_mock',
        driverName: 'Conductor de Prueba Express',
        status: 'completed',
        serviceType: 'express',
        cityKey: userData.cityKey || 'trelew',
        operatingAreaId: userData.cityKey || 'trelew',
        origin: { address: 'Calle Falsa 123', lat: -43.2489, lng: -65.3050 },
        destination: { address: 'Plaza Independencia', lat: -43.2533, lng: -65.3094 },
        createdAt: oneHourAgo,
        completedAt: now,
        completedRide: {
            totalFare: 1500,
            distanceMeters: 2500,
            durationSeconds: 600,
            fapEligible: true,
            driverSubtype: 'express'
        },
        pricing: {
            estimated: {
                total: 1500
            }
        }
    };

    await db.collection('rides').doc(rideId).set(testRide);
    console.log(`✅ Success! Test ride created with ID: ${rideId}`);
    console.log(`Now go to: /dashboard/history/${rideId} to test the F.A.P. button.`);
}

const email = process.argv[2] || 'test@example.com';
createTestRide(email).catch(console.error);
