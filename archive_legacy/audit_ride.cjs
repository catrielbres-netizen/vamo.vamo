const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function auditLastRide() {
  try {
    const ridesSnapshot = await db.collection('rides')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (ridesSnapshot.empty) {
        console.log("No rides found.");
        return;
    }

    const ride = ridesSnapshot.docs[0];
    const data = ride.data();
    
    console.log(`\n=== RIDE AUDIT: ${ride.id} ===`);
    console.log(`Status: ${data.status}`);
    console.log(`Service Type: ${data.serviceType}`);
    console.log(`Passenger: ${data.passengerId} | Name: ${data.passengerName}`);
    console.log(`Driver ID: ${data.driverId || 'None'}`);
    console.log(`City: ${data.cityKey}`);
    console.log(`Pricing:`, JSON.stringify(data.pricing, null, 2));
    if (data.cancelReason) {
        console.log(`Cancel Reason: ${data.cancelReason}`);
        console.log(`Cancelled By: ${data.cancelledBy}`);
    }

    // Check offers for this ride
    const offersSnapshot = await db.collection('rideOffers')
        .where('rideId', '==', ride.id)
        .get();

    console.log(`\n--- Offers for this ride (${offersSnapshot.size}) ---`);
    offersSnapshot.forEach(doc => {
        const offer = doc.data();
        console.log(`Offer ${doc.id}: Driver=${offer.driverId}, Status=${offer.status}, Expiry=${offer.expiresAt ? offer.expiresAt.toDate() : 'N/A'}`);
    });

    // Check driver's location and balance
    if (offersSnapshot.size > 0) {
        const firstOffer = offersSnapshot.docs[0].data();
        const driverId = firstOffer.driverId;
        const driverLoc = await db.collection('drivers_locations').doc(driverId).get();
        if (driverLoc.exists) {
            console.log(`\n--- Driver Location Data ---`);
            console.log(`Driver: ${driverId}`);
            console.log(`Online: ${driverLoc.data().isOnline}`);
            console.log(`Wallet Balance: ${driverLoc.data().walletBalance}`);
            console.log(`Municipal Status: ${driverLoc.data().municipalStatus}`);
        }
    } else {
        console.log("\nNo offers were sent to any driver. This usually means no drivers were eligible (e.g. negative balance or offline).");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

auditLastRide();
