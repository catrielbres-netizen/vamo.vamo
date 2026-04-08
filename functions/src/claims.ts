import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { Ride, UserProfile, FapClaim, FapCounter, FapType } from "./types";

import { getDb } from "./lib/firebaseAdmin";

// Module-level db removed to prevent initialization errors.

/**
 * [VamO PRO v1.0] Reportar un incidente al Fondo de Asistencia (F.A.P.)
 * 24h Max window, Express Drivers only, Unique claim per ride.
 */
export const createFapClaimV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión para reportar un incidente.');
    }

    const { rideId, type, description, evidenceUrls, requestedAmount } = request.data;

    if (!rideId || !type || !description) {
        throw new HttpsError('invalid-argument', 'Datos de reclamo incompletos. Se requiere rideId, tipo y descripción.');
    }

    const passengerId = request.auth.uid;

    try {
        const db = getDb();
        const result = await db.runTransaction(async (tx: admin.firestore.Transaction) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);

            if (!rideSnap.exists) throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data() as Ride;

            // 1. VALIDACIÓN: El usuario debe ser el pasajero del viaje
            if (rideData.passengerId !== passengerId) {
                throw new Error('Solo el pasajero del viaje puede iniciar un reclamo F.A.P.');
            }

            // 2. VALIDACIÓN: El viaje debe estar completado
            if (rideData.status !== 'completed' || !rideData.completedAt) {
                throw new Error('Solo se pueden reportar incidentes de viajes completados.');
            }

            // 3. VALIDACIÓN: Ventana de 24 horas (ESTRICTA)
            const completedAt = (rideData.completedAt as admin.firestore.Timestamp).toMillis();
            const now = Date.now();
            const hoursSinceCompletion = (now - completedAt) / (1000 * 60 * 60);

            if (hoursSinceCompletion > 24) {
                throw new Error('La ventana para reportar incidentes F.A.P. ha expirado (máximo 24 horas).');
            }

            // 4. VALIDACIÓN: Solo para conductores particulares / Express (v1.4)
            // Priorizamos los datos persistidos en el comprobante final
            const isFapEligible = rideData.completedRide?.fapEligible ?? false;
            let driverId = rideData.driverId;
            let driverSubtype = rideData.completedRide?.driverSubtype;

            if (rideData.completedRide) {
                if (!isFapEligible) {
                    throw new Error('Este viaje no es elegible para el Fondo de Asistencia VamO (ej: Conductor Profesional/Premium).');
                }
            } else {
                // Fallback para viajes legacy o si aún no se persistió (no debería pasar post-asistencia)
                if (!driverId) throw new Error('El viaje no tiene un conductor registrado.');

                const driverSnap = await tx.get(db.collection('users').doc(driverId));
                const driverData = driverSnap.data() as UserProfile;
                
                if (driverData.driverSubtype !== 'express') {
                    throw new Error('El Fondo de Asistencia VamO solo aplica a viajes realizados con conductores particulares (Express).');
                }
                const driverSubtype = driverData.driverSubtype || 'premium';
            }

            if (!driverId) throw new Error('No se pudo identificar al conductor del viaje.');
            if (!driverSubtype) throw new Error('No se pudo identificar la categoría del conductor.');

            // 5. VALIDACIÓN: Un solo reclamo por viaje
            const existingClaimsSnap = await tx.get(
                db.collection('fap_claims').where('rideId', '==', rideId).limit(1)
            );
            if (!existingClaimsSnap.empty) {
                throw new Error('Ya existe un reclamo en proceso o resuelto para este viaje.');
            }

            // 6. VALIDACIÓN: Un solo reclamo activo por pasajero
            const activeClaimsSnap = await tx.get(
                db.collection('fap_claims')
                    .where('passengerId', '==', passengerId)
                    .where('status', 'in', ['pending', 'reviewing', 'approved'])
                    .limit(1)
            );
            if (!activeClaimsSnap.empty) {
                throw new Error('Ya tienes un reclamo F.A.P. activo. Debes resolver el caso actual antes de abrir uno nuevo.');
            }

            // 7. GENERAR CASE ID ATÓMICO (FAP-YYYY-XXXXXX)
            const currentYear = new Date().getFullYear();
            const counterRef = db.collection('config').doc(`fap_counter_${currentYear}`);
            const counterSnap = await tx.get(counterRef);
            
            let lastNumber = 0;
            if (counterSnap.exists) {
                lastNumber = (counterSnap.data() as FapCounter).lastNumber;
            }

            const nextNumber = lastNumber + 1;
            const caseId = `FAP-${currentYear}-${nextNumber.toString().padStart(6, '0')}`;

            // 8. CREAR EL RECLAMO
            const claimRef = db.collection('fap_claims').doc();
            const newClaim: FapClaim = {
                id: claimRef.id,
                caseId,
                rideId,
                passengerId,
                driverId,
                status: 'pending',
                type: type as FapType,
                description,
                evidenceUrls: evidenceUrls || [],
                requestedAmount: requestedAmount || 0,
                rideSnapshot: {
                    origin: rideData.origin.address,
                    destination: rideData.destination.address,
                    totalFare: rideData.completedRide?.totalFare || 0,
                    completedAt: rideData.completedAt,
                    driverSubtype: driverSubtype,
                    city: rideData.city
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            tx.set(claimRef, newClaim);
            tx.set(counterRef, { year: currentYear, lastNumber: nextNumber }, { merge: true });

            return { success: true, caseId, id: claimRef.id };
        });

        return result;

    } catch (error: any) {
        logger.error(`[createFapClaimV1] Error para pasajero ${passengerId}:`, error.message);
        throw new HttpsError('internal', error.message || 'Error al procesar el reclamo.');
    }
});

/**
 * [VamO PRO v1.0] Revisión Administrativa de Reclamo F.A.P.
 * Solo Administradores.
 */
export const reviewFapClaimV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Acceso denegado.');
    }
    
    const { claimId, action, approvedAmount, adminNotes, rejectionReason } = request.data;
    
    if (!claimId || !['review', 'approve', 'reject'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Párametros de revisión inválidos.');
    }

    try {
        const db = getDb();
        await db.runTransaction(async (tx: admin.firestore.Transaction) => {
            const claimRef = db.collection('fap_claims').doc(claimId);
            const claimSnap = await tx.get(claimRef);
            
            if (!claimSnap.exists) throw new Error('Reclamo no encontrado.');
            const claimData = claimSnap.data() as FapClaim;

            if (['paid', 'cancelled'].includes(claimData.status)) {
                throw new Error('El reclamo ya está cerrado y no se puede modificar.');
            }

            const updates: Partial<FapClaim> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (action === 'review') {
                updates.status = 'reviewing';
                if (adminNotes) updates.adminNotes = adminNotes;
            } else if (action === 'approve') {
                if (typeof approvedAmount !== 'number' || approvedAmount <= 0) {
                    throw new Error('Se requiere un monto de aprobación válido.');
                }
                if (approvedAmount > 150000) {
                    throw new Error('El monto excede el tope máximo permitido por el fondo ($150.000).');
                }
                updates.status = 'approved';
                updates.approvedAmount = approvedAmount;
                if (adminNotes) updates.adminNotes = adminNotes;
                updates.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            } else if (action === 'reject') {
                if (!rejectionReason) throw new Error('Se requiere un motivo de rechazo.');
                updates.status = 'rejected';
                updates.rejectionReason = rejectionReason;
                updates.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            }

            tx.update(claimRef, updates);
        });

        return { success: true };
    } catch (error: any) {
        logger.error(`[reviewFapClaimV1] Error en revisión:`, error.message);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * [VamO PRO v1.0] Procesar Pago de Reclamo F.A.P.
 * Solo Administradores. Registra el movimiento en el Ledger.
 */
export const processFapPaymentV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Acceso denegado.');
    }
    
    const { claimId } = request.data;
    if (!claimId) throw new HttpsError('invalid-argument', 'Falta el ID del reclamo.');

    try {
        const db = getDb();
        await db.runTransaction(async (tx: admin.firestore.Transaction) => {
            const claimRef = db.collection('fap_claims').doc(claimId);
            const claimSnap = await tx.get(claimRef);
            
            if (!claimSnap.exists) throw new Error('Reclamo no encontrado.');
            const claimData = claimSnap.data() as FapClaim;

            if (claimData.status !== 'approved') {
                throw new Error('Solo se pueden procesar pagos para reclamos en estado "approved".');
            }
            
            if (!claimData.approvedAmount || claimData.approvedAmount <= 0) {
                throw new Error('El reclamo no tiene un monto aprobado válido.');
            }

            // 1. REGISTRAR TRANSACCIÓN EN EL LEDGER
            const txRef = db.collection('platform_transactions').doc(`fap_payout_${claimId}`);
            
            tx.set(txRef, {
                claimId,
                caseId: claimData.caseId,
                rideId: claimData.rideId,
                passengerId: claimData.passengerId,
                amount: -claimData.approvedAmount, // Débito a la reserva FAP de la plataforma
                type: 'fap_claim_payout',
                note: `Pago Asistencia F.A.P. Caso ${claimData.caseId}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                systemVersion: 'v1.0_fap_claims',
            });

            // 2. ACTUALIZAR ESTADO DEL RECLAMO
            tx.update(claimRef, {
                status: 'paid',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                paymentTxId: txRef.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true };
    } catch (error: any) {
        logger.error(`[processFapPaymentV1] Error en pago:`, error.message);
        throw new HttpsError('internal', error.message);
    }
});
