const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN DE LÍMITES ---
const BATCH_SIZE = 400;
const PAUSE_EVERY_N_USERS = 10;
const USER_PAUSE_MS = 200;
const BATCH_PAUSE_MS = 3000;
const FAILED_FILE = './scripts/failed_uids.json';
const SUMMARY_FILE = './scripts/backfill_summary.json';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const VALIDATE_ONLY = process.env.VALIDATE_ONLY === 'true';
const TARGET_UID = process.env.TARGET_UID || null;
const VALID_ROLES = ['admin', 'admin_municipal', 'traffic_municipal', 'driver', 'passenger'];

// --- INICIALIZACIÓN ---
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
    console.error("❌ Error: GOOGLE_APPLICATION_CREDENTIALS no está definida.");
    process.exit(1);
}

const serviceAccount = require(path.resolve(credPath));
if (serviceAccount.private_key && serviceAccount.private_key.includes("\\n")) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

const isValidCityKey = (ck) => typeof ck === 'string' && /^[a-z0-9_-]{3,25}$/.test(ck);

// --- ESTADÍSTICAS ---
const stats = { 
    total: 0, 
    matched: 0, 
    updated: 0, 
    failed: 0, 
    roles: {}, 
    cities: {}, 
    nullClaims: 0,
    reasons: {}
};
const failedUids = [];

async function processUser(doc) {
  const uid = doc.id;
  const up = uid.substring(0, 6);
  const data = doc.data();
  
  let claims = null;
  let reason = "ok";
  let v = typeof data.claimsVersion === 'number' ? data.claimsVersion : 1;

  // Lógica de Identidad (Sincronizada con users.ts)
  if (data.isSuspended === true || data.disabled === true) {
    reason = "suspended_or_disabled";
  } else if (!VALID_ROLES.includes(data.role)) {
    reason = "invalid_role";
  } else if (['admin_municipal', 'traffic_municipal', 'driver'].includes(data.role)) {
    if (!data.cityKey || !isValidCityKey(data.cityKey)) {
      reason = "missing_or_invalid_cityKey";
    } else {
      claims = { r: data.role, ck: data.cityKey, v };
    }
  } else {
    claims = { r: data.role, ck: null, v };
  }

  // Acumular estadísticas
  stats.total++;
  stats.roles[data.role] = (stats.roles[data.role] || 0) + 1;
  stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
  if (claims && claims.ck) stats.cities[claims.ck] = (stats.cities[claims.ck] || 0) + 1;
  if (!claims) stats.nullClaims++;

  try {
    const userAuth = await auth.getUser(uid);
    const current = JSON.stringify(userAuth.customClaims || {});
    const expected = JSON.stringify(claims || {});

    if (current === expected) {
      stats.matched++;
    } else if (!DRY_RUN && !VALIDATE_ONLY) {
      await auth.setCustomUserClaims(uid, claims);
      stats.updated++;
    }

    if (TARGET_UID) {
        console.log(`[${DRY_RUN ? 'DRY' : 'LIVE'}] ${up}... | Role: ${data.role} | Status: ${reason}`);
        console.log(`  Expected: ${expected}`);
        console.log(`  Current:  ${current}`);
        console.log(`  Match:    ${current === expected ? '✅' : '❌'}`);
    }
    return true;
  } catch (e) {
    stats.failed++;
    failedUids.push(uid);
    return false;
  }
}

async function runBulk() {
  console.log(`🚀 Iniciando Backfill Masivo (${DRY_RUN ? 'SIMULACIÓN' : 'LIVE'})`);
  let lastUid = null;
  let hasMore = true;

  while (hasMore) {
    let query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH_SIZE);
    if (lastUid) query = query.startAfter(lastUid);
    
    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (let i = 0; i < snapshot.docs.length; i++) {
      await processUser(snapshot.docs[i]);
      if (stats.total % PAUSE_EVERY_N_USERS === 0) {
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, USER_PAUSE_MS));
      }
    }

    lastUid = snapshot.docs[snapshot.docs.length - 1].id;
    console.log(`\n📦 Lote procesado. Total parcial: ${stats.total}`);
    if (snapshot.size < BATCH_SIZE) hasMore = false;
    else await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
  }

  // Guardar resultados
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(stats, null, 2));
  if (failedUids.length > 0) fs.writeFileSync(FAILED_FILE, JSON.stringify(failedUids, null, 2));

  console.log("\n\n🏁 RESUMEN FINAL:");
  console.log("--- Roles ---");
  console.table(stats.roles);
  console.log("--- Motivos de Claims NULL ---");
  console.table(stats.reasons);
  console.log(`\nTotal Usuarios: ${stats.total}`);
  console.log(`Ya sincronizados (Matched): ${stats.matched}`);
  console.log(`Actualizados (Live): ${stats.updated}`);
  console.log(`Usuarios con Claims NULL: ${stats.nullClaims}`);
  console.log(`Errores: ${stats.failed}`);
}

async function run() {
  if (TARGET_UID) {
    const doc = await db.collection('users').doc(TARGET_UID).get();
    if (!doc.exists) { console.error("Error: Usuario no en Firestore"); process.exit(1); }
    await processUser(doc);
  } else {
    await runBulk();
  }
}

run().catch(console.error);
