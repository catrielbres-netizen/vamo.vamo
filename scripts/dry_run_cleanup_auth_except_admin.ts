import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
const auth = getAuth();

async function runDryRun() {
  console.log("Iniciando auditoría de Firebase Auth...");
  
  let allUsers: any[] = [];
  let pageToken;

  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`\nTotal de usuarios en Firebase Auth: ${allUsers.length}`);

  const backupDir = path.resolve(process.cwd(), 'scripts', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
  const backupPath = path.resolve(backupDir, `backup_auth_before_cleanup_${timestamp}.json`);

  const backupData = allUsers.map(user => ({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    disabled: user.disabled,
    providerData: user.providerData,
    customClaims: user.customClaims,
    creationTime: user.metadata.creationTime,
    lastSignInTime: user.metadata.lastSignInTime
  }));

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log(`\n✅ Backup creado en: ${backupPath}`);

  let admins = [];
  let toDelete = [];
  let toKeep = [];

  for (const user of allUsers) {
    const userDocRef = db.collection('users').doc(user.uid);
    const userDoc = await userDocRef.get();
    
    let isFirestoreAdmin = false;
    let hasFirestoreDoc = userDoc.exists;

    if (hasFirestoreDoc) {
      const data = userDoc.data();
      if (data?.role === 'admin' || data?.role === 'superadmin') {
        isFirestoreAdmin = true;
      }
    }

    const isAuthAdmin = user.customClaims?.admin === true || user.customClaims?.superadmin === true;

    const userSummary = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      hasFirestoreDoc,
      isFirestoreAdmin,
      isAuthAdmin,
      customClaims: user.customClaims
    };

    if (isFirestoreAdmin || isAuthAdmin) {
      admins.push(userSummary);
      toKeep.push(userSummary);
    } else {
      toDelete.push(userSummary);
    }

    // Warnings
    if (!hasFirestoreDoc) {
      console.log(`[WARNING] Usuario Auth SIN documento Firestore: ${user.uid} (${user.email})`);
    }
    if (user.email?.includes('admin') && !isFirestoreAdmin && !isAuthAdmin) {
      console.log(`[WARNING] Usuario con email admin pero sin rol admin: ${user.uid} (${user.email})`);
    }
  }

  console.log("\n=== REPORTE DRY-RUN ===");
  console.log(`Usuarios a CONSERVAR (Potenciales Admins): ${toKeep.length}`);
  console.log(`Usuarios a BORRAR: ${toDelete.length}`);
  
  console.log("\n--- Administradores Detectados ---");
  admins.forEach(admin => {
    console.log(`- UID: ${admin.uid} | Email: ${admin.email} | FS Admin: ${admin.isFirestoreAdmin} | Auth Admin: ${admin.isAuthAdmin}`);
  });

  console.log("\n[NOTA] Revisar los administradores detectados y seleccionar UN (1) UID para pasar al script de limpieza real.");
}

runDryRun().catch(console.error);
