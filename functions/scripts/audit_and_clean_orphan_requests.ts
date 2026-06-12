import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

const DRY_RUN = process.env.APPLY !== 'true';

async function main() {
    console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  Limpieza de Requests Huérfanos / Residuales`);
    console.log(`  Modo: ${DRY_RUN ? '🔍 DRY_RUN (sin cambios)' : '⚠️  APPLY (MODIFICANDO FIRESTORE)'}`);
    console.log(`════════════════════════════════════════════════════════════════════════════════\n`);

    const activeStatuses = ['pending_group', 'forming', 'grouped', 'confirmed', 'assigned', 'driver_assigned', 'pickup_pending', 'picked_up'];
    const snap = await db.collection('shared_ride_requests')
        .where('status', 'in', activeStatuses)
        .get();

    const repairs = [];
    const backup = [];

    for (const doc of snap.docs) {
        const r: any = doc.data();
        let groupStatus = 'NO_GROUP';
        if (r.groupId) {
            const gSnap = await db.doc(`shared_ride_groups/${r.groupId}`).get();
            if (gSnap.exists) groupStatus = gSnap.data()?.status || 'NO_STATUS';
        }

        // Casos terminales extendidos (incluyendo el typo cencelled)
        const terminalGroupStatuses = ['cancelled', 'expired', 'completed', 'cancelled_by_admin', 'cencelled'];
        const isOrphan = !r.groupId;
        const groupIsTerminal = r.groupId && terminalGroupStatuses.includes(groupStatus);
        
        const createdAt = r.createdAt?._seconds ? r.createdAt._seconds * 1000 : null;
        const ageMinutes = createdAt ? Math.round((Date.now() - createdAt) / 60000) : -1;
        const isOld = ageMinutes > 60;

        if (isOrphan || groupIsTerminal || isOld) {
            backup.push({ id: doc.id, ...r });

            const reason = isOrphan ? 'orphan_no_group' : (groupIsTerminal ? `group_${groupStatus}` : 'stale_more_than_60min');
            const targetStatus = groupIsTerminal ? 'cancelled' : 'expired';

            repairs.push({
                docId: doc.id,
                update: {
                    status: targetStatus,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ...(targetStatus === 'cancelled' ? {
                        cancelledBy: 'admin_script',
                        cancelReason: reason,
                        cancelledAt: admin.firestore.FieldValue.serverTimestamp()
                    } : {
                        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
                        expiredReason: reason
                    })
                },
                reason,
                ageMinutes,
                passengerId: r.passengerId,
                groupId: r.groupId
            });
        }
    }

    console.log(`  Requests huérfanos/stale detectados: ${repairs.length}`);

    if (DRY_RUN) {
        for (const r of repairs) {
            console.log(`  🟡 [DRY_RUN] shared_ride_requests/${r.docId} -> marcar como ${r.update.status} (motivo: ${r.reason}, age: ${r.ageMinutes}m)`);
        }
        console.log(`\n  ✅ DRY_RUN completado. No se modificó Firestore.`);
        console.log(`  Para aplicar: APPLY=true npx ts-node scripts/audit_and_clean_orphan_requests.ts`);
        process.exit(0);
    }

    // APPLY
    console.log(`\n  Aplicando ${repairs.length} reparaciones en batch...`);
    const batch = db.batch();
    for (const r of repairs) {
        batch.update(db.doc(`shared_ride_requests/${r.docId}`), r.update);
        console.log(`  ✅ Update agregado para ${r.docId}`);
    }
    
    if (repairs.length > 0) {
        await batch.commit();
        console.log(`\n  ✅ Batch commiteado exitosamente.`);
    }
}

main().catch(console.error);
