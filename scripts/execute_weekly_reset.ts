import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * VamO Weekly Pool Reset Executor (ADMIN ONLY)
 * This script resets the pool and driver points for the next week.
 * ⚠️ WARNING: Points and Pool will be cleared if --confirm is present.
 */

const cityKeyArg = process.argv[2];
const isConfirmed = process.argv.includes('--confirm');

if (!cityKeyArg) {
    console.log('\n❌ Error: cityKey es obligatorio.');
    console.log('Uso (Preview): npx tsx scripts/execute_weekly_reset.ts <cityKey>');
    console.log('Uso (RESET REAL): npx tsx scripts/execute_weekly_reset.ts <cityKey> --confirm\n');
    process.exit(1);
}

// 1. Project Detection
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

function getWeekId(): string {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value || '0';
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const argDate = new Date(parseInt(y), m, day);
    const firstDayOfYear = new Date(parseInt(y), 0, 1);
    const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}

async function executeReset() {
    const weekId = getWeekId();
    console.log('====================================================');
    console.log('♻️ VamO Weekly Pool Reset - MODO ADMINISTRADOR');
    console.log('====================================================');
    console.log(`📍 Ciudad: ${cityKeyArg.toUpperCase()}`);
    console.log(`📅 Semana: ${weekId}`);

    // 1. Safety Check: Verify payout exists
    const settlementSnap = await db.collection('weekly_pool_history')
        .where('cityKey', '==', cityKeyArg)
        .where('weekId', '==', weekId)
        .where('isDryRun', '==', false)
        .limit(1)
        .get();

    if (settlementSnap.empty) {
        console.error('❌ ERROR: No se encontró el Payout real (Settlement) en el historial.');
        console.error('Debes ejecutar primero el pago real con execute_weekly_payout.ts');
        process.exit(1);
    }

    const historyDoc = settlementSnap.docs[0];
    const historyData = historyDoc.data();
    console.log('✅ Payout real detectado.');

    if (historyData.resetCompleted) {
        console.log('ℹ️ El reseteo ya fue completado para esta semana.');
        process.exit(0);
    }

    // 2. Preview
    const driversToResetSnap = await db.collection('driver_points')
        .where('weeklyPoints', '>', 0)
        .get();
    
    console.log(`\n📋 RESUMEN DE RESETEO:`);
    console.log(`- Pozo de ${cityKeyArg}: Volverá a $50.000 (actual: $${(await db.doc(`cities/${cityKeyArg}`).get()).data()?.rewardsConfig?.weeklyPoolAmount})`);
    console.log(`- Conductores a resetear (puntos > 0): ${driversToResetSnap.size}`);

    if (!isConfirmed) {
        console.log('\n🔍 MODO PREVIEW: No se realizó ningún cambio.');
        console.log('⚠️ Para ejecutar el RESET REAL, agregá --confirm al final.');
        return;
    }

    // 3. Execution (Real Reset)
    console.log('\n🚀 INICIANDO RESETEO REAL...');
    const now = admin.firestore.Timestamp.now();

    // Reset Drivers
    const resetSet = new Set<string>();
    driversToResetSnap.docs.forEach(d => resetSet.add(d.id));
    
    const resetArray = Array.from(resetSet);
    for (let i = 0; i < resetArray.length; i += 400) {
        const batch = db.batch();
        const chunk = resetArray.slice(i, i + 400);
        chunk.forEach(id => {
            batch.update(db.doc(`driver_points/${id}`), {
                weeklyPoints: 0,
                weeklyTripsCount: 0,
                lastResetAt: now,
                previousWeekId: weekId
            });
            batch.update(db.doc(`users/${id}`), {
                weeklyPoints: 0,
                updatedAt: now
            });
        });
        await batch.commit();
        console.log(`✅ Batch reseteo (${chunk.length} conductores) completado.`);
    }

    // Reset City & History
    const finalBatch = db.batch();
    finalBatch.update(db.doc(`cities/${cityKeyArg}`), {
        'rewardsConfig.weeklyPoolAmount': 50000,
        'rewardsConfig.lastResetAt': now
    });
    finalBatch.update(historyDoc.ref, {
        resetCompleted: true,
        resetAt: now
    });
    await finalBatch.commit();

    console.log('\n✅ RESETEO FINALIZADO CON ÉXITO.');
    console.log('====================================================\n');
}

executeReset().catch(console.error);
