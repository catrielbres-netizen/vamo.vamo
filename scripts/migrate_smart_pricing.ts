import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

async function run() {
  console.log('--- MIGRANDO TARIFA DINAMICA A GLOBAL ---');
  
  // 1. Fetch rawson config
  const rawsonSnap = await db.collection('municipal_pricing').doc('rawson').get();
  if (!rawsonSnap.exists) {
      console.error('Rawson config no existe.');
      return;
  }
  
  const rawsonData = rawsonSnap.data();
  const rawsonDynamic = rawsonData?.dynamicPricing;
  
  if (!rawsonDynamic) {
      console.error('Rawson no tiene dynamicPricing.');
      return;
  }
  
  // 2. Set global config
  const globalRef = db.collection('system_config').doc('smart_pricing');
  await globalRef.set({
      ...rawsonDynamic,
      schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'migration_script'
  }, { merge: true });
  console.log('✔ Guardada configuración global en system_config/smart_pricing');
  
  // 3. Activar smartPricingEnabled en Rawson para que no pierda la funcionalidad
  await db.collection('municipal_pricing').doc('rawson').update({
      smartPricingEnabled: true
  });
  console.log('✔ Activado smartPricingEnabled en municipal_pricing/rawson');
  
  // 4. (Opcional) Activar en otras ciudades o dejar en false. El user dijo "Río Gallegos, Trelew, Rawson, Villa La Angostura deben usar el mismo esquema". 
  // No las activamos, pero nos aseguramos que existan en false o undefined se tratará como false.
  
  console.log('Migración completada!');
}

run().catch(console.error);
