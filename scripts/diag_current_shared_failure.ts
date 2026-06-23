import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  if (getApps().length === 0) {
    initializeApp({
        projectId: 'studio-6697160840-7c67f',
    });
  }

  const db = getFirestore();

  const driverId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
  const pax1Id = 'HYakOQJ8WqeauOHtn8VdcYlaSlK2';
  const pax2Id = 'eMhDWqwmQMgoKMskjzTd2StwQaI3';

  console.log("--- INICIANDO DIAGNÓSTICO DINÁMICO ---\n");

  const ridesToFetch = new Set<string>();

  // 1. Usuarios
  for (const [name, uid] of [['Conductor (Eduardo)', driverId], ['Pasajero 1 (Test 1)', pax1Id], ['Pasajero 2 (Maria)', pax2Id]]) {
      const user = await db.collection('users').doc(uid).get();
      const d = user.data() || {};
      console.log(`Usuario: ${name}`);
      console.log(`- activeRideId: ${d.activeRideId}`);
      console.log(`- activeSharedRideId: ${d.activeSharedRideId}`);
      console.log(`- activeSharedGroupId: ${d.activeSharedGroupId}`);
      console.log(`- activeSharedRequestId: ${d.activeSharedRequestId}`);
      console.log('');

      if (d.activeRideId) ridesToFetch.add(d.activeRideId);
      if (d.activeSharedRideId) ridesToFetch.add(d.activeSharedRideId);
  }

  for (const rideId of Array.from(ridesToFetch)) {
      const ride = await db.collection('rides').doc(rideId).get();
      const md = ride.data() || {};
      console.log(`Ride Encontrado: ${rideId}`);
      console.log(`- status: ${md.status}`);
      console.log(`- sharedOperationalStatus: ${md.sharedOperationalStatus}`);
      console.log(`- driverId: ${md.driverId}`);
      console.log(`- isSharedRide: ${md.isSharedRide}`);
      console.log(`- masterRideId: ${md.masterRideId}`);
      console.log(`- sharedRequestIds: ${JSON.stringify(md.sharedRequestIds)}`);
      console.log(`- sharedGroupId: ${md.sharedGroupId}`);
      console.log(`- completedRide: ${!!md.completedRide}`);
      if (md.orderedStops) {
         console.log(`- orderedStops:`, JSON.stringify(md.orderedStops.map((s:any) => ({ type: s.type, reqId: s.requestId, status: s.status }))));
      }
      console.log('');

      if (md.sharedGroupId) {
          const reqs = await db.collection('shared_ride_requests').where('groupId', '==', md.sharedGroupId).get();
          console.log(`Requests para el Grupo: ${md.sharedGroupId}`);
          for (const doc of reqs.docs) {
              const rd = doc.data();
              console.log(`- Request ID: ${doc.id}`);
              console.log(`  - status: ${rd.status}`);
              console.log(`  - finalRideId: ${rd.finalRideId}`);
              console.log(`  - passengerId: ${rd.passengerId}`);
              console.log(`  - settlementStatus: ${rd.settlementStatus}`);
              console.log(`  - isFinancialReceipt: ${rd.isFinancialReceipt}`);
          }
          console.log('');
      }

      if (md.isSharedRide && !md.masterRideId) {
          const children = await db.collection('rides').where('masterRideId', '==', rideId).get();
          console.log(`Child Rides para Master ${rideId}: ${children.docs.length}`);
          for (const doc of children.docs) {
              const cd = doc.data();
              console.log(`- ID: ${doc.id}`);
              console.log(`  - status: ${cd.status}`);
              console.log(`  - passengerId: ${cd.passengerId}`);
              console.log(`  - completedRide: ${!!cd.completedRide}`);
          }
          console.log('');
      }
  }
}

main().catch(console.error);
