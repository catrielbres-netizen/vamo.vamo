import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function runCitiesCleanup() {
  console.log(`\n=== LIMPIEZA DEFINITIVA DE CIUDADES DE PRUEBA ===`);
  
  const citiesSnap = await db.collection('cities').get();
  const invitesSnap = await db.collection('municipal_onboarding_invites').get();

  const allCities = citiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allInvites = invitesSnap.docs.map(d => ({ id: d.id, cityKey: d.data().cityKey }));

  // C) Cuáles se eliminarían
  const citiesToDelete = allCities.filter(c => c.id !== 'rawson' && c.cityKey !== 'rawson');
  const invitesToDelete = allInvites.filter(i => i.cityKey !== 'rawson');

  console.log(`\nA) Se eliminarán ${citiesToDelete.length} documentos de 'cities'...`);
  let citiesDeleted = 0;
  for (const c of citiesToDelete) {
    await db.collection('cities').doc(c.id).delete();
    console.log(`   - Eliminado: ${c.id}`);
    citiesDeleted++;
  }

  console.log(`\nB) Se eliminarán ${invitesToDelete.length} documentos de 'municipal_onboarding_invites'...`);
  let invitesDeleted = 0;
  for (const i of invitesToDelete) {
    await db.collection('municipal_onboarding_invites').doc(i.id).delete();
    console.log(`   - Eliminado: ${i.id}`);
    invitesDeleted++;
  }

  // C) Confirmación de Rawson
  const rawsonDoc = await db.collection('cities').doc('rawson').get();
  console.log(`\nC) Confirmación de 'cities/rawson':`);
  if (rawsonDoc.exists) {
    console.log(`   ✓ El documento 'cities/rawson' existe y está a salvo.`);
  } else {
    console.log(`   ❌ ATENCIÓN: El documento 'cities/rawson' no se encontró (probablemente nunca existió con ese ID, pero no fue borrado en este paso).`);
  }

  // D) Cantidad final de ciudades visibles
  const finalCitiesSnap = await db.collection('cities').get();
  console.log(`\nD) Cantidad final de ciudades visibles en la colección 'cities': ${finalCitiesSnap.size}`);
  const finalCitiesList = finalCitiesSnap.docs.map(d => d.id).join(', ');
  console.log(`   - Ciudades restantes: ${finalCitiesList || 'Ninguna'}`);

  console.log(`\n=== LIMPIEZA FINALIZADA COMPLETAMENTE ===`);
}

runCitiesCleanup().catch(console.error);
