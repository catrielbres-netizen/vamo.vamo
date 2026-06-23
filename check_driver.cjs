const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkDriver() {
    try {
        const email = 'autorcompositoreducisneros@gmail.com';
        console.log(`Checking driver with email: ${email}`);
        
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (snapshot.empty) {
            console.log('Driver not found by email.');
            return;
        }

        const driverDoc = snapshot.docs[0];
        const data = driverDoc.data();
        
        console.log(`Driver ID: ${driverDoc.id}`);
        console.log(`Name: ${data.name} ${data.lastName}`);
        console.log(`Role: ${data.role}`);
        console.log(`Status: ${data.status}`);
        console.log(`DriverStatus: ${data.driverStatus}`);
        console.log(`isOnline: ${data.isOnline}`);
        console.log(`CityKey: ${data.cityKey}`);
        console.log(`Verification: ${JSON.stringify(data.verification)}`);
        
        if (data.currentLocation) {
            console.log(`Location: ${data.currentLocation.latitude}, ${data.currentLocation.longitude} (updated at: ${data.currentLocationUpdatedAt ? data.currentLocationUpdatedAt.toDate() : 'unknown'})`);
        } else {
            console.log('No current location.');
        }

        // Now check active rides looking for drivers
        console.log('\n--- Active Rides ---');
        const ridesRef = db.collection('rides');
        const activeRides = await ridesRef.where('status', '==', 'searching').get();
        
        if (activeRides.empty) {
            console.log('No active rides in "searching" state.');
        } else {
            activeRides.forEach(doc => {
                const r = doc.data();
                console.log(`Ride ID: ${doc.id}`);
                console.log(`  Passenger: ${r.passengerId}`);
                console.log(`  CityKey: ${r.cityKey}`);
                console.log(`  Pickup: ${r.pickupLocation?.latitude}, ${r.pickupLocation?.longitude}`);
                if (data.currentLocation && r.pickupLocation) {
                    // Haversine approx
                    const R = 6371; // km
                    const dLat = (r.pickupLocation.latitude - data.currentLocation.latitude) * Math.PI / 180;
                    const dLon = (r.pickupLocation.longitude - data.currentLocation.longitude) * Math.PI / 180;
                    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(data.currentLocation.latitude*Math.PI/180)*Math.cos(r.pickupLocation.latitude*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const d = R * c;
                    console.log(`  Distance to driver: ${d.toFixed(2)} km`);
                }
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkDriver();
