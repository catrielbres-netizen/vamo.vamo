import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:\\Users\\catri\\Downloads\\studio-6697160840-7c67f-firebase-adminsdk-fbsvc-8ff1ccc6f0.json';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f'
    });
}

const db = admin.firestore();

async function audit() {
    console.log("=== AUDIT START ===");
    
    // 1. Audit subtypes in users
    console.log("\n[1] Users collection - Driver Subtypes:");
    const usersSnap = await db.collection('users').where('role', '==', 'driver').limit(50).get();
    const subtypeSet = new Set<string>();
    const vehicleTypeSet = new Set<string>();
    const serviceTypeSet = new Set<string>();
    usersSnap.forEach(doc => {
        const d = doc.data();
        if (d.driverSubtype) subtypeSet.add(d.driverSubtype);
        if (d.vehicleType) vehicleTypeSet.add(d.vehicleType);
        if (d.serviceType) serviceTypeSet.add(d.serviceType);
    });
    console.log("driverSubtype:", Array.from(subtypeSet));
    console.log("vehicleType:", Array.from(vehicleTypeSet));
    console.log("serviceType:", Array.from(serviceTypeSet));

    // 2. Audit subtypes in drivers_locations
    console.log("\n[2] drivers_locations collection - Driver Subtypes:");
    const locsSnap = await db.collection('drivers_locations').limit(50).get();
    const locSubtypeSet = new Set<string>();
    locsSnap.forEach(doc => {
        const d = doc.data();
        if (d.driverSubtype) locSubtypeSet.add(d.driverSubtype);
        if (d.vehicle?.type) locSubtypeSet.add(d.vehicle.type);
    });
    console.log("driverSubtype / vehicle.type in locs:", Array.from(locSubtypeSet));

    // 3. Audit public_driver_profiles
    console.log("\n[3] public_driver_profiles collection - Driver Subtypes:");
    const profsSnap = await db.collection('public_driver_profiles').limit(50).get();
    const profSubtypeSet = new Set<string>();
    profsSnap.forEach(doc => {
        const d = doc.data();
        if (d.driverSubtype) profSubtypeSet.add(d.driverSubtype);
        if (d.vehicle?.type) profSubtypeSet.add(d.vehicle.type);
    });
    console.log("driverSubtype / vehicle.type in profiles:", Array.from(profSubtypeSet));

    // 4. Panic Alerts
    console.log("\n[4] panic_alerts collection:");
    const alertsSnap = await db.collection('panic_alerts').limit(10).get();
    console.log(`Found ${alertsSnap.size} panic_alerts`);
    if (!alertsSnap.empty) {
        console.log("Sample alert fields:", Object.keys(alertsSnap.docs[0].data()));
    }

    // 5. Reservations (rides)
    console.log("\n[5] Scheduled Rides:");
    const schedSnap = await db.collection('rides').where('isScheduled', '==', true).limit(10).get();
    console.log(`Found ${schedSnap.size} scheduled rides`);
    if (!schedSnap.empty) {
        const r = schedSnap.docs[0].data();
        console.log("Sample scheduled ride fields:", Object.keys(r));
        console.log("Has origin?", !!r.origin);
        console.log("Origin fields:", r.origin ? Object.keys(r.origin) : 'N/A');
    }

    console.log("=== AUDIT END ===");
}

audit().catch(console.error);
