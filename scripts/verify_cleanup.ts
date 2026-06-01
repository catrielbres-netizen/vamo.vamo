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

async function verify() {
  console.log('--- VERIFICACIÓN POST-LIMPIEZA ---');
  let errors = 0;

  // 1. Check users
  const usersSnap = await db.collection('users').get();
  console.log(`\n1. Usuarios restantes: ${usersSnap.size}`);
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.role !== 'admin' && data.role !== 'superadmin' && data.admin !== true) {
      console.error(`❌ ERROR: Usuario no admin encontrado: ${doc.id}`);
      errors++;
    }
  }

  // Admin IDs to check against
  const adminIds = new Set(usersSnap.docs.map(d => d.id));

  // 2. mp_accounts
  const mpSnap = await db.collection('mp_accounts').get();
  for (const doc of mpSnap.docs) {
    if (!adminIds.has(doc.id) && doc.data().status !== 'revoked_deleted_user') {
      console.error(`❌ ERROR: mp_account activa para usuario eliminado: ${doc.id}`);
      errors++;
    }
  }

  // 3. public_driver_profiles
  const pdpSnap = await db.collection('public_driver_profiles').get();
  for (const doc of pdpSnap.docs) {
    if (!adminIds.has(doc.id)) {
      console.error(`❌ ERROR: public_driver_profile huérfano: ${doc.id}`);
      errors++;
    }
  }

  // 4. wallets
  const walletsSnap = await db.collection('wallets').get();
  for (const doc of walletsSnap.docs) {
    if (!adminIds.has(doc.id)) {
      console.error(`❌ ERROR: wallet de usuario eliminado: ${doc.id}`);
      errors++;
    }
  }

  // 5. referrals
  const referralsSnap = await db.collection('referrals').get();
  for (const doc of referralsSnap.docs) {
    if (!adminIds.has(doc.id)) {
      console.error(`❌ ERROR: referral de usuario eliminado: ${doc.id}`);
      errors++;
    }
  }

  // 6. system_config
  const planB = await db.collection('system_config').doc('plan_b_pricing').get();
  const launch = await db.collection('system_config').doc('launch').get();
  
  if (!planB.exists) {
    console.error('❌ ERROR: system_config/plan_b_pricing no existe!');
    errors++;
  } else {
    console.log('✅ system_config/plan_b_pricing verificado.');
  }

  if (!launch.exists) {
    console.error('❌ ERROR: system_config/launch no existe!');
    errors++;
  } else {
    console.log('✅ system_config/launch verificado.');
  }

  if (errors === 0) {
    console.log('\n✅ VERIFICACIÓN EXITOSA: La base de datos está limpia según las reglas.');
  } else {
    console.log(`\n❌ SE ENCONTRARON ${errors} ERRORES.`);
  }
}

verify().catch(console.error);
