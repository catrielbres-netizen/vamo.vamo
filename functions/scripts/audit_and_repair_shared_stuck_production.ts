/**
 * ============================================================
 * VamO Compartido — Script de Auditoría y Reparación Controlada
 * ============================================================
 *
 * MODOS:
 *   DRY_RUN (por defecto): solo inspecciona y reporta, sin modificar Firestore.
 *   APPLY:   requiere DRY_RUN=false + APPLY=true + CONFIRM_SHARED_REPAIR=YES
 *
 * CÓMO EJECUTAR:
 *
 *   Dry-run (seguro, sin cambios):
 *     npx ts-node scripts/audit_and_repair_shared_stuck_production.ts
 *
 *   Con backup local simulado:
 *     npx ts-node scripts/audit_and_repair_shared_stuck_production.ts --backup
 *
 *   Aplicar cambios reales (SOLO cuando el dry-run esté aprobado):
 *     APPLY=true CONFIRM_SHARED_REPAIR=YES npx ts-node scripts/audit_and_repair_shared_stuck_production.ts
 *
 * ⚠️  NUNCA ejecutar con APPLY=true sin revisar el output del dry-run primero.
 * ⚠️  Esta etapa NO toca wallets, ledger, pagos ni settlement.
 * ============================================================
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// ─── Inicialización Firebase ──────────────────────────────────────────────────
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

// ─── Control de modo ─────────────────────────────────────────────────────────
const DRY_RUN   = process.env.APPLY !== 'true';
const APPLY     = process.env.APPLY === 'true';
const CONFIRMED = process.env.CONFIRM_SHARED_REPAIR === 'YES';
const BACKUP    = process.argv.includes('--backup');

if (APPLY && !CONFIRMED) {
    console.error('\n❌ APPLY=true requiere también CONFIRM_SHARED_REPAIR=YES');
    console.error('   Ejecutá: APPLY=true CONFIRM_SHARED_REPAIR=YES npx ts-node scripts/audit_and_repair_shared_stuck_production.ts');
    process.exit(1);
}

if (APPLY && CONFIRMED) {
    console.warn('\n⚠️  ⚠️  ⚠️  MODO APPLY ACTIVADO — SE MODIFICARÁ FIRESTORE ⚠️  ⚠️  ⚠️');
    console.warn('Tenés 5 segundos para cancelar con Ctrl+C...\n');
}

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface AuditIssue {
    collection: string;
    docId: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    problem: string;
    currentState: Record<string, any>;
    proposedAction: string;
    risk: string;
    requiresManualDecision: boolean;
    linkedDocs?: string[];
}

interface RepairAction {
    collection: string;
    docId: string;
    update: Record<string, any>;
    reason: string;
}

const issues: AuditIssue[] = [];
const repairs: RepairAction[] = [];
const backupData: Record<string, any[]> = {
    shared_ride_groups: [],
    shared_ride_requests: [],
    rides: [],
    users: [],
};

// ─── Helpers de output ────────────────────────────────────────────────────────
const SEP = '─'.repeat(80);
const DSEP = '═'.repeat(80);

function log(msg: string) { console.log(msg); }
function logSection(title: string) {
    console.log(`\n${DSEP}`);
    console.log(`  ${title}`);
    console.log(DSEP);
}
function logIssue(issue: AuditIssue) {
    const icon = issue.severity === 'CRITICAL' ? '🔴' :
                 issue.severity === 'HIGH'     ? '🟠' :
                 issue.severity === 'MEDIUM'   ? '🟡' : '🔵';
    console.log(`\n  ${icon} [${issue.severity}] ${issue.collection}/${issue.docId}`);
    console.log(`     Problema  : ${issue.problem}`);
    console.log(`     Acción    : ${issue.proposedAction}`);
    console.log(`     Riesgo    : ${issue.risk}`);
    if (issue.requiresManualDecision) {
        console.log(`     ⚠️  REQUIERE DECISIÓN MANUAL`);
    }
    if (issue.linkedDocs && issue.linkedDocs.length > 0) {
        console.log(`     Docs rel. : ${issue.linkedDocs.join(', ')}`);
    }
}

function addIssue(issue: AuditIssue) {
    issues.push(issue);
    logIssue(issue);
}

function addRepair(action: RepairAction) {
    repairs.push(action);
}

// ─── MÓDULO 1: Auditar shared_ride_groups ────────────────────────────────────
async function auditGroups(): Promise<void> {
    logSection('MÓDULO 1 — shared_ride_groups');

    const activeStatuses = ['forming', 'pending', 'pending_passenger_confirmation',
        'ready_for_driver', 'ready_for_driver_dispatch', 'searching_driver', 'driver_assigned', 'in_progress'];

    // NOTE: No orderBy — evita requerir índice compuesto (status + createdAt)
    const snap = await db.collection('shared_ride_groups')
        .where('status', 'in', activeStatuses)
        .limit(100)
        .get();

    log(`  Grupos activos encontrados: ${snap.size}`);

    for (const doc of snap.docs) {
        const g: any = { id: doc.id, ...doc.data() };
        if (BACKUP) backupData.shared_ride_groups.push(g);

        const groupRef = `shared_ride_groups/${doc.id}`;
        const linkedDocs: string[] = [];

        // ── 1a. passengers[] sin requestId ──────────────────────────────────
        const passengersWithoutReqId = (g.passengers || []).filter((p: any) => !p.requestId);
        if (passengersWithoutReqId.length > 0) {
            const paxList = passengersWithoutReqId.map((p: any) => p.passengerId || 'UNKNOWN').join(', ');
            addIssue({
                collection: 'shared_ride_groups',
                docId: doc.id,
                severity: 'CRITICAL',
                problem: `${passengersWithoutReqId.length} passenger(s) en groups.passengers[] sin requestId: [${paxList}]`,
                currentState: { status: g.status, occupiedSeats: g.occupiedSeats, passengersCount: (g.passengers || []).length },
                proposedAction: `Marcar grupo como 'admin_repaired' y cancelar todos los requests asociados vía requestIds[]`,
                risk: 'Medio — el grupo nunca podrá ser despachado correctamente con datos corruptos',
                requiresManualDecision: false,
                linkedDocs: (g.requestIds || []).map((r: string) => `shared_ride_requests/${r}`)
            });

            // Reparar: cancelar el grupo + cancelar sus requests
            addRepair({
                collection: 'shared_ride_groups',
                docId: doc.id,
                update: {
                    status: 'cancelled',
                    cancelledBy: 'admin_script',
                    cancelReason: 'corrupt_passengers_no_requestId',
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    adminRepairNote: 'Cancelado por script de limpieza. passengers[].requestId faltante.',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: 'passengers[] con requestId undefined — datos corruptos pre-fix'
            });
        }

        // ── 1b. orderedStops[] sin requestId ────────────────────────────────
        const stopsWithoutReqId = (g.orderedStops || []).filter((s: any) => !s.requestId);
        if (stopsWithoutReqId.length > 0) {
            addIssue({
                collection: 'shared_ride_groups',
                docId: doc.id,
                severity: 'HIGH',
                problem: `${stopsWithoutReqId.length} stop(s) en orderedStops[] sin requestId`,
                currentState: { status: g.status, stopsTotal: (g.orderedStops || []).length },
                proposedAction: 'Marcar grupo como cancelled/admin_repaired',
                risk: 'Alto — dispatchSharedRideGroupIfReady va a fallar con CORRUPT_GROUP_DATA',
                requiresManualDecision: false,
                linkedDocs: (g.requestIds || []).map((r: string) => `shared_ride_requests/${r}`)
            });
        }

        // ── 1c. Group activo viejo sin actividad reciente ───────────────────
        const createdAt = g.createdAt?._seconds ? g.createdAt._seconds * 1000 : null;
        const ageMinutes = createdAt ? (Date.now() - createdAt) / 60000 : null;
        if (ageMinutes && ageMinutes > 30 && ['forming', 'pending'].includes(g.status)) {
            addIssue({
                collection: 'shared_ride_groups',
                docId: doc.id,
                severity: 'MEDIUM',
                problem: `Grupo en estado '${g.status}' con ${Math.round(ageMinutes)} minutos de antigüedad (>30min) — probablemente atascado`,
                currentState: { status: g.status, occupiedSeats: g.occupiedSeats, ageMinutes: Math.round(ageMinutes) },
                proposedAction: `Marcar como 'expired' con expiredReason: watchdog_missed`,
                risk: 'Bajo — el grupo no puede avanzar sin mínimo de pasajeros',
                requiresManualDecision: false,
                linkedDocs: (g.requestIds || []).map((r: string) => `shared_ride_requests/${r}`)
            });
        }

        // ── 1d. Group con driver asignado pero sin finalRideId ──────────────
        if (['driver_assigned', 'in_progress'].includes(g.status) && !g.finalRideId) {
            addIssue({
                collection: 'shared_ride_groups',
                docId: doc.id,
                severity: 'CRITICAL',
                problem: `Grupo en '${g.status}' pero sin finalRideId — conductor asignado sin ride real`,
                currentState: { status: g.status, driverId: g.driverId || g.assignedDriverId || 'N/A', finalRideId: null },
                proposedAction: `Buscar ride shared_${doc.id} — si existe, setear finalRideId. Si no existe, cancelar grupo y liberar conductor`,
                risk: 'Crítico — conductor preso en viaje sin destino',
                requiresManualDecision: true,
                linkedDocs: [`rides/shared_${doc.id}`]
            });
        }

        // ── 1e. Group en driver_assigned/in_progress — verificar ride ───────
        if (['driver_assigned', 'in_progress'].includes(g.status) && g.finalRideId) {
            linkedDocs.push(`rides/${g.finalRideId}`);
            const rideSnap = await db.doc(`rides/${g.finalRideId}`).get();
            if (!rideSnap.exists) {
                addIssue({
                    collection: 'shared_ride_groups',
                    docId: doc.id,
                    severity: 'CRITICAL',
                    problem: `Grupo apunta a finalRideId='${g.finalRideId}' que NO EXISTE en Firestore`,
                    currentState: { status: g.status, finalRideId: g.finalRideId },
                    proposedAction: `Cancelar grupo y liberar pasajeros y conductor. El ride fue eliminado o nunca se creó.`,
                    risk: 'Crítico — referencia rota grupo→ride',
                    requiresManualDecision: false,
                    linkedDocs: [`rides/${g.finalRideId}`]
                });
                // Repair: cancelar grupo
                addRepair({
                    collection: 'shared_ride_groups',
                    docId: doc.id,
                    update: {
                        status: 'cancelled',
                        cancelledBy: 'admin_script',
                        cancelReason: 'ride_document_missing',
                        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    },
                    reason: `finalRideId=${g.finalRideId} no existe`
                });
            }
        }

        // ── 1f. requestIds vs passengerIds inconsistentes ───────────────────
        const reqCount = (g.requestIds || []).length;
        const paxCount = (g.passengerIds || []).length;
        if (reqCount !== paxCount) {
            addIssue({
                collection: 'shared_ride_groups',
                docId: doc.id,
                severity: 'HIGH',
                problem: `requestIds.length=${reqCount} ≠ passengerIds.length=${paxCount} — arrays inconsistentes`,
                currentState: { status: g.status, requestIds: g.requestIds, passengerIds: g.passengerIds },
                proposedAction: `Cancelar grupo para evitar comportamiento indefinido`,
                risk: 'Alto — puede causar loops o duplicados en dispatching',
                requiresManualDecision: true
            });
        }
    }
}

// ─── MÓDULO 2: Auditar shared_ride_requests ───────────────────────────────────
async function auditRequests(): Promise<void> {
    logSection('MÓDULO 2 — shared_ride_requests');

    const activeStatuses = ['pending_group', 'forming', 'grouped', 'confirmed', 'assigned',
        'driver_assigned', 'pickup_pending', 'picked_up'];

    // NOTE: No orderBy — evita requerir índice compuesto
    const snap = await db.collection('shared_ride_requests')
        .where('status', 'in', activeStatuses)
        .limit(200)
        .get();

    log(`  Requests activos encontrados: ${snap.size}`);

    const requestsByGroup: Record<string, any[]> = {};

    for (const doc of snap.docs) {
        const r: any = { id: doc.id, ...doc.data() };
        if (BACKUP) backupData.shared_ride_requests.push(r);

        if (r.groupId) {
            if (!requestsByGroup[r.groupId]) requestsByGroup[r.groupId] = [];
            requestsByGroup[r.groupId].push(r);
        }

        // ── 2a. Request sin groupId ──────────────────────────────────────────
        if (!r.groupId) {
            addIssue({
                collection: 'shared_ride_requests',
                docId: doc.id,
                severity: 'MEDIUM',
                problem: `Request activo sin groupId — huérfano (passengerId=${r.passengerId})`,
                currentState: { status: r.status, passengerId: r.passengerId },
                proposedAction: `Marcar como 'cancelled' con cancelReason='orphan_no_group'. Limpiar user.activeSharedRequestId`,
                risk: 'Bajo — no puede avanzar, solo bloquea al usuario',
                requiresManualDecision: false,
                linkedDocs: r.passengerId ? [`users/${r.passengerId}`] : []
            });
            addRepair({
                collection: 'shared_ride_requests',
                docId: doc.id,
                update: {
                    status: 'cancelled',
                    cancelledBy: 'admin_script',
                    cancelReason: 'orphan_no_group',
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: 'Request activo sin groupId'
            });
        }

        // ── 2b. Request con groupId pero el grupo no existe ──────────────────
        if (r.groupId) {
            const groupSnap = await db.doc(`shared_ride_groups/${r.groupId}`).get();
            if (!groupSnap.exists) {
                addIssue({
                    collection: 'shared_ride_requests',
                    docId: doc.id,
                    severity: 'HIGH',
                    problem: `Request activo apunta a grupo '${r.groupId}' que NO EXISTE`,
                    currentState: { status: r.status, groupId: r.groupId, passengerId: r.passengerId },
                    proposedAction: `Marcar como 'cancelled' con cancelReason='group_not_found'. Limpiar user.activeSharedRequestId`,
                    risk: 'Medio — usuario bloqueado sin grupo',
                    requiresManualDecision: false,
                    linkedDocs: [`users/${r.passengerId}`]
                });
                addRepair({
                    collection: 'shared_ride_requests',
                    docId: doc.id,
                    update: {
                        status: 'cancelled',
                        cancelledBy: 'admin_script',
                        cancelReason: 'group_not_found',
                        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    },
                    reason: `groupId=${r.groupId} no existe`
                });
            } else {
                const gData: any = groupSnap.data();
                // ── 2c. Grupo existe pero está cancelado/expirado ────────────
                const terminalGroupStatuses = ['cancelled', 'expired', 'completed'];
                if (terminalGroupStatuses.includes(gData.status)) {
                    addIssue({
                        collection: 'shared_ride_requests',
                        docId: doc.id,
                        severity: 'HIGH',
                        problem: `Request activo (status=${r.status}) pero su grupo está en '${gData.status}'`,
                        currentState: { status: r.status, groupId: r.groupId, groupStatus: gData.status },
                        proposedAction: `Marcar request como '${gData.status === 'completed' ? 'cancelled' : gData.status}'. Limpiar user state.`,
                        risk: 'Medio — usuario bloqueado con request inconsistente',
                        requiresManualDecision: false,
                        linkedDocs: [`users/${r.passengerId}`]
                    });
                    addRepair({
                        collection: 'shared_ride_requests',
                        docId: doc.id,
                        update: {
                            status: 'cancelled',
                            cancelledBy: 'admin_script',
                            cancelReason: `group_already_${gData.status}`,
                            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        },
                        reason: `Grupo en estado terminal ${gData.status}`
                    });
                }
            }
        }

        // ── 2d. Request en assigned/driver_assigned sin finalRideId ──────────
        if (['assigned', 'driver_assigned'].includes(r.status) && !r.finalRideId) {
            addIssue({
                collection: 'shared_ride_requests',
                docId: doc.id,
                severity: 'HIGH',
                problem: `Request en '${r.status}' sin finalRideId — nunca se completó el dispatch`,
                currentState: { status: r.status, groupId: r.groupId, passengerId: r.passengerId },
                proposedAction: `Marcar como 'cancelled' con cancelReason='dispatch_incomplete'`,
                risk: 'Medio — usuario bloqueado esperando conductor que no llega',
                requiresManualDecision: false,
                linkedDocs: r.passengerId ? [`users/${r.passengerId}`] : []
            });
            addRepair({
                collection: 'shared_ride_requests',
                docId: doc.id,
                update: {
                    status: 'cancelled',
                    cancelledBy: 'admin_script',
                    cancelReason: 'dispatch_incomplete_no_ride',
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: 'assigned/driver_assigned sin finalRideId'
            });
        }

        // ── 2e. Request antiguo (>60 min) en estado activo ───────────────────
        const createdAt = r.createdAt?._seconds ? r.createdAt._seconds * 1000 : null;
        const ageMinutes = createdAt ? (Date.now() - createdAt) / 60000 : null;
        if (ageMinutes && ageMinutes > 60 && ['pending_group', 'forming', 'grouped'].includes(r.status)) {
            addIssue({
                collection: 'shared_ride_requests',
                docId: doc.id,
                severity: 'MEDIUM',
                problem: `Request en '${r.status}' con ${Math.round(ageMinutes)} minutos de antigüedad (>60min)`,
                currentState: { status: r.status, ageMinutes: Math.round(ageMinutes), passengerId: r.passengerId },
                proposedAction: `Marcar como 'expired'`,
                risk: 'Bajo — timeout implícito',
                requiresManualDecision: false,
                linkedDocs: r.passengerId ? [`users/${r.passengerId}`] : []
            });
            addRepair({
                collection: 'shared_ride_requests',
                docId: doc.id,
                update: {
                    status: 'expired',
                    expiredAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiredReason: 'stale_more_than_60min',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: `Request activo con ${Math.round(ageMinutes)}min de antigüedad`
            });
        }
    }
}

// ─── MÓDULO 3: Auditar rides compartidos ─────────────────────────────────────
async function auditSharedRides(): Promise<void> {
    logSection('MÓDULO 3 — rides (isSharedRide)');

    const activeRideStatuses = ['searching', 'driver_assigned', 'driver_arrived', 'in_progress', 'started', 'ongoing'];

    // NOTE: No orderBy — evita requerir índice compuesto
    const snap = await db.collection('rides')
        .where('isSharedRide', '==', true)
        .where('status', 'in', activeRideStatuses)
        .limit(50)
        .get();

    log(`  Rides compartidos activos encontrados: ${snap.size}`);

    for (const doc of snap.docs) {
        const r: any = { id: doc.id, ...doc.data() };
        if (BACKUP) backupData.rides.push(r);

        // ── 3a. sharedPassengers[] sin requestId ─────────────────────────────
        const corruptPassengers = (r.sharedPassengers || []).filter((p: any) => !p.requestId);
        if (corruptPassengers.length > 0) {
            const paxList = corruptPassengers.map((p: any) => p.passengerId || 'UNKNOWN').join(', ');
            addIssue({
                collection: 'rides',
                docId: doc.id,
                severity: 'CRITICAL',
                problem: `${corruptPassengers.length} sharedPassenger(s) sin requestId: [${paxList}]. acceptRideV2 va a fallar.`,
                currentState: { status: r.status, sharedGroupId: r.sharedGroupId, sharedPassengerCount: r.sharedPassengerCount },
                proposedAction: `Cancelar ride y grupo asociado. Liberar conductor si está asignado. Liberar pasajeros.`,
                risk: 'Crítico — ride inoperable, nadie puede aceptarlo ni avanzarlo',
                requiresManualDecision: false,
                linkedDocs: [
                    `shared_ride_groups/${r.sharedGroupId}`,
                    ...(r.passengerIds || []).map((pid: string) => `users/${pid}`),
                    ...(r.driverId ? [`users/${r.driverId}`] : [])
                ]
            });
            addRepair({
                collection: 'rides',
                docId: doc.id,
                update: {
                    status: 'cancelled',
                    cancelledBy: 'admin_script',
                    cancelReason: 'corrupt_sharedPassengers_no_requestId',
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: 'sharedPassengers[] con requestId undefined — bloqueado por Opción A'
            });

            // ── Liberar conductor: lo hacemos aquí para garantizar
            //    que se haga en el mismo batch, sin depender del estado del ride
            //    (que ahora es in_progress, no terminal — así que módulo 5 no lo pickupó)
            if (r.driverId) {
                log(`  🔧 [RIDE->DRIVER] Agregando reparación para conductor ${r.driverId} preso en ride ${doc.id}`);
                addRepair({
                    collection: 'users',
                    docId: r.driverId,
                    update: {
                        driverStatus: 'online',
                        isAvailable: true,
                        activeRideId: admin.firestore.FieldValue.delete(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    },
                    reason: `Conductor liberado — ride ${doc.id} cancelado por requestId corrupto`
                });
                // También actualizar drivers_locations si existe
                const driverLocSnap = await db.doc(`drivers_locations/${r.driverId}`).get();
                if (driverLocSnap.exists) {
                    addRepair({
                        collection: 'drivers_locations',
                        docId: r.driverId,
                        update: {
                            driverStatus: 'online',
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        },
                        reason: `drivers_locations — conductor liberado por ride ${doc.id} cancelado`
                    });
                }
            }

            // ── Liberar pasajeros: limpiar estado compartido de cada pasajero del ride
            for (const pid of (r.passengerIds || [])) {
                addRepair({
                    collection: 'users',
                    docId: pid,
                    update: {
                        activeRideId: admin.firestore.FieldValue.delete(),
                        activeSharedRideId: admin.firestore.FieldValue.delete(),
                        activeSharedRequestId: admin.firestore.FieldValue.delete(),
                        activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
                        currentSharedRideGroupId: admin.firestore.FieldValue.delete(),
                        sharedRideStatus: admin.firestore.FieldValue.delete(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    },
                    reason: `Pasajero liberado — ride ${doc.id} cancelado por requestId corrupto`
                });
            }
        }

        // ── 3b. orderedStops[] sin requestId ─────────────────────────────────
        const corruptStops = (r.orderedStops || []).filter((s: any) => !s.requestId);
        if (corruptStops.length > 0) {
            addIssue({
                collection: 'rides',
                docId: doc.id,
                severity: 'CRITICAL',
                problem: `${corruptStops.length} orderedStop(s) sin requestId. advanceSharedRideStopV1 va a fallar.`,
                currentState: { status: r.status, stopsTotal: (r.orderedStops || []).length },
                proposedAction: `Cancelar ride — no puede avanzar paradas`,
                risk: 'Crítico — ride completamente bloqueado',
                requiresManualDecision: false,
                linkedDocs: [`shared_ride_groups/${r.sharedGroupId}`]
            });
        }

        // ── 3c. Ride searching con >15 minutos sin conductor ─────────────────
        const createdAt = r.createdAt?._seconds ? r.createdAt._seconds * 1000 : null;
        const ageMinutes = createdAt ? (Date.now() - createdAt) / 60000 : null;
        if (r.status === 'searching' && ageMinutes && ageMinutes > 15) {
            addIssue({
                collection: 'rides',
                docId: doc.id,
                severity: 'MEDIUM',
                problem: `Ride compartido en 'searching' por ${Math.round(ageMinutes)} minutos — probablemente atascado`,
                currentState: { status: r.status, ageMinutes: Math.round(ageMinutes), sharedGroupId: r.sharedGroupId },
                proposedAction: `Cancelar ride y grupo. Liberar pasajeros.`,
                risk: 'Medio — usuarios esperando conductor que no llegará',
                requiresManualDecision: true
            });
        }

        // ── 3d. Ride con driverId pero sin driver_assigned en requests ────────
        if (r.driverId && ['driver_assigned', 'driver_arrived', 'in_progress'].includes(r.status)) {
            const requestsSnap = await db.collection('shared_ride_requests')
                .where('finalRideId', '==', doc.id)
                .get();

            const stuckRequests = requestsSnap.docs.filter(d => {
                const rd: any = d.data();
                return !['driver_assigned', 'picked_up', 'dropped_off', 'no_show', 'cancelled', 'expired'].includes(rd.status);
            });

            if (stuckRequests.length > 0) {
                addIssue({
                    collection: 'rides',
                    docId: doc.id,
                    severity: 'HIGH',
                    problem: `${stuckRequests.length} request(s) en estado incorrecto para ride con conductor asignado`,
                    currentState: {
                        status: r.status,
                        driverId: r.driverId,
                        stuckRequestStatuses: stuckRequests.map(d => ({ id: d.id, status: d.data().status }))
                    },
                    proposedAction: `Actualizar esos requests a 'driver_assigned' para consistencia`,
                    risk: 'Medio — inconsistencia que puede afectar flujo de avance de paradas',
                    requiresManualDecision: true,
                    linkedDocs: stuckRequests.map(d => `shared_ride_requests/${d.id}`)
                });
            }
        }
    }
}

// ─── MÓDULO 4: Auditar usuarios bloqueados ───────────────────────────────────
async function auditBlockedUsers(): Promise<void> {
    logSection('MÓDULO 4 — usuarios bloqueados en shared ride');

    // Usuarios con activeSharedRequestId activo
    // NOTE: Firestore no admite '!= null' directamente como filtro en todos los SDK.
    // Usamos '!=' con una cadena vacía como proxy conservador.
    // Si la DB usa '' en lugar de null puede dar false negatives — luego se revisa.
    const [usersSnap1, usersSnap2] = await Promise.all([
        db.collection('users').where('activeSharedRequestId', '!=', '').limit(100).get(),
        db.collection('users').where('activeSharedRideGroupId', '!=', '').limit(100).get(),
    ]);

    // Deduplicar por ID
    const seenUserIds = new Set<string>();
    const allUserDocs: admin.firestore.QueryDocumentSnapshot[] = [];
    for (const d of [...usersSnap1.docs, ...usersSnap2.docs]) {
        if (!seenUserIds.has(d.id)) { seenUserIds.add(d.id); allUserDocs.push(d); }
    }
    // Alias para el loop que sigue
    const usersSnap = { docs: allUserDocs };

    log(`  Usuarios con campos shared activos: ${usersSnap.docs.length}`);

    for (const doc of usersSnap.docs) {
        const u: any = { id: doc.id, ...doc.data() };
        if (BACKUP) backupData.users.push(u);

        const reqId = u.activeSharedRequestId;
        if (!reqId) continue;

        // Verificar que el request exista y no esté terminal
        const reqSnap = await db.doc(`shared_ride_requests/${reqId}`).get();
        if (!reqSnap.exists) {
            addIssue({
                collection: 'users',
                docId: doc.id,
                severity: 'HIGH',
                problem: `User tiene activeSharedRequestId='${reqId}' pero el documento NO EXISTE`,
                currentState: { activeSharedRequestId: reqId, activeRideId: u.activeRideId || null },
                proposedAction: `Limpiar activeSharedRequestId, activeSharedRideGroupId, sharedRideStatus del user`,
                risk: 'Bajo — usuario bloqueado no puede solicitar nuevo viaje compartido',
                requiresManualDecision: false,
                linkedDocs: []
            });
            addRepair({
                collection: 'users',
                docId: doc.id,
                update: {
                    activeSharedRequestId: admin.firestore.FieldValue.delete(),
                    activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
                    currentSharedRideGroupId: admin.firestore.FieldValue.delete(),
                    sharedRideStatus: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: `activeSharedRequestId=${reqId} no existe en Firestore`
            });
            continue;
        }

        const reqData: any = reqSnap.data();
        const terminalStates = ['cancelled', 'completed', 'expired', 'no_show', 'undeclared_companion', 'rejected'];
        if (terminalStates.includes(reqData.status)) {
            addIssue({
                collection: 'users',
                docId: doc.id,
                severity: 'MEDIUM',
                problem: `User tiene activeSharedRequestId='${reqId}' pero el request está en estado terminal '${reqData.status}'`,
                currentState: { activeSharedRequestId: reqId, requestStatus: reqData.status },
                proposedAction: `Limpiar estado compartido del usuario (ya debería haber sido limpiado por onSharedRideRequestUpdateV1)`,
                risk: 'Bajo — usuario bloqueado',
                requiresManualDecision: false
            });
            addRepair({
                collection: 'users',
                docId: doc.id,
                update: {
                    activeSharedRequestId: admin.firestore.FieldValue.delete(),
                    activeSharedRideGroupId: admin.firestore.FieldValue.delete(),
                    currentSharedRideGroupId: admin.firestore.FieldValue.delete(),
                    sharedRideStatus: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: `Request en estado terminal ${reqData.status} — user state no fue limpiado`
            });
        }
    }
}

// ─── MÓDULO 5: Auditar conductores presos ────────────────────────────────────
async function auditBlockedDrivers(): Promise<void> {
    logSection('MÓDULO 5 — conductores con driverStatus: in_ride en viajes compartidos');

    // NOTE: No orderBy — query simple sin índice compuesto
    const driversSnap = await db.collection('users')
        .where('driverStatus', '==', 'in_ride')
        .limit(50)
        .get();

    log(`  Conductores en in_ride: ${driversSnap.docs.length}`);

    for (const doc of driversSnap.docs) {
        const d: any = { id: doc.id, ...doc.data() };
        // Solo procesar conductores (algunos usuarios pueden tener driverStatus sin ser drivers)
        if (d.role !== 'driver') continue;
        const activeRideId = d.activeRideId;
        if (!activeRideId) {
            addIssue({
                collection: 'users',
                docId: doc.id,
                severity: 'HIGH',
                problem: `Conductor con driverStatus='in_ride' pero sin activeRideId`,
                currentState: { driverStatus: d.driverStatus, activeRideId: null },
                proposedAction: `Setear driverStatus='online', isAvailable=true, activeRideId=null`,
                risk: 'Bajo — conductor preso no puede recibir nuevas ofertas',
                requiresManualDecision: false
            });
            addRepair({
                collection: 'users',
                docId: doc.id,
                update: {
                    driverStatus: 'online',
                    isAvailable: true,
                    activeRideId: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: 'driverStatus=in_ride sin activeRideId'
            });
            continue;
        }

        const rideSnap = await db.doc(`rides/${activeRideId}`).get();
        if (!rideSnap.exists) {
            addIssue({
                collection: 'users',
                docId: doc.id,
                severity: 'CRITICAL',
                problem: `Conductor en in_ride con activeRideId='${activeRideId}' que NO EXISTE`,
                currentState: { driverStatus: d.driverStatus, activeRideId },
                proposedAction: `Liberar conductor: driverStatus='online', activeRideId=null`,
                risk: 'Crítico — conductor completamente bloqueado',
                requiresManualDecision: false,
                linkedDocs: [`rides/${activeRideId}`]
            });
            addRepair({
                collection: 'users',
                docId: doc.id,
                update: {
                    driverStatus: 'online',
                    isAvailable: true,
                    activeRideId: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                reason: `activeRideId=${activeRideId} no existe`
            });
        } else {
            const rideData: any = rideSnap.data();
            const terminalRideStatuses = ['completed', 'cancelled'];
            if (terminalRideStatuses.includes(rideData.status)) {
                addIssue({
                    collection: 'users',
                    docId: doc.id,
                    severity: 'HIGH',
                    problem: `Conductor en in_ride pero su ride '${activeRideId}' está en estado '${rideData.status}'`,
                    currentState: { driverStatus: d.driverStatus, activeRideId, rideStatus: rideData.status },
                    proposedAction: `Liberar conductor`,
                    risk: 'Medio — ride terminado pero conductor preso',
                    requiresManualDecision: false,
                    linkedDocs: [`rides/${activeRideId}`]
                });
                addRepair({
                    collection: 'users',
                    docId: doc.id,
                    update: {
                        driverStatus: 'online',
                        isAvailable: true,
                        activeRideId: admin.firestore.FieldValue.delete(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    },
                    reason: `Ride en estado terminal ${rideData.status}`
                });
            }
        }
    }
}

// ─── MÓDULO 6: Caso específico conocido ─────────────────────────────────────
async function auditKnownCase(): Promise<void> {
    logSection('MÓDULO 6 — Caso Conocido: grupo shared_ZsFk7tzYyDzUGzVteSP1');

    const KNOWN_GROUP_ID = 'ZsFk7tzYyDzUGzVteSP1';
    const KNOWN_RIDE_ID  = `shared_${KNOWN_GROUP_ID}`;

    log(`  Buscando grupo: shared_ride_groups/${KNOWN_GROUP_ID}`);
    log(`  Buscando ride:  rides/${KNOWN_RIDE_ID}`);

    const [groupSnap, rideSnap] = await Promise.all([
        db.doc(`shared_ride_groups/${KNOWN_GROUP_ID}`).get(),
        db.doc(`rides/${KNOWN_RIDE_ID}`).get()
    ]);

    if (!groupSnap.exists) {
        log(`  ℹ️  Grupo ${KNOWN_GROUP_ID} NO encontrado en Firestore (puede ya haber sido limpiado).`);
    } else {
        const g: any = groupSnap.data();
        log(`\n  📋 GRUPO ENCONTRADO:`);
        log(`     status         : ${g.status}`);
        log(`     occupiedSeats  : ${g.occupiedSeats}`);
        log(`     requestIds     : ${JSON.stringify(g.requestIds)}`);
        log(`     passengerIds   : ${JSON.stringify(g.passengerIds)}`);
        log(`     finalRideId    : ${g.finalRideId || 'null'}`);
        log(`     driverId       : ${g.driverId || 'null'}`);

        // Auditar passengers[]
        const pax = g.passengers || [];
        log(`\n  👥 PASSENGERS[] (${pax.length}):`);
        pax.forEach((p: any, i: number) => {
            const hasReqId = !!p.requestId;
            log(`     [${i}] passengerId=${p.passengerId} | requestId=${p.requestId || '⚠️  UNDEFINED'} | status=${p.status} | roleInGroup=${p.roleInGroup}`);
            if (!hasReqId) {
                log(`         ❌ CORRUPTO — requestId faltante`);
            }
        });

        // Auditar orderedStops[]
        const stops = g.orderedStops || [];
        log(`\n  🗺️  ORDERED_STOPS[] (${stops.length}):`);
        stops.forEach((s: any, i: number) => {
            log(`     [${i}] type=${s.type} | requestId=${s.requestId || '⚠️  UNDEFINED'} | status=${s.status || 'N/A'}`);
        });

        // Auditar requests de este grupo
        log(`\n  📑 REQUESTS DEL GRUPO:`);
        for (const rid of (g.requestIds || [])) {
            const rSnap = await db.doc(`shared_ride_requests/${rid}`).get();
            if (!rSnap.exists) {
                log(`     ${rid} → ❌ NO EXISTE`);
            } else {
                const rd: any = rSnap.data();
                log(`     ${rid} → status=${rd.status} | passengerId=${rd.passengerId} | finalRideId=${rd.finalRideId || 'null'}`);
            }
        }

        // Auditar usuarios
        log(`\n  👤 USUARIOS (passengerIds):`);
        for (const uid of (g.passengerIds || [])) {
            const uSnap = await db.doc(`users/${uid}`).get();
            if (!uSnap.exists) {
                log(`     ${uid} → ❌ NO EXISTE`);
            } else {
                const ud: any = uSnap.data();
                log(`     ${uid} (${ud.name || 'sin nombre'})`);
                log(`       activeRideId          : ${ud.activeRideId || 'null'}`);
                log(`       activeSharedRequestId  : ${ud.activeSharedRequestId || 'null'}`);
                log(`       activeSharedRideGroupId: ${ud.activeSharedRideGroupId || 'null'}`);
                log(`       sharedRideStatus       : ${ud.sharedRideStatus || 'null'}`);
            }
        }
    }

    if (!rideSnap.exists) {
        log(`\n  ℹ️  Ride ${KNOWN_RIDE_ID} NO encontrado en Firestore.`);
    } else {
        const r: any = rideSnap.data();
        log(`\n  🚗 RIDE ENCONTRADO:`);
        log(`     status               : ${r.status}`);
        log(`     driverId             : ${r.driverId || 'null'}`);
        log(`     sharedGroupId        : ${r.sharedGroupId}`);
        log(`     sharedPassengerCount : ${r.sharedPassengerCount}`);

        const sp = r.sharedPassengers || [];
        log(`\n  👥 SHARED_PASSENGERS[] (${sp.length}):`);
        sp.forEach((p: any, i: number) => {
            log(`     [${i}] passengerId=${p.passengerId} | requestId=${p.requestId || '⚠️  UNDEFINED'} | status=${p.status}`);
        });

        const os = r.orderedStops || [];
        log(`\n  🗺️  ORDERED_STOPS[] (${os.length}):`);
        os.forEach((s: any, i: number) => {
            log(`     [${i}] type=${s.type} | requestId=${s.requestId || '⚠️  UNDEFINED'} | passengerId=${s.passengerId || 'N/A'}`);
        });

        // Conductor
        if (r.driverId) {
            const driverSnap = await db.doc(`users/${r.driverId}`).get();
            if (driverSnap.exists) {
                const dd: any = driverSnap.data();
                log(`\n  🚗 CONDUCTOR (${r.driverId}):`);
                log(`     driverStatus : ${dd.driverStatus}`);
                log(`     activeRideId : ${dd.activeRideId || 'null'}`);
            }
        }
    }
}

// ─── MÓDULO 7: Backup local ───────────────────────────────────────────────────
async function saveBackup(): Promise<void> {
    if (!BACKUP && DRY_RUN) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve(process.cwd(), `../backups/shared-repair/${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    for (const [col, docs] of Object.entries(backupData)) {
        if (docs.length === 0) continue;
        const filePath = path.join(backupDir, `${col}.json`);
        fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
        log(`  💾 Backup guardado: ${filePath} (${docs.length} docs)`);
    }

    const summaryPath = path.join(backupDir, '_audit_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
        timestamp,
        dryRun: DRY_RUN,
        issueCount: issues.length,
        repairCount: repairs.length,
        issues: issues.map(i => ({ severity: i.severity, collection: i.collection, docId: i.docId, problem: i.problem }))
    }, null, 2));
    log(`  📋 Resumen guardado: ${summaryPath}`);
}

// ─── MÓDULO 8: Aplicar reparaciones (solo si APPLY=true) ─────────────────────
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

// ─── REPORTE FINAL ────────────────────────────────────────────────────────────
function printFinalReport(): void {
    logSection('REPORTE FINAL DE AUDITORÍA');

    const bySeverity: Record<string, AuditIssue[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
    const byCollection: Record<string, AuditIssue[]> = {};

    for (const issue of issues) {
        bySeverity[issue.severity].push(issue);
        if (!byCollection[issue.collection]) byCollection[issue.collection] = [];
        byCollection[issue.collection].push(issue);
    }

    log(`\n  RESUMEN POR SEVERIDAD:`);
    log(`  🔴 CRITICAL : ${bySeverity.CRITICAL.length}`);
    log(`  🟠 HIGH     : ${bySeverity.HIGH.length}`);
    log(`  🟡 MEDIUM   : ${bySeverity.MEDIUM.length}`);
    log(`  🔵 LOW      : ${bySeverity.LOW.length}`);
    log(`  ─────────────────────────`);
    log(`  TOTAL       : ${issues.length} problemas detectados`);

    log(`\n  RESUMEN POR COLECCIÓN:`);
    for (const [col, colIssues] of Object.entries(byCollection)) {
        log(`  ${col.padEnd(30)} : ${colIssues.length} problemas`);
    }

    log(`\n  REPARACIONES PROPUESTAS:`);
    log(`  Total de documentos a modificar: ${repairs.length}`);
    log(`  - Requieren decisión manual    : ${issues.filter(i => i.requiresManualDecision).length}`);
    log(`  - Automáticas (conservadoras)  : ${issues.filter(i => !i.requiresManualDecision).length}`);

    if (DRY_RUN) {
        log(`\n  ═══════════════════════════════════════════════════════`);
        log(`  ✅ DRY_RUN completado — FIRESTORE NO FUE MODIFICADO`);
        log(`  ═══════════════════════════════════════════════════════`);
        log(`\n  Para aplicar los cambios reales:`);
        log(`  APPLY=true CONFIRM_SHARED_REPAIR=YES npx ts-node scripts/audit_and_repair_shared_stuck_production.ts`);
    } else {
        log(`\n  ✅ APPLY completado — ${repairs.length} documentos modificados`);
    }

    log(`\n  Recomendaciones:`);
    if (bySeverity.CRITICAL.length > 0) {
        log(`  🔴 Hay ${bySeverity.CRITICAL.length} problemas CRÍTICOS. Estos bloquean conductores y/o pasajeros activamente.`);
        log(`     → Aplicar reparación con APPLY=true después de revisar el dry-run.`);
    }
    if (issues.filter(i => i.requiresManualDecision).length > 0) {
        log(`  ⚠️  Hay ${issues.filter(i => i.requiresManualDecision).length} casos que requieren decisión manual.`);
        log(`     → Revisar cada caso antes de aprobar reparación.`);
    }
    if (issues.length === 0) {
        log(`  ✅ No se detectaron problemas. Producción limpia.`);
    }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + DSEP);
    console.log('  VamO Compartido — Auditoría y Reparación Controlada');
    console.log(`  Modo: ${DRY_RUN ? '🔍 DRY_RUN (sin cambios)' : '⚠️  APPLY (MODIFICANDO FIRESTORE)'}`);
    console.log(`  Fecha: ${new Date().toISOString()}`);
    console.log(DSEP);

    await auditGroups();
    await auditRequests();
    await auditSharedRides();
    await auditBlockedUsers();
    await auditBlockedDrivers();
    await auditKnownCase();

    if (BACKUP || !DRY_RUN) {
        logSection('BACKUP LOCAL');
        await saveBackup();
    }

    if (!DRY_RUN) {
        await applyRepairs();
    }

    printFinalReport();
}

main().catch(e => {
    console.error('\n❌ Error fatal en auditoría:', e);
    process.exit(1);
});
