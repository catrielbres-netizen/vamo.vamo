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

interface GhostCandidate {
  uid: string;
  parentExists: boolean;
  subcollections: { name: string; count: number }[];
  needs_manual_review: boolean;
  relations: string[];
  reason: string;
}

async function deleteCollection(collectionRef: any, batchSize: number) {
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query: any, resolve: any) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

async function cleanupGhostUsers() {
  console.log('--- INICIANDO LIMPIEZA DE USUARIOS FANTASMA ---');
  
  const reportPath = path.resolve(process.cwd(), 'ghost_users_report.json');
  if (!fs.existsSync(reportPath)) {
    console.error(`No se encontro el reporte: ${reportPath}. Ejecute auditGhostUsers.ts primero.`);
    return;
  }

  const candidates: GhostCandidate[] = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  const safeToDelete = candidates.filter(c => !c.needs_manual_review);
  const needsReview = candidates.filter(c => c.needs_manual_review);

  console.log(`Candidatos totales en reporte: ${candidates.length}`);
  console.log(`Requieren revision manual (Omitidos): ${needsReview.length}`);
  console.log(`Se limpiaran: ${safeToDelete.length}`);

  for (const c of safeToDelete) {
    console.log(`Limpiando ghost user: ${c.uid}`);
    const docRef = db.collection('users').doc(c.uid);
    
    // Check if the user document itself actually exists now to avoid race conditions
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      console.log(`  Omitido: El documento padre ahora existe, no es un fantasma.`);
      continue;
    }

    // Borrar documentos dentro de cada subcoleccion
    for (const sub of c.subcollections) {
      console.log(`  Borrando subcoleccion: ${sub.name}`);
      const subRef = docRef.collection(sub.name);
      await deleteCollection(subRef, 100);
    }
  }

  console.log('\n--- RESUMEN DE LIMPIEZA ---');
  console.log(`Usuarios fantasma limpiados: ${safeToDelete.length}`);
  console.log(`Usuarios fantasma omitidos (revision manual): ${needsReview.length}`);
  console.log('\n✅ Limpieza de ghost users completada con exito.');
}

cleanupGhostUsers().catch(console.error);
