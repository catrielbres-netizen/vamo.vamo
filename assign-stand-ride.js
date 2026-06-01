const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function assignLastRide() {
  const driverId = 'lqJ6fP8HxKerF7f4u0iK41dH2lw2';
  const passengerId = 'Fp2SoXCwKNPCpyc72ascUUyZvS32';
  
  // Buscar el ultimo viaje del pasajero que este buscando
  const snapshot = await db.collection('rides')
    .where('passengerId', '==', passengerId)
    .where('status', '==', 'searching')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
    
  if (snapshot.empty) {
    console.log('❌ No hay viajes en estado searching para este pasajero.');
    process.exit(1);
  }
  
  const rideRef = snapshot.docs[0].ref;
  
  await rideRef.update({
    stationDispatchStatus: 'assigned',
    stationAssignedDriverId: driverId,
    // Lo liberamos a matching general para que la UI del conductor lo pueda ver en el feed normal 
    // y aceptarlo con el flujo estandar.
    stationReleasedToGeneralMatching: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log('✅ Viaje ' + rideRef.id + ' actualizado:');
  console.log('- stationDispatchStatus: assigned');
  console.log('- stationAssignedDriverId:', driverId);
  console.log('- stationReleasedToGeneralMatching: true');
  console.log('👉 El conductor ahora podra verlo en su app y aceptarlo normalmente.');
  process.exit(0);
}

assignLastRide();
