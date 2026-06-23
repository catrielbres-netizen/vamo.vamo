const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkProfile() {
  const user = await db.collection('users').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3').get();
  console.log(`\n=== USER PROFILE ===`);
  const data = user.data();
  console.log("activeRideId:", data.activeRideId);
  console.log("driverRiskLevel:", data.driverRiskLevel);
  console.log("licenseExpiry:", data.licenseExpiry ? data.licenseExpiry.toDate() : 'none');
  console.log("insuranceExpiry:", data.insuranceExpiry ? data.insuranceExpiry.toDate() : 'none');
  console.log("itvExpiry:", data.itvExpiry ? data.itvExpiry.toDate() : 'none');
  console.log("canonExpiry:", data.canonExpiry ? data.canonExpiry.toDate() : 'none');
  console.log("canonStatus:", data.canonStatus);
  console.log("approved:", data.approved);
  console.log("municipalStatus:", data.municipalStatus);
  console.log("profileCompleted:", data.profileCompleted);

  const wallet = await db.collection('wallets').doc('VNhou0ag4wXXPr6IXa3foO6SI8B3').get();
  console.log("CashBalance:", wallet.data()?.cashBalance);

  process.exit(0);
}

checkProfile();
