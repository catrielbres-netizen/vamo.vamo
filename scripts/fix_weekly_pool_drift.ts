import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO Weekly Pool Drift Fix Tool
 * This script is for manual correction of pool amounts due to legacy drift.
 * Usage: npx tsx scripts/fix_weekly_pool_drift.ts <cityKey> <newValue> [--confirm]
 */

const cityKeyArg = process.argv[2];
const newValueArg = process.argv[3];
const isConfirmed = process.argv.includes('--confirm');

if (!cityKeyArg || !newValueArg) {
    console.log('\n❌ Error: Argumentos faltantes.');
    console.log('Uso: npx tsx scripts/fix_weekly_pool_drift.ts <cityKey> <newValue> [--confirm]');
    console.log('Ejemplo (Preview): npx tsx scripts/fix_weekly_pool_drift.ts rawson 50500');
    console.log('Ejemplo (Confirm): npx tsx scripts/fix_weekly_pool_drift.ts rawson 50500 --confirm\n');
    process.exit(1);
}

const targetValue = parseFloat(newValueArg);
if (isNaN(targetValue)) {
    console.error('❌ Error: El nuevo valor debe ser un número.');
    process.exit(1);
}

// Robust Project ID Detection
let projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
    try {
        const firebasercPath = path.resolve(process.cwd(), '.firebaserc');
        if (fs.existsSync(firebasercPath)) {
            const rc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
            projectId = rc.projects?.default;
        }
    } catch (e) {}
}

if (!projectId) {
    console.error("❌ No se pudo detectar projectId.");
    process.exit(1);
}

if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
}

const db = admin.firestore();

async function fixDrift() {
    console.log('====================================================');
    console.log('🛠️ VamO Pool Drift Sanitizer');
    console.log('====================================================');

    const cityRef = db.doc(`cities/${cityKeyArg}`);
    const citySnap = await cityRef.get();

    if (!citySnap.exists) {
        console.error(`❌ City ${cityKeyArg} not found.`);
        return;
    }

    const cityData = citySnap.data();
    const currentPool = cityData?.rewardsConfig?.weeklyPoolAmount;

    console.log(`📍 City: ${cityKeyArg.toUpperCase()}`);
    console.log(`📉 Current Pool: $${currentPool?.toLocaleString() || 'undefined'}`);
    console.log(`📈 Target Pool:  $${targetValue.toLocaleString()}`);
    console.log('----------------------------------------------------');

    if (!isConfirmed) {
        console.log('🔍 MODO PREVIEW: No se realizaron cambios.');
        console.log('Para aplicar el cambio, agregá --confirm al final del comando.');
        return;
    }

    console.log('🚀 Aplicando cambio en Firestore...');
    
    await cityRef.update({
        'rewardsConfig.weeklyPoolAmount': targetValue,
        'rewardsConfig.lastManualCorrectionAt': admin.firestore.FieldValue.serverTimestamp(),
        'rewardsConfig.previousValueBeforeCorrection': currentPool || 0
    });

    console.log('✅ ÉXITO: Pozo actualizado correctamente.');
    console.log(`\n👉 Verificá el resultado con el script de auditoría:`);
    console.log(`npx tsx scripts/audit_weekly_pool.ts ${cityKeyArg}`);
    console.log('====================================================\n');
}

fixDrift().catch(console.error);
