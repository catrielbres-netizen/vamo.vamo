const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'studio-6697160840-7c67f'
});

const db = admin.firestore();

async function run() {
  const rideId = 'shared_d87qKuZheOXXJ380O8PH';
  console.log(`Buscando pasajeros del viaje ${rideId}...`);
  
  const rideSnap = await db.collection('rides').doc(rideId).get();
  const rideData = rideSnap.data();
  
  const passengers = rideData.passengerIds || [];
  if (rideData.passengerId && !passengers.includes(rideData.passengerId)) {
      passengers.push(rideData.passengerId);
  }
  
  console.log("Passenger IDs in ride:", passengers);
  
  for (const pid of passengers) {
      const userSnap = await db.collection('users').doc(pid).get();
      const userData = userSnap.data();
      console.log(`Pasajero ${pid}: activeRideId = ${userData.activeRideId}, status = ${userData.sharedRideStatus}`);
      
      // Liberar de todas formas
      await userSnap.ref.update({
          activeRideId: admin.firestore.FieldValue.delete(),
          activeSharedRequestId: admin.firestore.FieldValue.delete(),
          activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
          sharedRideStatus: admin.firestore.FieldValue.delete(),
          currentSharedRideGroupId: admin.firestore.FieldValue.delete(),
          isAvailable: admin.firestore.FieldValue.delete()
      });
      console.log(`Pasajero ${pid} limpiado forzosamente.`);
  }
}

run().catch(e => {
  console.log("Error " + e.message);
});
