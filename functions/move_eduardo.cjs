const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const geofire = require('geofire-common');

const serviceAccountPath = path.join(process.cwd(), '../service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function moveEduardo() {
    const lat = -43.3000316;
    const lng = -65.102042;
    const geohash = geofire.geohashForLocation([lat, lng]);
    
    await admin.firestore().collection('drivers_locations').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3').update({
        'currentLocation.latitude': lat,
        'currentLocation.longitude': lng,
        'currentLocation.lat': lat,
        'currentLocation.lng': lng,
        geohash: geohash
    });
    console.log("Eduardo movido al origen del pasajero");
}

moveEduardo().then(() => process.exit(0));
