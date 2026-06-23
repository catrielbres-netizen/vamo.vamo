const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function approveMunicipal(driverId) {
    const userRef = db.doc(`users/${driverId}`);
    
    // Primero validamos si existe municipal_profiles, si no existe no actualizamos ese doc
    const muniRef = db.doc(`municipal_profiles/${driverId}`);
    const muniSnap = await muniRef.get();

    console.log(`Approving driver ${driverId}...`);

    await userRef.update({
        municipalStatus: 'approved',
        trafficSuspended: false,
        municipalSuspended: false,
        adminSuspended: false,
        isSuspended: false,
        driverRiskLevel: 'low',
        approved: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    if (muniSnap.exists) {
        await muniRef.update({
            municipalStatus: 'approved',
            trafficSuspended: false,
            isSuspended: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("municipal_profiles updated.");
    }
    
    // Also update drivers_locations if exists
    const locRef = db.doc(`drivers_locations/${driverId}`);
    const locSnap = await locRef.get();
    if (locSnap.exists) {
        await locRef.update({
            approved: true,
            isSuspended: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("drivers_locations updated.");
    }

    console.log("Successfully approved Eduardo!");
}

approveMunicipal('VNhou0ag4wXXPr6IXa3foO6SI8B3').then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
