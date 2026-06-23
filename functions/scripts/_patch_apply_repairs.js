const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../scripts/audit_and_repair_shared_stuck_production.ts');
let content = fs.readFileSync(file, 'utf8');

// Find the MÓDULO 8 section and replace it entirely
const startMarker = '// ─── MÓDULO 8: Aplicar reparaciones (solo si APPLY=true) ─────────────────────';
const endMarker = '// ─── REPORTE FINAL';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('ERROR: markers not found. startIdx=' + startIdx + ' endIdx=' + endIdx);
    process.exit(1);
}

console.log('Found MÓDULO 8 at index ' + startIdx + ', REPORTE FINAL at ' + endIdx);

const newApplyRepairs = `// ─── MÓDULO 8: Aplicar reparaciones (solo si APPLY=true) ─────────────────────
async function applyRepairs(): Promise<void> {
    if (DRY_RUN) return;

    logSection('APLICANDO REPARACIONES — MODIFICANDO FIRESTORE');

    log('  Iniciando en 5 segundos... (Ctrl+C para cancelar)');
    await new Promise(r => setTimeout(r, 5000));

    // Deduplicar: si hay múltiples repairs para el mismo doc, mergear updates
    const mergedRepairs = new Map<string, {
        collection: string;
        docId: string;
        update: Record<string, any>;
        reasons: string[];
    }>();

    for (const repair of repairs) {
        const key = repair.collection + '/' + repair.docId;
        if (mergedRepairs.has(key)) {
            const existing = mergedRepairs.get(key)!;
            Object.assign(existing.update, repair.update);
            existing.reasons.push(repair.reason);
        } else {
            mergedRepairs.set(key, {
                collection: repair.collection,
                docId: repair.docId,
                update: Object.assign({}, repair.update),
                reasons: [repair.reason]
            });
        }
    }

    log('  Reparaciones totales:  ' + repairs.length);
    log('  Documentos únicos:     ' + mergedRepairs.size);
    log('  (mergeados/dedup:      ' + (repairs.length - mergedRepairs.size) + ')');

    const MAX_BATCH = 490;
    let batch = db.batch();
    let batchCount = 0;
    let totalApplied = 0;
    const appliedLog: string[] = [];

    for (const [key, repair] of mergedRepairs) {
        const ref = db.doc(key);
        batch.update(ref, repair.update);
        batchCount++;
        totalApplied++;

        const reasonSummary = repair.reasons.slice(0, 2).join(' | ');
        log('  🔧 [' + repair.collection + '] ' + repair.docId + ' — ' + reasonSummary);
        appliedLog.push(key + ': ' + reasonSummary);

        if (batchCount >= MAX_BATCH) {
            await batch.commit();
            log('  ✅ Batch parcial commiteado (' + batchCount + ' ops)');
            batch = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        log('  ✅ Batch final commiteado (' + batchCount + ' ops)');
    }

    const applyLogDir = path.resolve(process.cwd(), '../backups/shared-repair');
    fs.mkdirSync(applyLogDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const applyLogPath = path.join(applyLogDir, 'apply_log_' + ts + '.json');
    fs.writeFileSync(applyLogPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalApplied,
        appliedLog
    }, null, 2));

    log('  ✅ ' + totalApplied + ' documentos modificados en Firestore.');
    log('  📋 Log de apply guardado: ' + applyLogPath);
}

`;

const before = content.slice(0, startIdx);
const after = content.slice(endIdx);
const newContent = before + newApplyRepairs + after;

fs.writeFileSync(file, newContent, 'utf8');
console.log('SUCCESS: applyRepairs replaced. New file length: ' + newContent.length + ' bytes');
