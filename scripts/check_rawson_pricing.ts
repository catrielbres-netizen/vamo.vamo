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

async function checkRawson() {
  const global = await db.doc('system_config/global').get();
  const appMode = await db.doc('system_config/app_mode').get();
  const finMode = await db.doc('system_config/financial_model').get();
  const munPricingRawson = await db.doc('municipal_pricing/rawson').get();
  
  // also check if there's any other pricing doc
  const pricingRawson = await db.doc('pricing/rawson').get();
  const ciudadesRawson = await db.doc('ciudades/rawson').get();
  const cityConfigRawson = await db.doc('city_config/rawson').get();

  console.log("=== system_config/global ===", global.exists ? global.data() : "NO EXISTE");
  console.log("=== system_config/app_mode ===", appMode.exists ? appMode.data() : "NO EXISTE");
  console.log("=== system_config/financial_model ===", finMode.exists ? finMode.data() : "NO EXISTE");
  console.log("=== municipal_pricing/rawson ===", munPricingRawson.exists ? munPricingRawson.data() : "NO EXISTE");
  console.log("=== pricing/rawson ===", pricingRawson.exists ? pricingRawson.data() : "NO EXISTE");
  console.log("=== ciudades/rawson ===", ciudadesRawson.exists ? ciudadesRawson.data() : "NO EXISTE");
  console.log("=== city_config/rawson ===", cityConfigRawson.exists ? cityConfigRawson.data() : "NO EXISTE");
}

checkRawson().catch(console.error);
