const admin = require('firebase-admin');

// Initialize Firebase Admin
try {
  admin.initializeApp();
} catch (e) {}

const db = admin.firestore();
const auth = admin.auth();

async function createTestPassengers() {
  const users = [
    {
      email: 'pasajero1.rg@vamo.test',
      password: 'password123',
      name: 'Test',
      surname: 'RG 1',
      cityKey: 'rio_gallegos'
    },
    {
      email: 'pasajero2.rg@vamo.test',
      password: 'password123',
      name: 'Test',
      surname: 'RG 2',
      cityKey: 'rio_gallegos'
    }
  ];

  for (const u of users) {
    try {
      // Create auth user
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(u.email);
        console.log(`User ${u.email} already exists, updating password...`);
        await auth.updateUser(userRecord.uid, { password: u.password });
      } catch (e) {
        if (e.code === 'auth/user-not-found') {
          userRecord = await auth.createUser({
            email: u.email,
            password: u.password,
            displayName: `${u.name} ${u.surname}`
          });
          console.log(`Created new auth user for ${u.email}`);
        } else {
          throw e;
        }
      }

      // Create/Update Firestore document
      await db.collection('users').doc(userRecord.uid).set({
        email: u.email,
        name: u.name,
        surname: u.surname,
        displayName: `${u.name} ${u.surname}`,
        cityKey: u.cityKey,
        cityLabel: 'Río Gallegos',
        role: 'passenger',
        profileCompleted: true,
        termsAccepted: true,
        identityStatus: 'approved',
        phone: '1234567890',
        gender: 'male'
      }, { merge: true });
      
      console.log(`Successfully configured Firestore for ${u.email}`);
    } catch (err) {
      console.error(`Error processing ${u.email}:`, err);
    }
  }

  // Ensure rio_gallegos city exists and is active in Firestore
  try {
    await db.collection('cities').doc('rio_gallegos').set({
      name: 'Río Gallegos',
      status: 'active',
      enabled: true,
      allowPassengerTrips: true,
      allowRealTrips: true
    }, { merge: true });
    console.log("Successfully ensured rio_gallegos is active in cities collection.");
  } catch (err) {
    console.error("Error setting city:", err);
  }
}

createTestPassengers().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
