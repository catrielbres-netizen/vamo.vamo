const admin = require('firebase-admin');

try {
    admin.initializeApp();
} catch (e) {
    console.error("InitializeApp error:", e.message);
}

const db = admin.firestore();

async function run() {
    console.log("Fetching passenger rides...");
    const passengerId = "Fp2SoXCwKNPCpyc72ascUUyZvS32"; // pasajero test

    const ridesSnapshot = await db.collection('rides')
        .where('passengerId', '==', passengerId)
        .get();

    if (ridesSnapshot.empty) {
        console.log("No rides found for passenger");
        return;
    }

    const docs = ridesSnapshot.docs;
    docs.sort((a, b) => {
        const t1 = a.data().createdAt?.toMillis() || 0;
        const t2 = b.data().createdAt?.toMillis() || 0;
        return t2 - t1;
    });

    const rideData = docs[0].data();
    console.log("Ride ID:", docs[0].id);
    console.log("Status:", rideData.status);
    console.log("Payment Method:", rideData.paymentMethod);
    console.log("Selected Payment Method:", rideData.selectedPaymentMethod);
    console.log("Payment Label:", rideData.paymentLabel);
    console.log("Payment Status:", rideData.paymentStatus);
    console.log("Driver ID:", rideData.driverId);
    console.log("Pricing Total:", rideData.pricing?.total);
    console.log("Pricing Final Price:", rideData.pricing?.finalPrice);
    console.log("Pricing Estimated Total:", rideData.pricing?.estimatedTotal);
    console.log("Completed Ride Total:", rideData.completedRide?.totalFare);
    console.log("Final Total (calculated):", rideData.completedRide ? (rideData.completedRide.totalFare - (rideData.completedRide.discountAmount || 0)) : "N/A");
    console.log("MP Preference ID:", rideData.mpPreferenceId);
    console.log("MP Checkout URL:", rideData.mpCheckoutUrl);
    console.log("MP Is Sandbox:", rideData.mpIsSandbox);

    if (rideData.driverId) {
        const driverSnap = await db.collection('mp_accounts').doc(rideData.driverId).get();
        if (driverSnap.exists) {
            const driverMp = driverSnap.data();
            console.log("\nDriver MP Status:", driverMp.status);
            console.log("Driver MP User ID:", driverMp.mpUserId);
            console.log("Driver MP Token exists:", !!(driverMp.accessToken || driverMp.access_token));
            console.log("Driver MP Token starts with TEST:", !!((driverMp.accessToken || '').startsWith('TEST') || (driverMp.access_token || '').startsWith('TEST')));
        } else {
            console.log("\nNo MP account found for driver", rideData.driverId);
        }
    }
}

run().catch(console.error).finally(() => process.exit());
