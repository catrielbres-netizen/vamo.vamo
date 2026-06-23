const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function auditDrivers() {
  try {
    const driverId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    
    // Check wallet
    const walletRef = await db.collection('wallets').doc(driverId).get();
    console.log(`\n=== WALLET ===`);
    if (walletRef.exists) {
        console.log(walletRef.data());
    } else {
        console.log("No wallet document found.");
    }

    // Check location
    const locRef = await db.collection('drivers_locations').doc(driverId).get();
    console.log(`\n=== LOCATION ===`);
    if (locRef.exists) {
        console.log(locRef.data());
    } else {
        console.log("No location document found.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

auditDrivers();
