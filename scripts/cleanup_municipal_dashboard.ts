import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function cleanupMunicipalDashboard() {
  console.log("=== INICIANDO LIMPIEZA DEL DASHBOARD MUNICIPAL (RAWSON) ===");
  
  // 1. Delete 43 documents from municipal_profiles for 'rawson'
  const profilesSnap = await db.collection('municipal_profiles').where('cityKey', '==', 'rawson').get();
  
  const batch = db.batch();
  let deletedCount = 0;
  
  profilesSnap.forEach(doc => {
      batch.delete(doc.ref);
      deletedCount++;
  });
  
  await batch.commit();
  console.log(`✅ [1/2] Eliminados ${deletedCount} documentos de 'municipal_profiles'.`);

  // 2. Reset the stats object in cities/rawson
  const cityRef = db.doc('cities/rawson');
  const citySnap = await cityRef.get();
  
  if (!citySnap.exists) {
      console.error("❌ cities/rawson no existe. Esto no debería pasar.");
      return;
  }
  
  await cityRef.set({
      stats: {
          totalRidesToday: 0,
          totalCityRevenue: 0,
          totalMunicipalContribution: 0,
          totalPlatformCommission: 0,
          totalRides: 0,
          lastMunicipalContributionAt: null
      }
  }, { merge: true });
  
  console.log("✅ [2/2] Objeto 'stats' en 'cities/rawson' ha sido reseteado a ceros.");
  
  console.log("=== LIMPIEZA FINALIZADA CORRECTAMENTE ===");
}

cleanupMunicipalDashboard().catch(console.error);
