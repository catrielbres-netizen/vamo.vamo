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

async function applyConfig() {
  console.log("=== ACTUALIZANDO CONFIGURACIÓN TEMPORAL DE RAWSON ===");
  
  // 1. system_config/app_mode
  const appModeRef = db.doc('system_config/app_mode');
  await appModeRef.set({
    mode: 'municipal',
    municipalEnabled: true,
    trafficPanelEnabled: true,
    stopsPanelEnabled: true,
    independentModeEnabled: false,
    versionLabel: 'Modo Institucional Municipal',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'system_admin_script'
  }, { merge: true });
  console.log("✓ system_config/app_mode actualizado (Modo Municipal ACTIVADO).");

  // 2. system_config/global
  const globalRef = db.doc('system_config/global');
  await globalRef.set({
    matchingEnabled: true,
    expressEnabled: false,
    globalMaintenance: false,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'system_admin_script'
  }, { merge: true });
  console.log("✓ system_config/global actualizado (Matching ON, Express OFF, Maintenance OFF).");

  // 3. municipal_pricing/rawson
  const pricingRef = db.doc('municipal_pricing/rawson');
  const snap = await pricingRef.get();
  if (snap.exists) {
    const data = snap.data() as any;
    console.log(`Valores anteriores de comisiones: Taxis: ${data.commission_taxi_remis}, Particulares: ${data.commission_particular}, Municipal: ${data.municipal_percentage}, Asistencia: ${data.assistanceEnabled}`);
  }
  
  await pricingRef.set({
    commission_particular: 0,
    commission_taxi_remis: 0,
    municipal_percentage: 0,
    assistanceEnabled: false,
    ASSISTANCE_FEE: 0,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'system_admin_script'
    // Las tarifas diurnas/nocturnas no se tocan porque usamos merge: true
  }, { merge: true });
  console.log("✓ municipal_pricing/rawson actualizado (Comisiones al 0%, Asistencia OFF).");

  console.log("=== ACTUALIZACIÓN FINALIZADA ===");
}

applyConfig().catch(console.error);
