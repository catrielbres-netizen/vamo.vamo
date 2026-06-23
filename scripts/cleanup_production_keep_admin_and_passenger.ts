import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

// Constantes de configuración
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Por defecto es true
const ADMIN_EMAIL = 'admin@gmail.com';
const PASSENGER_EMAIL = 'cisnerosvictoria56@gmail.com';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();
const auth = getAuth();

// Colecciones que se vaciarán completamente
const COLLECTIONS_TO_WIPE = [
  'rides',
  'scheduled_rides',
  'ride_offers',
  'drivers_locations',
  'wallets',
  'ledger_events',
  'settlements',
  'taxi_stands',
  'municipal_onboarding_requests',
  'withdrawals',
  'driver_documents',
  'driver_vehicles'
];

async function deleteCollection(collectionPath: string, batchSize: number) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise<number>((resolve, reject) => {
    let totalDeleted = 0;
    deleteQueryBatch(query, resolve, reject).catch(reject);

    async function deleteQueryBatch(query: any, resolve: any, reject: any) {
      try {
        const snapshot = await query.get();
        if (snapshot.size === 0) {
          resolve(totalDeleted);
          return;
        }

        if (DRY_RUN) {
          totalDeleted += snapshot.size;
          // In dry run we just count and stop after one batch to avoid infinite loop since we don't delete
          const allDocs = await collectionRef.get();
          resolve(allDocs.size);
          return;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc: any) => {
          batch.delete(doc.ref);
        });
        await batch.commit();

        totalDeleted += snapshot.size;
        process.nextTick(() => {
          deleteQueryBatch(query, resolve, reject);
        });
      } catch (error) {
        reject(error);
      }
    }
  });
}

async function runCleanup() {
  console.log(`\n=== INICIANDO LIMPIEZA TOTAL (${DRY_RUN ? 'MODO DRY-RUN' : 'MODO REAL'}) ===`);
  console.log(`Conservando estrictamente: ${ADMIN_EMAIL} y ${PASSENGER_EMAIL}\n`);

  // 1. Obtener todos los usuarios de Auth
  let allUsers: any[] = [];
  let pageToken;
  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`Usuarios totales en Auth actualmente: ${allUsers.length}`);

  // 2. Identificar UIDs a conservar
  const adminUser = allUsers.find(u => u.email === ADMIN_EMAIL);
  const passengerUser = allUsers.find(u => u.email === PASSENGER_EMAIL);

  if (!adminUser) {
    console.error(`ERROR CRÍTICO: No se encontró al usuario admin (${ADMIN_EMAIL}) en Auth.`);
    return;
  }
  if (!passengerUser) {
    console.error(`ERROR CRÍTICO: No se encontró a la pasajera (${PASSENGER_EMAIL}) en Auth.`);
    return;
  }

  const whitelistUids = [adminUser.uid, passengerUser.uid];
  const whitelistEmails = [ADMIN_EMAIL, PASSENGER_EMAIL];
  console.log(`UIDs en Whitelist:`);
  console.log(` - Admin: ${adminUser.uid}`);
  console.log(` - Pasajera: ${passengerUser.uid}\n`);

  // 3. Separar usuarios a eliminar
  const authUsersToDelete = allUsers.filter(u => !whitelistUids.includes(u.uid));
  const authUidsToDelete = authUsersToDelete.map(u => u.uid);

  console.log(`[AUTH] Usuarios a eliminar de Auth: ${authUidsToDelete.length}`);

  // 4. Obtener todos los usuarios de Firestore
  const allFirestoreUsersSnap = await db.collection('users').get();
  console.log(`[FIRESTORE] Usuarios totales en colección 'users': ${allFirestoreUsersSnap.size}`);

  const firestoreDocsToDelete: any[] = [];
  allFirestoreUsersSnap.forEach(doc => {
    if (!whitelistUids.includes(doc.id)) {
      firestoreDocsToDelete.push(doc);
    }
  });

  console.log(`[FIRESTORE] Documentos 'users' a eliminar: ${firestoreDocsToDelete.length}`);

  // 5. Mostrar resumen pre-limpieza
  console.log(`\n=== RESUMEN PREVIO A LA ELIMINACIÓN ===`);
  console.log(` Auth a borrar: ${authUidsToDelete.length}`);
  console.log(` Firestore 'users' a borrar: ${firestoreDocsToDelete.length}`);
  console.log(` Colecciones operativas a vaciar: ${COLLECTIONS_TO_WIPE.join(', ')}`);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] No se eliminará ningún dato real. Simulando eliminación de colecciones...`);
    for (const col of COLLECTIONS_TO_WIPE) {
      const deletedCount = await deleteCollection(col, 500);
      console.log(`[DRY RUN] Se eliminarían ${deletedCount} documentos de la colección '${col}'.`);
    }
    console.log(`\n[DRY RUN] Fin de la simulación. Para ejecutar real usar: DRY_RUN=false npx ts-node scripts/cleanup_production_keep_admin_and_passenger.ts`);
    return;
  }

  // 6. EJECUTAR ELIMINACIÓN REAL
  console.log(`\n*** INICIANDO ELIMINACIÓN REAL EN 5 SEGUNDOS... ***`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Eliminar Auth
  console.log(`\nEliminando ${authUidsToDelete.length} usuarios de Auth...`);
  const BATCH_SIZE_AUTH = 50;
  let authDeletedCount = 0;
  for (let i = 0; i < authUidsToDelete.length; i += BATCH_SIZE_AUTH) {
    const batch = authUidsToDelete.slice(i, i + BATCH_SIZE_AUTH);
    try {
      const deleteResult = await auth.deleteUsers(batch);
      authDeletedCount += deleteResult.successCount;
      process.stdout.write(`.`);
    } catch (e: any) {
      console.error(`\nError borrando lote Auth:`, e.message);
    }
  }
  console.log(`\nAuth: ${authDeletedCount} eliminados.`);

  // Eliminar Firestore 'users'
  console.log(`\nEliminando ${firestoreDocsToDelete.length} documentos de 'users'...`);
  const BATCH_SIZE_FS = 400;
  let fsDeletedCount = 0;
  for (let i = 0; i < firestoreDocsToDelete.length; i += BATCH_SIZE_FS) {
    const batch = db.batch();
    const batchDocs = firestoreDocsToDelete.slice(i, i + BATCH_SIZE_FS);
    batchDocs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    fsDeletedCount += batchDocs.length;
    process.stdout.write(`.`);
  }
  console.log(`\nFirestore 'users': ${fsDeletedCount} eliminados.`);

  // Vaciar colecciones
  for (const col of COLLECTIONS_TO_WIPE) {
    console.log(`Vaciando colección '${col}'...`);
    const count = await deleteCollection(col, 400);
    console.log(` -> Eliminados ${count} documentos de '${col}'.`);
  }

  // Verificar admin
  const adminDoc = await db.collection('users').doc(adminUser.uid).get();
  if (adminDoc.exists) {
    console.log(`\n[OK] Admin existe y está a salvo. Rol: ${adminDoc.data()?.role}`);
  } else {
    console.log(`\n[ERROR] Admin doc no existe!`);
  }

  const passengerDoc = await db.collection('users').doc(passengerUser.uid).get();
  if (passengerDoc.exists) {
    console.log(`[OK] Pasajera existe y está a salvo.`);
  } else {
    console.log(`[ERROR] Pasajera doc no existe!`);
  }

  console.log(`\n=== LIMPIEZA FINALIZADA COMPLETAMENTE ===`);
}

runCleanup().catch(console.error);
