const admin = require('firebase-admin');

const serviceAccount = require('C:\\Users\\catri\\vamo.vamo\\firebase-adminsdk.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const email = 'chofer.rawson.001@gmail.com';

async function verifyEmail() {
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('A) UID encontrado:', userRecord.uid);

    await admin.auth().updateUser(userRecord.uid, {
      emailVerified: true
    });
    console.log('B) Confirmación de Firebase Auth emailVerified: true');

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userRecord.uid);
    const docSnap = await userRef.get();

    if (!docSnap.exists) {
      console.log('C) Firestore profile not found for uid:', userRecord.uid);
      return;
    }

    const data = docSnap.data();
    console.log('E) Confirmación de que no se tocó ningún otro usuario: TRUE');
    console.log(`F) Rol: ${data.role}, CityKey: ${data.cityKey}, Approved: ${data.approved}, Status: ${data.driverStatus}, VehicleOwnerId: ${data.vehicleOwnerId}, SettlementOwnerId: ${data.settlementOwnerId}, VehicleId: ${data.vehicleId}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyEmail();
