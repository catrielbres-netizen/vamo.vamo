import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { getAntifraudConfig } from "./lib/antifraudConfig";
import { FraudAlert, AntifraudAlertSeverity } from "./types";
import { logLedgerEvent } from "./lib/audit";

/**
 * [VamO PRO] GHOST RIDER GUARDIAN v2.0
 * Detecta anomalías al finalizar el viaje.
 */
export const onRideCompletedFraudCheckV2 = onDocumentUpdated("rides/{rideId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;
    if ((after as any).isSimulation === true) return; // [SIM_GUARD]

    const config = await getAntifraudConfig();
    if (!config.enabled) return;

    if (before.status !== 'completed' && after.status === 'completed') {
        const db = getDb();
        const rideId = event.params.rideId;
        const { driverId, passengerId, driverName, passengerName, origin, destination, pricing, completedRide } = after;

        if (!driverId || !passengerId) return;

        logger.info(`[FRAUD_SCAN] Auditing ride ${rideId} (Mode: ${config.mode})...`);

        const flags: string[] = [];
        let score = 0;

        // 1. DISTANCIA/TIEMPO RIDÍCULO
        const distMetros = completedRide?.distanceMeters || 0;
        const durSegundos = completedRide?.durationSeconds || 0;
        
        if (distMetros < 150 && durSegundos < 45) {
            flags.push("VIAJE_ULTRA_CORTO: Posible auto-matching.");
            score += 60;
        }

        // 2. RECURRENCIA SOSPECHOSA (Mismo par en las últimas 24hs)
        const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const recentMatchesSnap = await db.collection('rides')
            .where('driverId', '==', driverId)
            .where('passengerId', '==', passengerId)
            .where('status', '==', 'completed')
            .where('createdAt', '>=', oneDayAgo)
            .get();

        if (recentMatchesSnap.size >= 2) {
            flags.push(`RECURRENCIA: ${recentMatchesSnap.size} viajes con el mismo par en 24hs.`);
            score += Math.min(40, (recentMatchesSnap.size - 1) * 20);
        }

        // 3. ORIGEN/DESTINO IGUALES
        if (origin && destination) {
            const latDiff = Math.abs(origin.lat - destination.lat);
            const lngDiff = Math.abs(origin.lng - destination.lng);
            if (latDiff < 0.0003 && lngDiff < 0.0003) {
                flags.push("PUNTOS_COINCIDENTES: Origen y destino idénticos.");
                score += 50;
            }
        }

        // 4. PRECIO VS RECORRIDO (Inflación manual)
        const estimated = pricing?.estimatedTotal || 0;
        const final = completedRide?.totalFare || 0;
        if (final > estimated * 2.5 && final > 5000) {
            flags.push("PRECIO_INFLADO: Tarifa final > 2.5x estimada.");
            score += 40;
        }

        if (score > 0) {
            const severity: AntifraudAlertSeverity = 
                score >= 90 ? 'critical' : 
                score >= 70 ? 'high' : 
                score >= 40 ? 'medium' : 'low';

            await createFraudAlert({
                db,
                type: 'COMPLETED_RIDE_ANOMALY',
                severity,
                score,
                rideId,
                driverId,
                passengerId,
                cityKey: after.cityKey || 'global',
                reason: flags.join(" | "),
                evidence: { distMetros, durSegundos, recurrence: recentMatchesSnap.size, finalFare: final }
            });

            // Si está en modo enforce y score es muy alto -> Suspender
            if (config.mode === 'enforce' && score >= config.autoBlockAboveScore) {
                logger.warn(`[FRAUD_ENFORCE] Auto-blocking driver ${driverId} due to critical fraud score ${score}`);
                await db.collection('users').doc(driverId).update({
                    isSuspended: true,
                    suspensionReason: `Bloqueo automático antifraude (Viaje ${rideId})`,
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                await logLedgerEvent({
                    eventType: 'user_suspended',
                    actorId: 'system_antifraud',
                    actorRole: 'admin',
                    targetId: driverId,
                    rideId,
                    metadata: { score, reason: flags[0] }
                });
            }
        }
    }
});

/**
 * [VamO PRO] GUARDIAN REAL-TIME SCAN v2.0
 */
export const guardianRealtimeScanV2 = onSchedule({
    schedule: "every 10 minutes", // Bajamos frecuencia para ahorrar recursos
    timeZone: "America/Argentina/Buenos_Aires",
    region: "us-central1"
}, async (event) => {
    const db = getDb();
    const config = await getAntifraudConfig();
    if (!config.enabled) return;

    const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);

    const activeRidesSnap = await db.collection('rides')
        .where('status', '==', 'in_progress')
        .get();

    for (const rideDoc of activeRidesSnap.docs) {
        const ride = rideDoc.data();
        const updatedAt = ride.updatedAt as Timestamp;

        if (updatedAt && updatedAt.toMillis() < tenMinutesAgo.toMillis()) {
            const flags = ["VIAJE_CONGELADO: Sin actividad reportada en >10 min."];
            await createFraudAlert({
                db,
                type: 'STATIONARY_IN_PROGRESS',
                severity: 'medium',
                score: 40,
                rideId: rideDoc.id,
                driverId: ride.driverId,
                passengerId: ride.passengerId,
                cityKey: ride.cityKey || 'global',
                reason: flags[0],
                evidence: { lastUpdate: updatedAt.toDate() }
            });
        }
    }
});

async function createFraudAlert(params: {
    db: admin.firestore.Firestore,
    type: string,
    severity: AntifraudAlertSeverity,
    score: number,
    rideId: string,
    driverId: string,
    passengerId: string,
    cityKey: string,
    reason: string,
    evidence: any
}) {
    const alertId = `alert_${params.type}_${params.rideId}`;
    const alertRef = params.db.collection('fraud_alerts').doc(alertId);
    
    // Evitar duplicados para el mismo viaje y tipo
    const existing = await alertRef.get();
    if (existing.exists) return;

    const { db, ...alertData } = params;
    const alert: FraudAlert = {
        id: alertId,
        ...alertData,
        status: 'open',
        createdAt: FieldValue.serverTimestamp()
    };

    await alertRef.set(alert);
    
    await logLedgerEvent({
        eventType: 'fraud_alert_created',
        actorId: 'system_guardian',
        actorRole: 'admin',
        rideId: params.rideId,
        driverId: params.driverId,
        passengerId: params.passengerId,
        cityKey: params.cityKey,
        metadata: { score: params.score, type: params.type }
    });

    logger.error(`[FRAUD_ALERT] ${params.type} (Score: ${params.score}) for ride ${params.rideId}`);
}

