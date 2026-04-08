"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processFapPaymentV1 = exports.reviewFapClaimV1 = exports.createFapClaimV1 = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const firebaseAdmin_1 = require("./lib/firebaseAdmin");
// Module-level db removed to prevent initialization errors.
/**
 * [VamO PRO v1.0] Reportar un incidente al Fondo de Asistencia (F.A.P.)
 * 24h Max window, Express Drivers only, Unique claim per ride.
 */
exports.createFapClaimV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión para reportar un incidente.');
    }
    const { rideId, type, description, evidenceUrls, requestedAmount } = request.data;
    if (!rideId || !type || !description) {
        throw new https_1.HttpsError('invalid-argument', 'Datos de reclamo incompletos. Se requiere rideId, tipo y descripción.');
    }
    const passengerId = request.auth.uid;
    try {
        const db = (0, firebaseAdmin_1.getDb)();
        const result = await db.runTransaction(async (tx) => {
            const rideRef = db.collection('rides').doc(rideId);
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists)
                throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data();
            // 1. VALIDACIÓN: El usuario debe ser el pasajero del viaje
            if (rideData.passengerId !== passengerId) {
                throw new Error('Solo el pasajero del viaje puede iniciar un reclamo F.A.P.');
            }
            // 2. VALIDACIÓN: El viaje debe estar completado
            if (rideData.status !== 'completed' || !rideData.completedAt) {
                throw new Error('Solo se pueden reportar incidentes de viajes completados.');
            }
            // 3. VALIDACIÓN: Ventana de 24 horas (ESTRICTA)
            const completedAt = rideData.completedAt.toMillis();
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
            }
            else {
                // Fallback para viajes legacy o si aún no se persistió (no debería pasar post-asistencia)
                if (!driverId)
                    throw new Error('El viaje no tiene un conductor registrado.');
                const driverSnap = await tx.get(db.collection('users').doc(driverId));
                const driverData = driverSnap.data();
                if (driverData.driverSubtype !== 'express') {
                    throw new Error('El Fondo de Asistencia VamO solo aplica a viajes realizados con conductores particulares (Express).');
                }
                const driverSubtype = driverData.driverSubtype || 'premium';
            }
            if (!driverId)
                throw new Error('No se pudo identificar al conductor del viaje.');
            if (!driverSubtype)
                throw new Error('No se pudo identificar la categoría del conductor.');
            // 5. VALIDACIÓN: Un solo reclamo por viaje
            const existingClaimsSnap = await tx.get(db.collection('fap_claims').where('rideId', '==', rideId).limit(1));
            if (!existingClaimsSnap.empty) {
                throw new Error('Ya existe un reclamo en proceso o resuelto para este viaje.');
            }
            // 6. VALIDACIÓN: Un solo reclamo activo por pasajero
            const activeClaimsSnap = await tx.get(db.collection('fap_claims')
                .where('passengerId', '==', passengerId)
                .where('status', 'in', ['pending', 'reviewing', 'approved'])
                .limit(1));
            if (!activeClaimsSnap.empty) {
                throw new Error('Ya tienes un reclamo F.A.P. activo. Debes resolver el caso actual antes de abrir uno nuevo.');
            }
            // 7. GENERAR CASE ID ATÓMICO (FAP-YYYY-XXXXXX)
            const currentYear = new Date().getFullYear();
            const counterRef = db.collection('config').doc(`fap_counter_${currentYear}`);
            const counterSnap = await tx.get(counterRef);
            let lastNumber = 0;
            if (counterSnap.exists) {
                lastNumber = counterSnap.data().lastNumber;
            }
            const nextNumber = lastNumber + 1;
            const caseId = `FAP-${currentYear}-${nextNumber.toString().padStart(6, '0')}`;
            // 8. CREAR EL RECLAMO
            const claimRef = db.collection('fap_claims').doc();
            const newClaim = {
                id: claimRef.id,
                caseId,
                rideId,
                passengerId,
                driverId,
                status: 'pending',
                type: type,
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
    }
    catch (error) {
        logger.error(`[createFapClaimV1] Error para pasajero ${passengerId}:`, error.message);
        throw new https_1.HttpsError('internal', error.message || 'Error al procesar el reclamo.');
    }
});
/**
 * [VamO PRO v1.0] Revisión Administrativa de Reclamo F.A.P.
 * Solo Administradores.
 */
exports.reviewFapClaimV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Acceso denegado.');
    }
    const { claimId, action, approvedAmount, adminNotes, rejectionReason } = request.data;
    if (!claimId || !['review', 'approve', 'reject'].includes(action)) {
        throw new https_1.HttpsError('invalid-argument', 'Párametros de revisión inválidos.');
    }
    try {
        const db = (0, firebaseAdmin_1.getDb)();
        await db.runTransaction(async (tx) => {
            const claimRef = db.collection('fap_claims').doc(claimId);
            const claimSnap = await tx.get(claimRef);
            if (!claimSnap.exists)
                throw new Error('Reclamo no encontrado.');
            const claimData = claimSnap.data();
            if (['paid', 'cancelled'].includes(claimData.status)) {
                throw new Error('El reclamo ya está cerrado y no se puede modificar.');
            }
            const updates = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (action === 'review') {
                updates.status = 'reviewing';
                if (adminNotes)
                    updates.adminNotes = adminNotes;
            }
            else if (action === 'approve') {
                if (typeof approvedAmount !== 'number' || approvedAmount <= 0) {
                    throw new Error('Se requiere un monto de aprobación válido.');
                }
                if (approvedAmount > 150000) {
                    throw new Error('El monto excede el tope máximo permitido por el fondo ($150.000).');
                }
                updates.status = 'approved';
                updates.approvedAmount = approvedAmount;
                if (adminNotes)
                    updates.adminNotes = adminNotes;
                updates.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            }
            else if (action === 'reject') {
                if (!rejectionReason)
                    throw new Error('Se requiere un motivo de rechazo.');
                updates.status = 'rejected';
                updates.rejectionReason = rejectionReason;
                updates.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
            }
            tx.update(claimRef, updates);
        });
        return { success: true };
    }
    catch (error) {
        logger.error(`[reviewFapClaimV1] Error en revisión:`, error.message);
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * [VamO PRO v1.0] Procesar Pago de Reclamo F.A.P.
 * Solo Administradores. Registra el movimiento en el Ledger.
 */
exports.processFapPaymentV1 = (0, https_1.onCall)({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Acceso denegado.');
    }
    const { claimId } = request.data;
    if (!claimId)
        throw new https_1.HttpsError('invalid-argument', 'Falta el ID del reclamo.');
    try {
        const db = (0, firebaseAdmin_1.getDb)();
        await db.runTransaction(async (tx) => {
            const claimRef = db.collection('fap_claims').doc(claimId);
            const claimSnap = await tx.get(claimRef);
            if (!claimSnap.exists)
                throw new Error('Reclamo no encontrado.');
            const claimData = claimSnap.data();
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
    }
    catch (error) {
        logger.error(`[processFapPaymentV1] Error en pago:`, error.message);
        throw new https_1.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=claims.js.map