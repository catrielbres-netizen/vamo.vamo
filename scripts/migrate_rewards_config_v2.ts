import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO — Migración Firestore: rewardsConfig v2
 * Actualiza cities/{cityKey}/rewardsConfig con los valores del Pozo Semanal v2.
 *
 * USO (preview):    npx tsx scripts/migrate_rewards_config_v2.ts <cityKey>
 * USO (aplicar):    npx tsx scripts/migrate_rewards_config_v2.ts <cityKey> --confirm
 * USO (todas):      npx tsx scripts/migrate_rewards_config_v2.ts --all --confirm
 */

const args        = process.argv.slice(2);
const isConfirmed = args.includes('--confirm');
const isAll       = args.includes('--all');
const cityKeyArg  = args.find(a => !a.startsWith('--'));

if (!cityKeyArg && !isAll) {
    console.log('\n❌ Uso: npx tsx scripts/migrate_rewards_config_v2.ts <cityKey> [--confirm]');
    console.log('       npx tsx scripts/migrate_rewards_config_v2.ts --all [--confirm]\n');
    process.exit(1);
}

// ── Detectar projectId ────────────────────────────────────────────────────────
let projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
    try {
        const rc = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '.firebaserc'), 'utf8'));
        projectId = rc.projects?.default;
    } catch {}
}
if (!projectId) {
    console.error('❌ No se pudo detectar projectId.');
    process.exit(1);
}

if (admin.apps.length === 0) admin.initializeApp({ projectId });
const db = admin.firestore();

// ── Valores V2 (fuente de verdad) ─────────────────────────────────────────────
const V2_REWARDS_CONFIG = {
    weeklyPoolBaseAmount:            20000,   // Base inicial del pozo
    weeklyPoolContributionPerRide:   100,     // Incremento por viaje válido
    maxWeeklyPoolAmount:             600000,  // Tope semanal
    weeklyPoolTopN:                  30,      // Top 30 conductores
    weeklyPoolMinTrips:              1,       // 1 viaje = califica
    weeklyPoolVersion:               'v2',
};

async function migrateCityConfig(cityKey: string, dryRun: boolean) {
    const ref  = db.doc(`cities/${cityKey}`);
    const snap = await ref.get();

    if (!snap.exists) {
        console.log(`  ⚠️  Ciudad "${cityKey}" no encontrada en Firestore.`);
        return;
    }

    const current = snap.data()?.rewardsConfig || {};
    console.log(`\n  📍 Ciudad: ${cityKey.toUpperCase()}`);
    console.log('  ── Valores actuales ──────────────────────────────────────');
    console.log(`    weeklyPoolAmount:              $${(current.weeklyPoolAmount || 0).toLocaleString()}`);
    console.log(`    weeklyPoolBaseAmount:          $${(current.weeklyPoolBaseAmount || '?').toString()}`);
    console.log(`    weeklyPoolContributionPerRide: $${(current.weeklyPoolContributionPerRide || '?').toString()}`);
    console.log(`    maxWeeklyPoolAmount:           $${(current.maxWeeklyPoolAmount || '?').toString()}`);
    console.log(`    weeklyPoolTopN:                ${(current.weeklyPoolTopN || '?').toString()}`);
    console.log(`    weeklyPoolVersion:             ${current.weeklyPoolVersion || 'v1 (sin versión)'}`);

    console.log('  ── Valores a aplicar ─────────────────────────────────────');
    Object.entries(V2_REWARDS_CONFIG).forEach(([k, v]) => {
        const old = current[k];
        const changed = old !== v;
        console.log(`    ${k}: ${old ?? '(sin valor)'} → ${v}${changed ? ' ⚡' : ' (sin cambio)'}`);
    });

    if (dryRun) {
        console.log('  🔍 MODO PREVIEW — no se aplicaron cambios.');
        return;
    }

    // Aplica solo los campos de V2 sin borrar los demás
    await ref.update({
        'rewardsConfig.weeklyPoolBaseAmount':            V2_REWARDS_CONFIG.weeklyPoolBaseAmount,
        'rewardsConfig.weeklyPoolContributionPerRide':   V2_REWARDS_CONFIG.weeklyPoolContributionPerRide,
        'rewardsConfig.maxWeeklyPoolAmount':             V2_REWARDS_CONFIG.maxWeeklyPoolAmount,
        'rewardsConfig.weeklyPoolTopN':                  V2_REWARDS_CONFIG.weeklyPoolTopN,
        'rewardsConfig.weeklyPoolMinTrips':              V2_REWARDS_CONFIG.weeklyPoolMinTrips,
        'rewardsConfig.weeklyPoolVersion':               V2_REWARDS_CONFIG.weeklyPoolVersion,
        'rewardsConfig.migratedToV2At':                 admin.firestore.Timestamp.now(),
    });

    console.log(`  ✅ "${cityKey}" actualizado a v2.`);
}

async function main() {
    console.log('══════════════════════════════════════════════════════');
    console.log('  VamO — Migración rewardsConfig → Pozo Semanal v2');
    console.log(`  Modo: ${isConfirmed ? '⚡ APLICAR CAMBIOS' : '🔍 PREVIEW'}`);
    console.log('══════════════════════════════════════════════════════');

    if (isAll) {
        const citiesSnap = await db.collection('cities').get();
        if (citiesSnap.empty) {
            console.log('⚠️  No se encontraron ciudades en Firestore.');
            return;
        }
        for (const doc of citiesSnap.docs) {
            await migrateCityConfig(doc.id, !isConfirmed);
        }
    } else if (cityKeyArg) {
        await migrateCityConfig(cityKeyArg, !isConfirmed);
    }

    console.log('\n══════════════════════════════════════════════════════');
    if (!isConfirmed) {
        console.log('  Para aplicar los cambios, agregá --confirm al final.');
    } else {
        console.log('  ✅ Migración completada.');
    }
    console.log('══════════════════════════════════════════════════════\n');
}

main().catch(console.error);
