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

interface Candidate {
  documentId: string;
  uid: string;
  email: string;
  role: string;
  cityKey: string;
  createdAt: any;
  name: string;
  approved: boolean;
  reason: string;
  needs_manual_review: boolean;
  relations: string[];
}

async function cleanup() {
  console.log('--- INICIANDO LIMPIEZA DE USUARIOS SIN EMAIL ---');
  
  const reportPath = path.resolve(process.cwd(), 'user_cleanup_candidates.json');
  if (!fs.existsSync(reportPath)) {
    console.error(`No se encontró el reporte: ${reportPath}. Ejecute auditUsersWithoutEmail.ts primero.`);
    return;
  }

  const candidates: Candidate[] = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  const safeToDelete = candidates.filter(c => !c.needs_manual_review);
  const needsReview = candidates.filter(c => c.needs_manual_review);

  console.log(`Candidatos totales en reporte: ${candidates.length}`);
  console.log(`Requieren revision manual (Omitidos): ${needsReview.length}`);
  console.log(`Se eliminaran: ${safeToDelete.length}`);

  let batch = db.batch();
  let operationCount = 0;
  let deletedCount = 0;

  async function commitBatchIfNeeded() {
    if (operationCount >= 450) {
      await batch.commit();
      console.log(`Batch commited... (${deletedCount} usuarios procesados)`);
      batch = db.batch();
      operationCount = 0;
    }
  }

  for (const c of safeToDelete) {
    const docRef = db.collection('users').doc(c.documentId);
    
    // Podemos eliminar recursivamente las subcolecciones conocidas si fuera necesario
    // pero de acuerdo a los requerimientos: Si tiene subcolecciones importantes, se marca needs_manual_review.
    // Si llegamos aqui, se supone que no tiene subcolecciones importantes.
    // Borramos el documento de usuario
    batch.delete(docRef);
    operationCount++;
    deletedCount++;
    await commitBatchIfNeeded();
    console.log(`Borrando usuario: ${c.documentId} (${c.email || 'sin email'}) - Motivo: ${c.reason}`);
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  console.log('\n--- RESUMEN DE LIMPIEZA ---');
  console.log(`Usuarios eliminados: ${deletedCount}`);
  console.log(`Usuarios omitidos (necesitan revision manual): ${needsReview.length}`);
  console.log('\n✅ Limpieza completada con exito.');
}

cleanup().catch(console.error);
