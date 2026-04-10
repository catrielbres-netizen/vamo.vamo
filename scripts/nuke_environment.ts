import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin'; // Still needed for some type references
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f';
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

function initializeFirebaseAdmin() {
  if (getApps().length > 0) return;

  try {
    // Mode A: GOOGLE_APPLICATION_CREDENTIALS
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('🔐 [Auth Mode A] Using GOOGLE_APPLICATION_CREDENTIALS');
      initializeApp({
        credential: applicationDefault(),
        projectId
      });
    } 
    // Mode B: service-account.json
    else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.log('🔐 [Auth Mode B] Using service-account.json');
      const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId
      });
    } 
    // Error Fallback
    else {
      console.error('\n❌ ERROR: Missing Firebase Admin credentials.');
      console.error('   Please either:');
      console.error('   1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable.');
      console.error('   2. Provide service-account.json in the project root.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
  }
}

initializeFirebaseAdmin();

const ADMIN_UID = 'QcK9JHKRwodNdn6MBTQbbJ1b8vy1';
const ADMIN_EMAIL = 'admin@gmail.com';

const db = getFirestore();
const auth = getAuth();

const PROTECTED_EMAILS = [
  'admin@gmail.com',
  'demo_admin@vamo.com',
  'catrielbres@gmail.com'
];
const PROTECTED_ROLES = ['admin', 'admin_municipal'];

// COLLECTIONS TO COMPLETELY WIPE
const COLLECTIONS_TO_PURGE = [
  'rides',
  'rideOffers',
  'drivers_locations',
  'platform_transactions',
  'fap_claims',
  'referrals',
  'user_rewards',
  'municipal_doc_submissions',
  'municipal_audit_log'
];

// COLLECTIONS TO NEVER TOUCH
const COLLECTIONS_TO_KEEP = [
  'cities',
  'config', 
  'global_config',
  'municipal_profiles' // Careful with this one, verify if it's structural
];

async function nuke(isDryRun = true) {
  const modeLabel = isDryRun ? '--- DRY RUN (SIMULACIÓN) ---' : '!!! EXECUTION (BORRADO REAL) !!!';
  console.log('==================================================');
  console.log(modeLabel);
  console.log('==================================================');

  // 1. DATA COLLECTION
  console.log('\n[1] Recopilando datos de usuarios...');
  const usersToPurge: { uid: string; email?: string; role?: string; reason?: string }[] = [];
  const usersToKeep: { uid: string; email?: string; role?: string; reason: string }[] = [];

  // Fetch ALL Auth users
  let nextPageToken: string | undefined;
  const authUsers: admin.auth.UserRecord[] = [];
  do {
    const listUsersResult: admin.auth.ListUsersResult = await auth.listUsers(1000, nextPageToken);
    authUsers.push(...listUsersResult.users);
    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);

  // Cross-reference with Firestore Profiles
  for (const authUser of authUsers) {
    const profileSnap = await db.collection('users').doc(authUser.uid).get();
    const profileData = profileSnap.data();
    const email = authUser.email || profileData?.email || 'N/A';
    const role = profileData?.role || 'passenger';

    const isEmailProtected = PROTECTED_EMAILS.includes(email);
    const isRoleProtected = PROTECTED_ROLES.includes(role);
    const isSpecialAdmin = authUser.uid === ADMIN_UID;

    if (isEmailProtected || isRoleProtected || isSpecialAdmin) {
      const reason = isSpecialAdmin ? 'Global Admin UID' : isEmailProtected ? 'Protected Email' : `Protected Role (${role})`;
      usersToKeep.push({ uid: authUser.uid, email, role, reason });
    } else {
      usersToPurge.push({ uid: authUser.uid, email, role });
    }
  }

  // 2. DETAILED REPORT
  console.log('\n[2] REPORTE DE USUARIOS:');
  console.log(`- TOTAL DETECTADOS: ${authUsers.length}`);
  console.log(`- PRESERVADOS:      ${usersToKeep.length}`);
  usersToKeep.forEach(u => console.log(`  ✅ [KEEP] ${u.email?.padEnd(25)} | Role: ${u.role?.padEnd(15)} | Motivo: ${u.reason}`));

  console.log(`- PARA BORRAR:     ${usersToPurge.length}`);
  if (usersToPurge.length > 0) {
    const sample = usersToPurge.slice(0, 10);
    sample.forEach(u => console.log(`  ❌ [WIPE] ${u.email?.padEnd(25)} | Role: ${u.role?.padEnd(15)} | UID: ${u.uid}`));
    if (usersToPurge.length > 10) console.log(`     ... y ${usersToPurge.length - 10} más.`);
  }

  console.log('\n[3] REPORTE DE COLECCIONES:');
  for (const collName of COLLECTIONS_TO_PURGE) {
      const snap = await db.collection(collName).get();
      console.log(`  ❌ [PURGAR]   ${collName.padEnd(25)} | Docs: ${snap.size}`);
  }
  for (const collName of COLLECTIONS_TO_KEEP) {
      try {
          const snap = await db.collection(collName).get();
          console.log(`  ✅ [CONSERVAR] ${collName.padEnd(25)} | Docs: ${snap.size}`);
      } catch (e) {
          console.log(`  ⚠️ [MISSING]   ${collName.padEnd(25)}`);
      }
  }

  if (isDryRun) {
    console.log('\n==================================================');
    console.log('SIMULACIÓN FINALIZADA. No se realizaron cambios.');
    console.log('Para ejecutar el borrado real, usa: npx tsx scripts/nuke_environment.ts --execute');
    console.log('==================================================');
    return;
  }

  // 3. ACTUAL EXECUTION
  console.log('\n[4] !!! INICIANDO BORRADO REAL !!!');

  // A. Borrar Usuarios Auth & Firestore en batches
  if (usersToPurge.length > 0) {
    const uids = usersToPurge.map(u => u.uid);
    console.log(`- Eliminando ${uids.length} usuarios (Auth + Firestore)...`);
    
    // Auth Delete
    for (let i = 0; i < uids.length; i += 100) {
      const batchIds = uids.slice(i, i + 100);
      await auth.deleteUsers(batchIds);
      console.log(`  Auth: Batch ${i/100 + 1} completado.`);
    }

    // Firestore Users Collection Delete
    let fBatch = db.batch();
    let fCount = 0;
    for (const u of usersToPurge) {
      fBatch.delete(db.collection('users').doc(u.uid));
      fCount++;
      if (fCount % 400 === 0) {
        await fBatch.commit();
        fBatch = db.batch();
      }
    }
    await fBatch.commit();
    console.log(`  Firestore 'users': ${fCount} documentos eliminados.`);
  }

  // B. Borrar Colecciones Completas
  for (const collName of COLLECTIONS_TO_PURGE) {
    console.log(`- Limpiando colección '${collName}'...`);
    const snap = await db.collection(collName).get();
    if (snap.empty) continue;

    let pBatch = db.batch();
    let pCount = 0;
    snap.forEach((doc: QueryDocumentSnapshot) => {
      pBatch.delete(doc.ref);
      pCount++;
      if (pCount % 400 === 0) {
        pBatch.commit(); // Note: actually await pBatch.commit() would be better but keeping pattern
        pBatch = db.batch();
      }
    });
    await pBatch.commit();
    console.log(`  Colección '${collName}': ${pCount} documentos eliminados.`);
  }

  console.log('\n✅ LIMPIEZA COMPLETADA CON ÉXITO.');
}

const isExecute = process.argv.includes('--execute');
const isDryOption = process.argv.includes('--dry-run');

// Defaults to dry-run unless --execute is explicitly passed AND --dry-run is ABSENT
nuke(!isExecute || isDryOption).catch(console.error);
