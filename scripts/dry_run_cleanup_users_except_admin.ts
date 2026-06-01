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

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '');
}

async function auditAndBackup() {
  console.log('--- INICIANDO DRY-RUN Y BACKUP ---');
  
  const backupData: any = {
    users: {},
    mp_accounts: {},
    public_driver_profiles: {},
    wallets: {},
    referrals: {},
    rides: {}
  };

  const toKeep = {
    users: [] as any[],
  };

  const toDeleteCount = {
    users: 0,
    mp_accounts: 0,
    public_driver_profiles: 0,
    wallets: 0,
    referrals: 0,
    rides: 0, // Not deleting rides by default unless specified, but let's count them
  };

  // 1. Audit Users
  const usersSnap = await db.collection('users').get();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    backupData.users[doc.id] = data;

    // Check if admin
    const isAdmin = data.role === 'admin' || data.admin === true;
    if (isAdmin) {
      toKeep.users.push({ id: doc.id, email: data.email, role: data.role, displayName: data.displayName });
    } else {
      toDeleteCount.users++;
    }
  }

  // 2. Audit mp_accounts
  const mpAccountsSnap = await db.collection('mp_accounts').get();
  for (const doc of mpAccountsSnap.docs) {
    backupData.mp_accounts[doc.id] = doc.data();
    if (!toKeep.users.find(u => u.id === doc.id)) {
      toDeleteCount.mp_accounts++;
    }
  }

  // 3. Audit public_driver_profiles
  const pdpSnap = await db.collection('public_driver_profiles').get();
  for (const doc of pdpSnap.docs) {
    backupData.public_driver_profiles[doc.id] = doc.data();
    if (!toKeep.users.find(u => u.id === doc.id)) {
      toDeleteCount.public_driver_profiles++;
    }
  }

  // 4. Audit wallets
  const walletsSnap = await db.collection('wallets').get();
  for (const doc of walletsSnap.docs) {
    backupData.wallets[doc.id] = doc.data();
    if (!toKeep.users.find(u => u.id === doc.id)) {
      toDeleteCount.wallets++;
    }
  }

  // 5. Audit referrals
  const referralsSnap = await db.collection('referrals').get();
  for (const doc of referralsSnap.docs) {
    backupData.referrals[doc.id] = doc.data();
    toDeleteCount.referrals++; // Usually linked to users, let's say we clean up all if they are for non-admins
  }

  // 6. Audit rides
  const ridesSnap = await db.collection('rides').get();
  for (const doc of ridesSnap.docs) {
    backupData.rides[doc.id] = doc.data();
    toDeleteCount.rides++; // Let's just count them
  }

  // Create Backup
  const backupsDir = path.resolve(process.cwd(), 'scripts', 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const backupFile = path.join(backupsDir, `backup_before_user_cleanup_${getTimestamp()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`\n✅ Backup guardado en: ${backupFile}`);

  // Report
  console.log('\n=== REPORTE DE DRY-RUN ===');
  console.log('\nADMINS DETECTADOS (Se conservarán):');
  toKeep.users.forEach(u => {
    console.log(`- UID: ${u.id} | Email: ${u.email} | Role: ${u.role} | Nombre: ${u.displayName || 'N/A'}`);
  });

  if (toKeep.users.length === 0) {
    console.log('⚠️ ADVERTENCIA: NO SE DETECTARON ADMINS. ¡Revisar antes de borrar!');
  }

  console.log('\nDOCUMENTOS QUE SE BORRARÍAN (O MARCARÍAN) POR COLECCIÓN:');
  console.log(`- users: ${toDeleteCount.users}`);
  console.log(`- mp_accounts: ${toDeleteCount.mp_accounts}`);
  console.log(`- public_driver_profiles: ${toDeleteCount.public_driver_profiles}`);
  console.log(`- wallets: ${toDeleteCount.wallets}`);
  console.log(`- referrals: ${toDeleteCount.referrals}`);
  console.log(`- rides: ${toDeleteCount.rides} (Los rides podrían marcarse como archivados o dejarse intactos)`);

  const total = toDeleteCount.users + toDeleteCount.mp_accounts + toDeleteCount.public_driver_profiles + toDeleteCount.wallets + toDeleteCount.referrals;
  console.log(`\nTOTAL A BORRAR/MARCAR (Aprox): ${total}`);
  
  console.log('\n--- FIN DRY-RUN ---');
}

auditAndBackup().catch(console.error);
