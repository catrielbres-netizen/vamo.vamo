
const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'studio-6697160840-7c67f'
});
const db = admin.firestore();

async function check() {
  const rides = await db.collection('rides').orderBy('createdAt', 'desc').limit(1).get();
  if (rides.empty) {
    console.log("No rides found.");
    return;
  }
  const ride = rides.docs[0];
  console.log("LAST RIDE:", JSON.stringify({ id: ride.id, ...ride.data() }, null, 2));

  const driverId = "ybcL9gMayAbO8nq5deadB1qusub2"; // The one from the screenshot
  const loc = await db.collection('drivers_locations').doc(driverId).get();
  console.log("DRIVER LOCATION:", JSON.stringify(loc.exists ? loc.data() : "NOT_FOUND", null, 2));
  
  const profile = await db.collection('users').doc(driverId).get();
  console.log("DRIVER PROFILE:", JSON.stringify(profile.exists ? profile.data() : "NOT_FOUND", null, 2));
}
check();
