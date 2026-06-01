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

async function setConfig() {
  const launchRef = db.collection('system_config').doc('launch');
  await launchRef.set({
    MP_SINGLE_DRIVER_MODE: true,
    MP_SPLIT_ENABLED: false,
    VAMO_COMMISSION_PERCENT: 18,
    updatedAt: new Date()
  }, { merge: true });
  console.log("✅ FASE A - Configuración global actualizada en system_config/launch");
}

setConfig().catch(console.error);
