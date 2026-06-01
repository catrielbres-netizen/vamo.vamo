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

async function cleanup() {
  console.log('--- INICIANDO LIMPIEZA REAL DE USUARIOS ---');
  
  // Identify admins to keep
  const admins = new Set<string>();
  const usersSnap = await db.collection('users').get();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.role === 'admin' || data.role === 'superadmin' || data.admin === true) {
      admins.add(doc.id);
    }
  }

  console.log(`Admins a conservar: ${admins.size}`);

  let batch = db.batch();
  let operationCount = 0;

  async function commitBatchIfNeeded() {
    if (operationCount >= 450) {
      await batch.commit();
      console.log('Batch commited...');
      batch = db.batch();
      operationCount = 0;
    }
  }

  // 1. Delete users
  let deletedUsers = 0;
  for (const doc of usersSnap.docs) {
    if (!admins.has(doc.id)) {
      batch.delete(doc.ref);
      operationCount++;
      deletedUsers++;
      await commitBatchIfNeeded();
    }
  }

  // 2. Mark mp_accounts as revoked_deleted_user
  const mpSnap = await db.collection('mp_accounts').get();
  let markedMpAccounts = 0;
  for (const doc of mpSnap.docs) {
    if (!admins.has(doc.id)) {
      batch.update(doc.ref, { status: 'revoked_deleted_user' });
      operationCount++;
      markedMpAccounts++;
      await commitBatchIfNeeded();
    }
  }

  // 3. Delete public_driver_profiles
  const pdpSnap = await db.collection('public_driver_profiles').get();
  let deletedPdp = 0;
  for (const doc of pdpSnap.docs) {
    if (!admins.has(doc.id)) {
      batch.delete(doc.ref);
      operationCount++;
      deletedPdp++;
      await commitBatchIfNeeded();
    }
  }

  // 4. Delete wallets
  const walletsSnap = await db.collection('wallets').get();
  let deletedWallets = 0;
  for (const doc of walletsSnap.docs) {
    if (!admins.has(doc.id)) {
      batch.delete(doc.ref);
      operationCount++;
      deletedWallets++;
      await commitBatchIfNeeded();
    }
  }

  // 5. Delete referrals
  const referralsSnap = await db.collection('referrals').get();
  let deletedReferrals = 0;
  for (const doc of referralsSnap.docs) {
    // Referrals could be deleted entirely or checked against admin ids. Let's delete all not related to admins
    // if referral ID is a user ID
    if (!admins.has(doc.id)) {
        batch.delete(doc.ref);
        operationCount++;
        deletedReferrals++;
        await commitBatchIfNeeded();
    }
  }

  // Final commit
  if (operationCount > 0) {
    await batch.commit();
  }

  console.log('\n--- RESUMEN DE LIMPIEZA ---');
  console.log(`- Usuarios eliminados: ${deletedUsers}`);
  console.log(`- mp_accounts marcadas como revoked_deleted_user: ${markedMpAccounts}`);
  console.log(`- public_driver_profiles eliminados: ${deletedPdp}`);
  console.log(`- wallets eliminadas: ${deletedWallets}`);
  console.log(`- referrals eliminados: ${deletedReferrals}`);
  console.log(`- rides: intactos (sin borrar)`);
  console.log('\n✅ Limpieza completada con éxito.');
}

cleanup().catch(console.error);
