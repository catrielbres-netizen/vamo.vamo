import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve('service-account.json');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function diagnoseMatching() {
  const standId = 'stand_170e4b0f';
  const driverId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
  const specificRideId = '5n3gHc0wrE8w1FE91nDT';
  
  console.log(`--- Diagnóstico de Matching para la Parada BOCA ---`);

  const ridesQuery = await db.collection('rides')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const rideDoc = ridesQuery.docs.find(d => d.data().stationId === standId);

  if (!rideDoc) {
    console.log(`❌ No se encontró ningún viaje asignado a la parada BOCA.`);
    return;
  }

  const rideData = rideDoc.data();
  console.log(`Último viaje ID: ${rideDoc.id}`);
  console.log(`- stationId: ${rideData?.stationId}`);
  console.log(`- stationDispatchStatus: ${rideData?.stationDispatchStatus}`);
  console.log(`- dispatchSource: ${rideData?.dispatchSource}`);
  console.log(`- status: ${rideData?.status}`);
  console.log(`- currentOfferedDriverId: ${rideData?.currentOfferedDriverId}`);
  console.log(`- notifiedDrivers:`, rideData?.notifiedDrivers);
  console.log(`- stationPriorityAttempted:`, rideData?.stationPriorityAttempted);
  console.log(`- stationPriorityDriverIds:`, rideData?.stationPriorityDriverIds);
  console.log(`- stationPriorityRound:`, rideData?.stationPriorityRound);

  // 2. Fetch offers for this ride
  const offersQuery = await db.collection('rideOffers')
    .where('rideId', '==', rideDoc.id)
    .get();

  console.log(`\nOfertas creadas para este viaje: ${offersQuery.size}`);
  let createdForEduardo = false;
  offersQuery.forEach(doc => {
      const oData = doc.data();
      console.log(`  - Oferta ID: ${doc.id} | Driver: ${oData.driverId} | Status: ${oData.status} | Round: ${oData.round}`);
      if (oData.driverId === driverId) {
          createdForEduardo = true;
      }
  });

  if (createdForEduardo) {
      console.log(`✅ Se le creó oferta a Eduardo.`);
  } else {
      console.log(`❌ NO se le creó oferta a Eduardo.`);
  }

  // 3. Fetch driver status in collections
  const dLocSnap = await db.collection('drivers_locations').doc(driverId).get();
  console.log(`\nEstado del conductor en drivers_locations:`);
  if (dLocSnap.exists) {
      const dLoc = dLocSnap.data();
      console.log(`- stationId: ${dLoc?.stationId} (VITAL)`);
      console.log(`- online/driverStatus: ${dLoc?.driverStatus}`);
      console.log(`- approved: ${dLoc?.approved}`);
      console.log(`- cityKey: ${dLoc?.cityKey}`);
  } else {
      console.log(`- Document NO exists in drivers_locations!`);
  }

  const dSnap = await db.collection('drivers').doc(driverId).get();
  console.log(`\nEstado del conductor en drivers:`);
  if (dSnap.exists) {
      const d = dSnap.data();
      console.log(`- stationId: ${d?.stationId}`);
  }

  const uSnap = await db.collection('users').doc(driverId).get();
  console.log(`\nEstado del conductor en users:`);
  if (uSnap.exists) {
      const u = uSnap.data();
      console.log(`- stationId: ${u?.stationId}`);
  }
}

diagnoseMatching().catch(console.error);
