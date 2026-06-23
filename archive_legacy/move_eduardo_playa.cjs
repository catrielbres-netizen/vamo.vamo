const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const geofire = require('geofire-common');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function moveEduardo() {
    // Musters 290, Playa Union, Chubut
    const lat = -43.3033;
    const lng = -65.0347; // Adjusted to roughly Playa Union area
    const geohash = geofire.geohashForLocation([lat, lng]);
    
    await admin.firestore().collection('drivers_locations').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3').update({
        'currentLocation.latitude': lat,
        'currentLocation.longitude': lng,
        'currentLocation.lat': lat,
        'currentLocation.lng': lng,
        geohash: geohash,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("Eduardo movido a Musters 290, Playa Union");
}

moveEduardo().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
