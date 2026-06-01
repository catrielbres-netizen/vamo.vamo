import { getApps, initializeApp, cert } from 'firebase-admin/app';
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

const auth = getAuth();

async function runCleanup() {
  const adminUidToKeep = process.argv[2];

  if (!adminUidToKeep) {
    console.error("ERROR: Debes proporcionar el UID del administrador a conservar.");
    console.error("Uso: npx tsx scripts/cleanup_auth_except_admin.ts <UID_ADMIN_A_CONSERVAR>");
    process.exit(1);
  }

  console.log(`Verificando UID a conservar: ${adminUidToKeep}`);
  
  try {
    const adminUser = await auth.getUser(adminUidToKeep);
    console.log(`✅ Admin verificado: ${adminUser.email} (UID: ${adminUser.uid})`);
  } catch (e) {
    console.error(`ERROR: El UID ${adminUidToKeep} no existe en Firebase Auth.`);
    process.exit(1);
  }

  console.log("Iniciando recolección de usuarios a eliminar...");
  
  let allUsers: any[] = [];
  let pageToken;

  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`Total de usuarios en Auth: ${allUsers.length}`);

  const uidsToDelete: string[] = [];

  for (const user of allUsers) {
    if (user.uid === adminUidToKeep) {
      console.log(`[SALTANDO] Administrador a conservar: ${user.email} (${user.uid})`);
      continue;
    }

    const isAuthAdmin = user.customClaims?.admin === true || user.customClaims?.superadmin === true;
    
    if (isAuthAdmin) {
      console.log(`[ADVERTENCIA] El usuario ${user.email} (${user.uid}) tiene customClaims de admin pero no es el UID especificado.`);
      console.log(`Se requiere borrarlo manualmente por seguridad.`);
      continue;
    }

    uidsToDelete.push(user.uid);
  }

  console.log(`\nUsuarios a eliminar (sin contar admin ni otros con claims): ${uidsToDelete.length}`);
  
  if (uidsToDelete.length === 0) {
    console.log("No hay usuarios para eliminar.");
    return;
  }

  console.log("\nIniciando borrado por lotes seguros...");

  const BATCH_SIZE = 50; // Lote seguro
  let deletedCount = 0;

  for (let i = 0; i < uidsToDelete.length; i += BATCH_SIZE) {
    const batch = uidsToDelete.slice(i, i + BATCH_SIZE);
    
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
       console.error("Error al ejecutar deleteUsers en el lote:", e.message);
    }
  }

  console.log(`\n=== LIMPIEZA FINALIZADA ===`);
  console.log(`Total eliminados: ${deletedCount}`);
  
  // Verificación final
  const listAfter = await auth.listUsers(1000);
  console.log(`Usuarios restantes en Auth: ${listAfter.users.length}`);
}

runCleanup().catch(console.error);
