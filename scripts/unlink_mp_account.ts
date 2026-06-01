import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Load service account
const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function unlinkWrongAccount() {
  const driverId = process.argv[2];
  if (!driverId) {
    console.error("Por favor provee el driverId como argumento. Ejemplo: npx tsx scripts/unlink_mp_account.ts <driverId>");
    process.exit(1);
  }

  console.log(`--- INICIANDO DESVINCULACIÓN PARA ${driverId} ---`);
  
  const batch = db.batch();

  // 1. Marcar users/{driverId}
  const userRef = db.collection('users').doc(driverId);
  batch.update(userRef, {
    mpLinked: false,
    mpAccountStatus: "revoked"
  });
  console.log(`- Preparada actualización en users/${driverId}: mpLinked=false, mpAccountStatus=revoked`);

  // 2. Marcar mp_accounts/{driverId}
  const mpAccountRef = db.collection('mp_accounts').doc(driverId);
  batch.update(mpAccountRef, {
    status: "revoked"
  });
  console.log(`- Preparada actualización en mp_accounts/${driverId}: status=revoked`);

  // NOTA: No eliminamos el documento ni los tokens por seguridad, solo cambiamos el estado.

  console.log("Ejecutando transaccion (batch commit)...");
  await batch.commit();
  
  console.log(`✅ ¡Desvinculación exitosa en Firestore para el conductor ${driverId}!`);
  console.log("--- FIN DESVINCULACIÓN ---");
}

unlinkWrongAccount().catch(console.error);
