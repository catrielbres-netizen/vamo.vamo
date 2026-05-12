import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as geofire from "geofire-common";
import { getDb } from "./firebaseAdmin";
import { Ride, RideTrackingPoint } from "../types";
import { logLedgerEvent } from "./audit";
import { processFraudAlertDecision } from "./antifraudDecisionEngine";

/**
 * [VamO PRO] Analyze Ride Path
 * Compares real GPS data against estimated path to detect fraud or anomalies.
 */
export async function analyzeRidePath(rideId: string, ride: Ride) {
    const isSimulation = !!(ride as any).isSimulation;
    const isTestDriver = !!(ride as any).isTestDriver;
    const db = getDb();
    const cityKey = ride.cityKey;

    try {
        const pointsSnap = await db.collection('ride_tracking')
            .doc(rideId)
            .collection('points')
            .orderBy('timestamp', 'asc')
            .get();

        const points = pointsSnap.docs.map(doc => doc.data() as RideTrackingPoint);
        
        let realDistanceMeters = 0;
        let maxSpeedDetected = 0;
        const anomalies: string[] = [];

        // 1. Detect Missing GPS
        if (points.length === 0) {
            await createFraudAlert(rideId, ride, 'gps_missing', 70, 'No GPS points captured during ride.');
            return { success: true, analyzed: true, alert: 'gps_missing' };
        }

        // 2. Calculate Real Distance and Speeds
        for (let i = 1; i < points.length; i++) {
            const p1 = points[i-1];
            const p2 = points[i];
            
            const dist = geofire.distanceBetween([p1.lat, p1.lng], [p2.lat, p2.lng]) * 1000;
            realDistanceMeters += dist;

            const t1 = (p1.timestamp as Timestamp).toMillis();
            const t2 = (p2.timestamp as Timestamp).toMillis();
            const timeSeconds = (t2 - t1) / 1000;

            if (timeSeconds > 0) {
                const speedKmh = (dist / timeSeconds) * 3.6;
                if (speedKmh > maxSpeedDetected) maxSpeedDetected = speedKmh;
                
                // 3. Detect Impossible Speed (> 180 km/h for regular cars)
                if (speedKmh > 180) {
                    anomalies.push(`impossible_speed: ${speedKmh.toFixed(1)} km/h`);
                }
            }
        }

        // 4. Compare with Estimated
        const estimatedDistance = ride.pricing?.estimatedDistanceMeters || 0;
        const distanceRatio = estimatedDistance > 0 ? realDistanceMeters / estimatedDistance : 0;

        // 5. Detect Ultra Short Trip (e.g. < 200m)
        if (realDistanceMeters < 200 && ride.status === 'completed') {
            anomalies.push('suspicious_short_trip');
        }

        // 6. Detect Ghost Ride (Distance 0 or nearly 0)
        if (realDistanceMeters < 50) {
            anomalies.push('ghost_ride');
        }

        // 7. Route Anomaly (e.g. real distance is < 30% of estimated)
        if (estimatedDistance > 500 && distanceRatio < 0.3) {
            anomalies.push('route_anomaly');
        }

        // 8. Origin/Dest same (Sanity check)
        const originDist = geofire.distanceBetween(
            [ride.origin.lat, ride.origin.lng],
            [ride.destination.lat, ride.destination.lng]
        ) * 1000;
        if (originDist < 20) {
            anomalies.push('origin_destination_same');
        }

        // Create Alerts if anomalies found
        if (anomalies.length > 0) {
            for (const anomaly of anomalies) {
                const type = anomaly.split(':')[0] as any;
                await createFraudAlert(rideId, ride, type, 50, `Detected: ${anomaly}`);
            }
        }

        // Log Analysis completion
        await logLedgerEvent({
            eventType: 'ride_tracking_analyzed',
            actorId: 'system',
            actorRole: 'admin',
            rideId,
            cityKey,
            metadata: {
                realDistanceMeters,
                estimatedDistance,
                maxSpeedDetected,
                pointsCount: points.length,
                anomalies
            }
        });

        return { 
            success: true, 
            realDistanceMeters, 
            anomaliesCount: anomalies.length 
        };

    } catch (error) {
        logger.error(`[GUARDIAN_ANALYSIS_ERROR] Ride ${rideId}:`, error);
        return { success: false, error };
    }
}

async function createFraudAlert(rideId: string, ride: Ride, type: string, score: number, reason: string) {
    const isSimulation = !!(ride as any).isSimulation;
    const isTestDriver = !!(ride as any).isTestDriver;
    const isTestPassenger = typeof ride.passengerId === 'string' && ride.passengerId.startsWith('test_');
    const excludedFromDecisionEngine = isSimulation || isTestDriver || isTestPassenger;
    const db = getDb();
    const alertId = `alt_${type}_${rideId}_${Date.now()}`;
    
    const alert = {
        id: alertId,
        type,
        severity: score > 60 ? 'high' : 'medium',
        rideId,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        cityKey: ride.cityKey,
        score,
        reason,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        mode: 'monitor',
        // Simulation / test flags — used by Decision Engine guard
        isSimulation,
        isTestDriver,
        excludedFromDecisionEngine
    };

    await db.collection('fraud_alerts').doc(alertId).set(alert);
    
    // Trigger Decision Engine
    await processFraudAlertDecision(alertId, alert);

    await logLedgerEvent({
        eventType: 'fraud_alert_created',
        actorId: 'system',
        actorRole: 'admin',
        rideId,
        cityKey: ride.cityKey,
        metadata: { alertType: type, score }
    });
}
