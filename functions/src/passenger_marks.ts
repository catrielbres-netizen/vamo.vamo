import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { logAuditAction, logLedgerEvent } from "./lib/audit";
import { PassengerDriverMark, PassengerLifecycle } from "./types";

/**
 * [VamO PRO] Create Passenger Driver Mark
 * Allows a driver to flag a passenger privately.
 */
export const createPassengerDriverMarkV1 = onCall(async (request) => {
    // 1. Auth & Role Validation
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Debes estar autenticado.");
    }
    const driverId = request.auth.uid;
    const isDriver = request.auth.token.r === 'driver';
    if (!isDriver) {
        throw new HttpsError("permission-denied", "Solo conductores pueden crear marcas.");
    }

    const { rideId, type, reason } = request.data;
    if (!rideId || !type || !reason) {
        throw new HttpsError("invalid-argument", "rideId, type y reason son obligatorios.");
    }

    if (reason.trim().length === 0) {
        throw new HttpsError("invalid-argument", "La razón no puede estar vacía.");
    }

    const allowedTypes = [
        'no_show', 'aggressive_behavior', 'unsafe_behavior', 
        'payment_problem', 'wrong_location', 'repeated_cancellation', 'other'
    ];
    if (!allowedTypes.includes(type)) {
        throw new HttpsError("invalid-argument", "Tipo de marca no válido.");
    }

    const db = getDb();
    
    // 2. Ride Validation
    const rideSnap = await db.collection('rides').doc(rideId).get();
    if (!rideSnap.exists) {
        throw new HttpsError("not-found", "El viaje no existe.");
    }
    const rideData = rideSnap.data()!;
    if (rideData.driverId !== driverId) {
        throw new HttpsError("permission-denied", "Solo el conductor asignado puede marcar al pasajero.");
    }

    const passengerId = rideData.passengerId;
    const cityKey = rideData.cityKey || 'global';

    // 3. Risk Weight Mapping
    const riskWeights: Record<string, number> = {
        'no_show': 15,
        'aggressive_behavior': 50,
        'unsafe_behavior': 40,
        'payment_problem': 30,
        'wrong_location': 10,
        'repeated_cancellation': 20,
        'other': 10
    };
    const riskWeight = riskWeights[type] || 10;

    const markId = `MARK_${Date.now()}_${driverId.substring(0, 5)}`;
    const mark: PassengerDriverMark = {
        id: markId,
        passengerId,
        driverId,
        rideId,
        cityKey,
        type: type as any,
        reason,
        createdAt: FieldValue.serverTimestamp(),
        status: 'active',
        source: 'driver_app',
        riskWeight
    };

    try {
        await db.runTransaction(async (tx) => {
            const markRef = db.collection('passenger_driver_marks').doc(markId);
            const lifecycleRef = db.collection('passenger_lifecycle').doc(passengerId);
            
            // Create the mark
            tx.set(markRef, mark);

            // Update Lifecycle Summary
            const lifecycleSnap = await tx.get(lifecycleRef);
            const now = FieldValue.serverTimestamp();
            
            if (lifecycleSnap.exists) {
                const data = lifecycleSnap.data() as PassengerLifecycle;
                const newTotal = (data.totalDriverMarks || 0) + 1;
                // Simple trustScore calculation: Starts at 100, drops by riskWeight
                const newTrustScore = Math.max(0, (data.trustScore || 100) - riskWeight);
                
                tx.update(lifecycleRef, {
                    totalDriverMarks: newTotal,
                    lastDriverMarkAt: now,
                    lastDriverMarkType: type,
                    trustScore: newTrustScore,
                    updatedAt: now
                });
            } else {
                tx.set(lifecycleRef, {
                    passengerId,
                    totalDriverMarks: 1,
                    lastDriverMarkAt: now,
                    lastDriverMarkType: type,
                    trustScore: Math.max(0, 100 - riskWeight),
                    updatedAt: now
                });
            }
        });

        // 4. Audit & Ledger (Outside transaction for safety)
        await logLedgerEvent({
            eventType: 'passenger_marked_by_driver',
            actorId: driverId,
            actorRole: 'driver',
            targetId: passengerId,
            rideId: rideId,
            cityKey,
            metadata: { type, riskWeight }
        });

        await logAuditAction({
            actorId: driverId,
            actorRole: 'driver',
            action: 'CREATE_PASSENGER_MARK',
            collection: 'passenger_driver_marks',
            documentId: markId,
            after: mark,
            riskScore: riskWeight,
            source: 'function'
        });

        return { success: true, markId };

    } catch (error: any) {
        logger.error(`[PASSENGER_MARK_ERROR] Failed for ride ${rideId}:`, error);
        throw new HttpsError("internal", "Error al procesar la marca.");
    }
});
