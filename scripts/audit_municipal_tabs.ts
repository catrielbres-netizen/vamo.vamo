import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function auditMunicipalTabs() {
  console.log("=== AUDIT TABS ===");
  const city = 'rawson';

  // Alertas
  const alerts = await db.collection('alerts').where('cityKey', '==', city).count().get();
  console.log(`Alertas: ${alerts.data().count}`);

  // Paradas
  const taxiStands = await db.collection('taxi_stands').where('cityKey', '==', city).count().get();
  console.log(`Paradas: ${taxiStands.data().count}`);

  // Tránsito (Traffic events/reports)
  const traffic = await db.collection('traffic_events').where('cityKey', '==', city).count().get();
  console.log(`Tránsito (traffic_events): ${traffic.data().count}`);
  
  const emergency = await db.collection('emergency_events').where('cityKey', '==', city).count().get();
  console.log(`Tránsito (emergency_events): ${emergency.data().count}`);

  // Pasajeros
  const passengers = await db.collection('users').where('cityKey', '==', city).where('role', '==', 'passenger').count().get();
  console.log(`Pasajeros: ${passengers.data().count}`);

  // Tesorería
  const accounts = await db.collection('municipal_accounts').where('cityKey', '==', city).get();
  if (accounts.size > 0) {
      console.log(`Tesorería (account balance): ${accounts.docs[0].data().currentBalance}`);
  } else {
      console.log(`Tesorería: No account exists.`);
  }

  // Conductores (municipal_profiles)
  const profiles = await db.collection('municipal_profiles').where('cityKey', '==', city).count().get();
  console.log(`Conductores (municipal_profiles): ${profiles.data().count}`);

  // Withdraw requests
  const withdraws = await db.collection('municipal_withdrawals').where('cityKey', '==', city).count().get();
  console.log(`Retiros pendientes: ${withdraws.data().count}`);
}

auditMunicipalTabs().catch(console.error);
