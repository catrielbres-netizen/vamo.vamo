import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { Ride, UserProfile, FapClaim, FapCounter, FapType, FapTimelineEvent } from "./types";

import { getDb } from "./lib/firebaseAdmin";
import { addFunds } from "./lib/wallet";
import { sendNotification } from "./handlers";

/**
 * [VamO PRO] Professional Antifraud Helper for F.A.P.
 * Sophisticated weighted scoring model.
 */
async function validateFapAntifraud(db: admin.firestore.Firestore, rideData: Ride, passengerId: string) {
    const flags: string[] = [];
    let score = 0;

    // 1. RIDE CONTEXT (Weight: 50)
    const fraudIncidentsSnap = await db.collection('fraud_incidents')
        .where('rideId', '==', rideData.id)
        .get();
    
    if (!fraudIncidentsSnap.empty) {
        flags.push("RIDE_HAS_FRAUD_INCIDENT");
        score += 50;
    }

    // 2. VELOCITY & METRICS (Weight: 30)
    const comp = rideData.completedRide;
    if (comp) {
        if ((comp.distanceMeters || 0) < 500 && (comp.durationSeconds || 0) < 120) {
            flags.push("SUSPICIOUS_SHORT_TRIP");
            score += 30;
        }
    }

    // 3. RECURRENCE (Weight: 20 per incident)
    const lastMonth = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const recentClaimsSnap = await db.collection('fap_claims')
        .where('passengerId', '==', passengerId)
        .where('createdAt', '>=', lastMonth)
        .get();

    if (recentClaimsSnap.size >= 1) {
        flags.push(`RECURRENCE_PASSENGER: ${recentClaimsSnap.size} recently`);
        score += Math.min(40, 20 * recentClaimsSnap.size);
    }

    // 4. COLLUSION CHECK (Weight: 40)
    const samePairClaimsSnap = await db.collection('fap_claims')
        .where('passengerId', '==', passengerId)
        .where('driverId', '==', rideData.driverId)
        .get();
    
    if (samePairClaimsSnap.size >= 1) {
        flags.push("REPEATED_DRIVER_PASSENGER_PAIR");
        score += 40;
    }

    // 5. IDENTITY VERIFICATION (Weight: 30 if NOT verified)
    const passengerSnap = await db.collection('users').doc(passengerId).get();
    const passenger = passengerSnap.data() as UserProfile;
    
    if (passenger?.identityStatus === 'approved') {
        flags.push("IDENTITY_VERIFIED_TRUST");
        score -= 20; // Bonus for verified users
    } else {
        flags.push("IDENTITY_NOT_VERIFIED");
        score += 30; // Risk for unverified users
    }

    return { flags, score: Math.max(0, Math.min(100, score)) };
}

/**
 * [VamO PRO v3.0] Multi-Level F.A.P. Claim System
 * Progressive validation by risk level.
 */
export const createFapClaimV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { 
        rideId, 
        type, 
        description, 
        evidenceUrls = [], 
        requestedAmount = 0,
        deviceInfo = {}
    } = request.data;

    if (!rideId || !type || !description) {
        throw new HttpsError('invalid-argument', 'rideId, type y descripción son obligatorios.');
    }

    const passengerId = request.auth.uid;
    const db = getDb();

    // 1. DETECTAR NIVEL DE RIESGO
    let level: 1 | 2 | 3 = 1;
    if (["overcharge", "vandalism"].includes(type)) level = 2;
    if (["accident", "robbery", "medical"].includes(type)) level = 3;

    try {
        const result = await db.runTransaction(async (tx: admin.firestore.Transaction) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);

            if (!rideSnap.exists) throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data() as Ride;

            if (rideData.passengerId !== passengerId) throw new Error('Usuario no autorizado para este viaje.');
            if (rideData.status !== 'completed') throw new Error('Solo viajes completados.');

            // [VamO PRO] Prevent Duplicate Claims
            const existingClaimsSnap = await db.collection('fap_claims')
                .where('rideId', '==', rideId)
                .limit(1)
                .get();
            if (!existingClaimsSnap.empty) {
                throw new Error('Ya existe un reclamo activo o resuelto para este viaje.');
            }

            // 2. VALIDAR VENTANA 24H (Solo para Nivel 1 y 2, Nivel 3 permite flexibilidad manual)
            const completedAt = (rideData.completedAt as Timestamp).toMillis();
            const hoursSinceCompletion = (Date.now() - completedAt) / (1000 * 60 * 60);
            if (hoursSinceCompletion > 24 && level < 3) {
                throw new Error('La ventana de 24h ha expirado.');
            }

            // [VamO PRO] REQUIRE IDENTITY FOR LEVEL 3
            const passengerSnap = await tx.get(db.collection('users').doc(passengerId));
            const passengerData = passengerSnap.data() as UserProfile;

            if (level === 3 && passengerData.identityStatus !== 'approved') {
                throw new Error('La verificación de identidad es obligatoria para reportar incidentes de Nivel 3 (Accidentes/Robos). Por favor, verifícate en tu perfil primero.');
            }

            // 3. IDENTIFICAR REQUISITOS FALTANTES
            const missingRequirements: string[] = [];
            if (level === 3) {
                if (evidenceUrls.length < 1) missingRequirements.push('evidence_photos');
                if (description.length < 50) missingRequirements.push('detailed_description');
            }

            const requirementsMet = missingRequirements.length === 0;
            const status: any = requirementsMet ? 'pending' : 'pending_info';

            // 4. GENERAR CASE ID
            const currentYear = new Date().getFullYear();
            const counterRef = db.collection('config').doc(`fap_counter_${currentYear}`);
            const counterSnap = await tx.get(counterRef);
            const nextNumber = (counterSnap.exists ? (counterSnap.data() as any).lastNumber : 0) + 1;
            const caseNumber = `FAP-${currentYear}-${nextNumber.toString().padStart(6, '0')}`;

            // 5. ANTIFRAUDE
            const { flags, score } = await validateFapAntifraud(db, { ...rideData, id: rideId }, passengerId);

            // 6. SNAPSHOTS
            const driverSnap = await tx.get(db.collection('users').doc(rideData.driverId!));
            const driverData = driverSnap.data() as UserProfile;

            const claimRef = db.collection('fap_claims').doc();
            const newClaim: any = {
                id: claimRef.id,
                caseId: caseNumber,
                rideId,
                passengerId,
                passengerNameSnapshot: passengerData.name || 'Pasajero',
                driverId: rideData.driverId,
                driverNameSnapshot: driverData.name || 'Conductor',
                driverSubtypeSnapshot: rideData.completedRide?.driverSubtype || 'express',
                cityKey: rideData.cityKey || rideData.operatingAreaId || 'global',
                status,
                level,
                type,
                description,
                evidenceUrls,
                evidenceIsPrivate: level === 3,
                requestedAmount,
                fraudFlags: flags,
                validationScore: score,
                compliance: {
                    requirementsMet,
                    missingRequirements,
                    submittedAt: requirementsMet ? Timestamp.now() : null
                },
                deviceInfo: {
                    userAgent: deviceInfo.userAgent || 'unknown',
                    ip: deviceInfo.ip || 'unknown',
                    platform: deviceInfo.platform || 'unknown'
                },
                timeline: [{
                    id: 'event_0',
                    action: 'CASE_CREATED',
                    actorId: passengerId,
                    actorName: passengerData.name || 'Pasajero',
                    actorRole: 'passenger',
                    timestamp: Timestamp.now(),
                    note: `Reclamo Nivel ${level} iniciado. Estado: ${status}`
                }],
                rideSnapshot: {
                    origin: rideData.origin?.address || 'N/A',
                    destination: rideData.destination?.address || 'N/A',
                    totalFare: rideData.completedRide?.totalFare || 0,
                    completedAt: rideData.completedAt || null,
                    driverSubtype: rideData.completedRide?.driverSubtype || 'express',
                    city: rideData.city || 'N/A',
                    cityKey: rideData.cityKey || rideData.operatingAreaId || 'global',
                    serviceType: rideData.serviceType || 'express',
                    distanceMeters: rideData.completedRide?.distanceMeters || 0,
                    durationSeconds: rideData.completedRide?.durationSeconds || 0
                },
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                systemVersion: 'v3.0_progressive'
            };

            tx.set(claimRef, newClaim);
            tx.set(counterRef, { year: currentYear, lastNumber: nextNumber }, { merge: true });

            return { success: true, caseId: caseNumber, id: claimRef.id, status };
        });

        return result;
    } catch (error: any) {
        logger.error(`[createFapClaimV1] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al crear el reclamo.');
    }
});

/**
 * [VamO PRO v2.0] Revisión Administrativa de Reclamo F.A.P.
 * Solo Administradores.
 */
export const reviewAssistanceCaseV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acceso denegado.');
    const db = getDb();
    const uid = request.auth.uid;
    const { claimId, action, adminNotes } = request.data;
    
    if (!claimId || !['review', 'escalate'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Parámetros de revisión inválidos.');
    }

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() as UserProfile;

    await db.runTransaction(async (tx) => {
        const claimRef = db.collection('fap_claims').doc(claimId);
        const claimSnap = await tx.get(claimRef);
        if (!claimSnap.exists) throw new Error('Caso no encontrado.');
        const claim = claimSnap.data() as FapClaim;

        if (['paid', 'rejected', 'cancelled'].includes(claim.status)) {
            throw new Error('El caso ya está cerrado.');
        }

        const newStatus: FapClaim['status'] = action === 'escalate' ? 'escalated' : 'reviewing';
        
        const timelineCount = (claim.timeline || []).length;
        const event: FapTimelineEvent = {
            id: `event_${timelineCount}`,
            action: action === 'escalate' ? 'CASE_ESCALATED' : 'CASE_REVIEWED',
            actorId: uid,
            actorName: user.name || 'Admin',
            actorRole: user.role,
            timestamp: Timestamp.now(),
            note: adminNotes || (action === 'escalate' ? 'Caso escalado para revisión superior.' : 'Caso en revisión manual.')
        };

        tx.update(claimRef, {
            status: newStatus,
            adminNotes: adminNotes || claim.adminNotes,
            timeline: FieldValue.arrayUnion(event),
            updatedAt: FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});

/**
 * [VamO PRO v2.0] Resolución Final de Reclamo F.A.P.
 * Ejecuta pagos o créditos y cierra el caso.
 */
export const resolveAssistanceCaseV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acceso denegado.');
    const db = getDb();
    const uid = request.auth.uid;
    const { claimId, resolutionType, amount, reason, note } = request.data;

    if (!claimId || !resolutionType) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros de resolución.');
    }

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() as UserProfile;

    if (user.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo administradores pueden resolver casos F.A.P.');
    }

    try {
        await db.runTransaction(async (tx) => {
            const claimRef = db.collection('fap_claims').doc(claimId);
            const claimSnap = await tx.get(claimRef);
            if (!claimSnap.exists) throw new Error('Caso no encontrado.');
            const claim = claimSnap.data() as FapClaim;

            if (['paid', 'rejected', 'cancelled'].includes(claim.status)) {
                throw new Error('El caso ya está resuelto.');
            }

            const updates: Partial<FapClaim> = {
                resolvedAt: FieldValue.serverTimestamp(),
                resolvedBy: uid,
                resolvedByName: user.name || 'Admin',
                resolutionType,
                updatedAt: FieldValue.serverTimestamp()
            };

            let eventAction = 'CASE_RESOLVED';
            let eventNote = note || `Resolución: ${resolutionType}`;

            if (resolutionType === 'rejection') {
                if (!reason) throw new Error('Se requiere motivo de rechazo.');
                updates.status = 'rejected';
                updates.rejectionReason = reason;
                eventAction = 'CASE_REJECTED';
                eventNote = reason;
            } else if (resolutionType === 'economic' || resolutionType === 'credit') {
                if (!amount || amount <= 0) throw new Error('Monto de compensación inválido.');
                if (amount > 150000) throw new Error('Monto excede el tope de $150.000.');

                updates.status = resolutionType === 'economic' ? 'approved' : 'paid';
                updates.approvedAmount = amount;

                // 1. Registrar en Ledger de Plataforma
                const platformTxRef = db.collection('platform_transactions').doc(`fap_res_${claimId}`);
                tx.set(platformTxRef, {
                    claimId,
                    caseId: claim.caseId,
                    amount: -amount,
                    type: 'fap_claim_payout',
                    cityKey: claim.cityKey || 'global',
                    note: `Compensación F.A.P. ${resolutionType}: ${claim.caseId}`,
                    createdAt: FieldValue.serverTimestamp(),
                    systemVersion: 'v2.0_fap'
                });

                // 2. Si es crédito VamO Pay, acreditar inmediatamente
                if (resolutionType === 'credit') {
                    await addFunds(
                        claim.passengerId, 
                        amount, 
                        'fap_compensation', 
                        `Crédito Asistencia F.A.P. Caso ${claim.caseId}`, 
                        tx, 
                        `fap_credit_${claimId}`
                    );
                    updates.paymentTxId = `fap_credit_${claimId}`;
                    updates.paidAt = FieldValue.serverTimestamp();
                }
            } else {
                // Asistencia operativa
                updates.status = 'paid'; // Marcamos como cerrado/completado
            }

            const timelineCount = (claim.timeline || []).length;
            const event: FapTimelineEvent = {
                id: `event_${timelineCount}`,
                action: eventAction,
                actorId: uid,
                actorName: user.name || 'Admin',
                actorRole: user.role,
                timestamp: Timestamp.now(),
                note: eventNote,
                metadata: { 
                    resolutionType, 
                    amount: amount || 0 
                }
            };

            tx.update(claimRef, {
                ...updates,
                timeline: FieldValue.arrayUnion(event)
            });
        });

        // 3. NOTIFICAR AL PASAJERO (Fuera de la transacción para no bloquear)
        try {
            const db = getDb();
            const claimSnap = await db.collection('fap_claims').doc(claimId).get();
            const claim = claimSnap.data() as FapClaim;

            if (resolutionType === 'rejection') {
                await sendNotification(
                    claim.passengerId,
                    "Novedades sobre tu reclamo",
                    `El equipo de auditoría ha finalizado la revisión de tu caso ${claim.caseId}.`,
                    `/dashboard/history`
                );
            } else {
                await sendNotification(
                    claim.passengerId,
                    "¡Reclamo Aprobado!",
                    `Se han acreditado $${amount} en tu billetera VamO Pay por el caso ${claim.caseId}.`,
                    `/dashboard/wallet`
                );
            }
        } catch (error) {
            logger.error("Error al enviar notificación de resolución FAP:", error);
        }

        return { success: true };
    } catch (error: any) {
        logger.error(`[resolveAssistanceCaseV1] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al resolver el reclamo.');
    }
});

/**
 * [VamO PRO v3.0] Submit evidence for an existing F.A.P. claim.
 * Moves claim from pending_info to pending if requirements are met.
 */
export const submitFapEvidenceV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acceso denegado.');
    const db = getDb();
    const uid = request.auth.uid;
    const { claimId, evidenceUrls, detailedDescription } = request.data;

    if (!claimId) throw new HttpsError('invalid-argument', 'claimId es obligatorio.');

    await db.runTransaction(async (tx) => {
        const claimRef = db.collection('fap_claims').doc(claimId);
        const claimSnap = await tx.get(claimRef);
        if (!claimSnap.exists) throw new Error('Reclamo no encontrado.');
        const claim = claimSnap.data() as FapClaim;

        if (claim.passengerId !== uid) throw new Error('No autorizado.');
        if (claim.status !== 'pending_info') throw new Error('Este reclamo no requiere más información.');

        const updatedEvidence = [...(claim.evidenceUrls || []), ...(evidenceUrls || [])];
        const updatedDescription = detailedDescription || claim.description;

        // Re-evaluar requisitos
        const missingRequirements: string[] = [];
        if (claim.level === 3) {
            if (updatedEvidence.length < 1) missingRequirements.push('evidence_photos');
            if (updatedDescription.length < 50) missingRequirements.push('detailed_description');
        }

        const requirementsMet = missingRequirements.length === 0;
        const newStatus = requirementsMet ? 'pending' : 'pending_info';

        const event: FapTimelineEvent = {
            id: `event_${claim.timeline.length}`,
            action: 'EVIDENCE_SUBMITTED',
            actorId: uid,
            actorName: claim.passengerNameSnapshot,
            actorRole: 'passenger',
            timestamp: Timestamp.now(),
            note: requirementsMet ? 'Requisitos cumplidos. Pasando a revisión.' : 'Información adicional enviada. Faltan requisitos.'
        };

        tx.update(claimRef, {
            evidenceUrls: updatedEvidence,
            description: updatedDescription,
            status: newStatus,
            compliance: {
                requirementsMet,
                missingRequirements,
                submittedAt: requirementsMet ? Timestamp.now() : claim.compliance?.submittedAt
            },
            timeline: FieldValue.arrayUnion(event),
            updatedAt: FieldValue.serverTimestamp()
        });
    });

    return { success: true };
});

export const reviewFapClaimV1 = reviewAssistanceCaseV1;
export const processFapPaymentV1 = resolveAssistanceCaseV1;
