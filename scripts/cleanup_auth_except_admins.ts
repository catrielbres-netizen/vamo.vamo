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

async function runCleanup() {
  console.log("Iniciando limpieza de Firebase Auth conservando TODOS los admins...");
  
  let allUsers: any[] = [];
  let pageToken;

  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`\nTotal de usuarios en Firebase Auth: ${allUsers.length}`);

  let admins: any[] = [];
  let toDeleteUids: string[] = [];

  for (const user of allUsers) {
    const userDocRef = db.collection('users').doc(user.uid);
    const userDoc = await userDocRef.get();
    
    let isFirestoreAdmin = false;

    if (userDoc.exists) {
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
      admins.push(user);
    } else {
      toDeleteUids.push(user.uid);
    }
  }

  console.log("\n--- Administradores conservados ---");
  admins.forEach(admin => {
    console.log(`[CONSERVADO] UID: ${admin.uid} | Email: ${admin.email}`);
  });

  console.log(`\nCantidad de usuarios comunes a borrar: ${toDeleteUids.length}`);
  
  if (toDeleteUids.length === 0) {
    console.log("No hay usuarios para eliminar.");
    return;
  }

  console.log("\nIniciando borrado por lotes seguros...");

  const BATCH_SIZE = 50;
  let deletedCount = 0;

  for (let i = 0; i < toDeleteUids.length; i += BATCH_SIZE) {
    const batch = toDeleteUids.slice(i, i + BATCH_SIZE);
    
    try {
      const deleteResult = await auth.deleteUsers(batch);
      deletedCount += deleteResult.successCount;
      console.log(`Lote ${Math.floor(i/BATCH_SIZE) + 1}: ${deleteResult.successCount} borrados correctamente, ${deleteResult.failureCount} fallos.`);
      
      if (deleteResult.failureCount > 0) {
         deleteResult.errors.forEach((err) => {
           console.log(`Error borrando UID ${batch[err.index]}:`, err.error.message);
         });
      }
    } catch (e: any) {
       console.error("Error al borrar lote:", e.message);
    }
  }

  console.log(`\n=== LIMPIEZA FINALIZADA ===`);
  console.log(`Total eliminados: ${deletedCount}`);
  
  const listAfter = await auth.listUsers(1000);
  console.log(`Usuarios restantes en Auth: ${listAfter.users.length}`);
}

runCleanup().catch(console.error);
