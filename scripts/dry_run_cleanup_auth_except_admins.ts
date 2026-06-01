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
  console.log("Iniciando auditoría de Firebase Auth (Modo Múltiples Admins)...");
  
  let allUsers: any[] = [];
  let pageToken;

  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`\nTotal de usuarios en Firebase Auth: ${allUsers.length}`);

  let admins: any[] = [];
  let toDelete: any[] = [];

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

    const isAuthAdmin = user.customClaims?.admin === true || 
                        user.customClaims?.superadmin === true || 
                        user.customClaims?.role === 'admin' || 
                        user.customClaims?.role === 'superadmin';

    if (isFirestoreAdmin || isAuthAdmin) {
      admins.push({ uid: user.uid, email: user.email, isFirestoreAdmin, isAuthAdmin });
    } else {
      toDelete.push({ uid: user.uid, email: user.email });
    }
  }

  console.log("\n=== REPORTE DRY-RUN ===");
  console.log(`Usuarios a CONSERVAR (Admins): ${admins.length}`);
  console.log(`Usuarios a BORRAR: ${toDelete.length}`);
  
  console.log("\n--- Administradores que se conservarán ---");
  admins.forEach(admin => {
    console.log(`- UID: ${admin.uid} | Email: ${admin.email}`);
  });

  console.log("\n--- Primeros 10 usuarios que se borrarán ---");
  toDelete.slice(0, 10).forEach(u => {
    console.log(`- UID: ${u.uid} | Email: ${u.email}`);
  });
}

runDryRun().catch(console.error);
