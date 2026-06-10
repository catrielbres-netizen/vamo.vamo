import * as admin from "firebase-admin";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firebaseAdmin";
import { SharedRideRequest, UserProfile, Place, SharedRideGroup, Ride, PricingConfig, SharedRideFeatureConfig } from "./types";
import { evaluateSharedRouteCompatibility, getDistanceM } from "./lib/sharedCompatibility";
import { calculateSharedPricing } from "./lib/sharedPricing";
import { addWalletMovements } from "./lib/wallet";
import { getPricingConfig } from "./handlers";
import { normalizeCityKey } from "./lib/city";
import { resolveActiveSharedRideState } from "./lib/sharedCleanup";
import { findNextDriverAndCreateOffer } from "./rides";
import { buildSharedPassengerGroupEntry, assertSharedPassengersHaveRequestIds, assertOrderedStopsHaveRequestIds } from "./lib/sharedHelpers";

/**
 * [VamO PRO] Full Shared Ride Cancellation Helper
 * Ensures Ride, Group, Requests and ALL participants are cleared.
 */
export async function performFullSharedRideCancellation(
    db: FirebaseFirestore.Firestore,
    tx: FirebaseFirestore.Transaction,
    rideId: string,
    groupId: string,
    initiatorId: string,
    reason: string = 'shared_search_cancelled_by_passenger'
) {
    const rideRef = db.doc(`rides/${rideId}`);
    const groupRef = db.doc(`shared_ride_groups/${groupId}`);
    
    // 1. Get Group & Ride to find participants and check existence
    const [groupSnap, rideSnap] = await Promise.all([
        tx.get(groupRef),
        tx.get(rideRef)
    ]);
    if (!groupSnap.exists) return;
    const group = groupSnap.data() as SharedRideGroup;

    // 2. Cancel Ride (only if it exists)
    if (rideSnap.exists) {
        tx.update(rideRef, {
            status: 'cancelled',
            cancelledBy: initiatorId,
            cancelReason: reason,
            cancelledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
    } else {
        logger.info(`[SHARED_CANCEL_BYPASS] Ride ${rideId} does not exist. Skipping ride update.`);
    }

    // 3. Cancel Group
    tx.update(groupRef, {
        status: 'cancelled_by_passengers',
        isPubliclyJoinable: false,
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledReason: reason,
        updatedAt: FieldValue.serverTimestamp()
    });

    // 4. Cancel all associated Requests
    for (const rid of group.requestIds) {
        tx.update(db.doc(`shared_ride_requests/${rid}`), {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledBy: 'passenger',
            cancelReason: reason,
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    // 5. Clear ALL Passengers
    for (const pid of group.passengerIds) {
        await clearPassengerSharedRideState(tx, pid, `full_cancellation_by_${initiatorId}`);
    }

    // 6. Cancel offers (using batch/transaction update if we had their IDs, 
    // but here we rely on the status change in Ride document or separate logic)
    // For simplicity, we'll let the matcher/offers triggers handle terminal ride status, 
    // but we'll try to mark them if we can fetch them.
    const offersSnap = await db.collection('rideOffers')
        .where('rideId', '==', rideId)
        .where('status', '==', 'pending')
        .get();
    
    offersSnap.forEach(doc => {
        tx.update(doc.ref, {
            status: 'cancelled',
            cancelReason: 'ride_cancelled_by_passenger',
            updatedAt: FieldValue.serverTimestamp()
        });
    });
}

/**
 * Executes a partial cancellation for a shared ride.
 * Removes a specific passenger, recalculates fares for the rest, and updates the group/ride.
 */
export async function performPartialSharedRideCancellation(
    db: FirebaseFirestore.Firestore,
    tx: FirebaseFirestore.Transaction,
    group: SharedRideGroup,
    groupId: string,
    rideId: string | null,
    initiatorId: string,
    requestIdToCancel: string,
    reason: string,
    newStatus: string = 'cancelled',
    cancelledBy: string = 'passenger'
) {
    const rideRef = rideId ? db.doc(`rides/${rideId}`) : null;
    const groupRef = db.doc(`shared_ride_groups/${groupId}`);
    
    // Remove the passenger from the group
    const newPassengerIds = group.passengerIds.filter(id => id !== initiatorId);
    const newRequestIds = group.requestIds.filter(id => id !== requestIdToCancel);
    const newOccupiedSeats = group.occupiedSeats - 1;

    // Fetch the remaining requests to recalculate pricing
    const remainingRequestsSnaps = await Promise.all(newRequestIds.map(rid => tx.get(db.doc(`shared_ride_requests/${rid}`))));
    const remainingRequests = remainingRequestsSnaps.map(snap => snap.data() as any).filter(r => !!r);

    let totalSharedFare = 0;
    const updatedRequestPricings = remainingRequests.map((req) => {
        const isCreator = req.roleInGroup === 'creator';
        const reqPricing = calculateSharedPricing({
            totalOccupiedSeats: newOccupiedSeats,
            requestSeatCount: req.seatCount || 1,
            individualFareReference: req.individualFareReference,
            cityKey: req.cityKey || group.cityKey || 'rawson'
        });
        totalSharedFare += reqPricing.sharedFarePerPassenger;
        return { requestId: req.id, pricing: reqPricing };
    });

    const creatorPricing = updatedRequestPricings.find(p => p.requestId === newRequestIds[0])?.pricing || updatedRequestPricings[0].pricing;

    // Update group
    tx.update(groupRef, {
        passengerIds: newPassengerIds,
        requestIds: newRequestIds,
        occupiedSeats: newOccupiedSeats,
        estimatedIndividualFare: creatorPricing.sharedFarePerPassenger,
        sharedFarePerPassenger: creatorPricing.sharedFarePerPassenger,
        estimatedSharedTotal: totalSharedFare,
        estimatedDriverTotal: totalSharedFare, 
        updatedAt: FieldValue.serverTimestamp()
    });

    // Update remaining requests
    for (const item of updatedRequestPricings) {
        tx.update(db.doc(`shared_ride_requests/${item.requestId}`), {
            sharedFareEstimate: item.pricing.sharedFarePerPassenger,
            passengerSavingAmount: item.pricing.passengerSavingAmount,
            passengerSavingPercent: item.pricing.passengerSavingPercent,
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    // Cancel the specific request
    tx.update(db.doc(`shared_ride_requests/${requestIdToCancel}`), {
        status: newStatus,
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: cancelledBy,
        cancelReason: reason,
        updatedAt: FieldValue.serverTimestamp()
    });

    // Clear state for the cancelled passenger
    await clearPassengerSharedRideState(tx, initiatorId, reason);

    // Update the ride if it exists
    if (rideRef) {
        const rideSnap = await tx.get(rideRef);
        if (rideSnap.exists) {
            const ride = rideSnap.data() as Ride;
            // Filter out stops for the cancelled passenger
            const newOrderedStops = ride.orderedStops?.filter((stop: any) => stop.requestId !== requestIdToCancel) || [];
            
            tx.update(rideRef, {
                passengerId: newPassengerIds[0], // ensure the creator is the main passengerId
                orderedStops: newOrderedStops,
                estimatedIndividualFare: creatorPricing.sharedFarePerPassenger, 
                estimatedDriverTotal: totalSharedFare,
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    }
}

/**
 * [VamO PRO] Centralized utility to clear passenger's shared ride active state.
 * Ensures no 'phantom' requests block the user.
 */
async function clearPassengerSharedRideState(
    tx: FirebaseFirestore.Transaction, 
    passengerId: string, 
    reason: string
) {
    const db = getDb();
    const userRef = db.doc(`users/${passengerId}`);
    
    logger.info(`[SHARED_CLEANUP] Clearing state for user ${passengerId}. Reason: ${reason}`);
    
    tx.update(userRef, {
        activeRideId: FieldValue.delete(),
        activeSharedRequestId: FieldValue.delete(),
        activeSharedRideGroupId: FieldValue.delete(),
        currentSharedRideGroupId: FieldValue.delete(),
        sharedRideStatus: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
    });
}

/**
 * VamO Compartido V2B - Grouping & Confirmation Logic
 */

export const retrySharedRideSettlementV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
    }
    const { rideId } = request.data;
    if (!rideId) {
        throw new HttpsError('invalid-argument', 'Falta el rideId.');
    }
    try {
        const db = getDb();
        await db.doc(`rides/${rideId}`).update({
            settlementError: FieldValue.delete(),
            sharedSettlementStatus: 'pending_shared_settlement'
        });
        await settleSharedRideFinancialsV1(rideId);
        return { ok: true };
    } catch (error: any) {
        logger.error(`[RETRY_SETTLE_FAILED] Ride ${rideId}:`, error);
        throw new HttpsError('internal', error.message || 'Error en la liquidación');
    }
});

/**
 * Endpoint para que el pasajero inicie una solicitud de viaje compartido.
 */
export const requestSharedRideV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const passengerId = request.auth.uid;
    const db = getDb();

    const { origin, destination, individualFareReference, cityKey: rawCityKey, sharedRideNoticeAccepted, selectedSeats = [] } = request.data;
    const cityKey = normalizeCityKey(rawCityKey || '');

    if (!origin || !destination || !individualFareReference || !cityKey) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    if (!Array.isArray(selectedSeats) || selectedSeats.length > 2) {
        throw new HttpsError('invalid-argument', 'Puedes seleccionar un máximo de 2 asientos.');
    }
    const validSeats = ['front_passenger', 'rear_left', 'rear_center', 'rear_right'];
    for (const seat of selectedSeats) {
        if (!validSeats.includes(seat)) throw new HttpsError('invalid-argument', 'Asiento inválido.');
    }
    const requestSeatCount = Math.max(1, selectedSeats.length);

    const userRef = db.doc(`users/${passengerId}`);
    const featureRef = db.doc(`features/sharedRide`);
    
    try {
        const result = await db.runTransaction(async (tx) => {
            // 1. Fetch Config & Profile
            const [userSnap, featureSnap] = await Promise.all([
                tx.get(userRef),
                tx.get(featureRef)
            ]);

            if (!userSnap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
            const userData = userSnap.data() as UserProfile;

            if (!featureSnap.exists) {
                logger.warn(`[SHARED_RIDE_GATE] Config not found. Blocking creation.`);
                throw new HttpsError('failed-precondition', 'El servicio compartido no está configurado.');
            }
            const featureConfig = featureSnap.data() as SharedRideFeatureConfig;

            // 2. Feature Gating Logic
            logger.info(`[SHARED_RIDE_GATE] Checking access for ${passengerId} in ${cityKey}`);

            if (!featureConfig.enabled) {
                logger.warn(`[SHARED_RIDE_CREATE_BLOCKED] Feature disabled globally.`);
                throw new HttpsError('failed-precondition', 'VamO Compartido no está disponible actualmente.');
            }

            if (featureConfig.cities && !featureConfig.cities.includes(cityKey)) {
                logger.warn(`[SHARED_RIDE_CREATE_BLOCKED] City ${cityKey} not enabled.`);
                throw new HttpsError('failed-precondition', 'VamO Compartido no está disponible en tu ciudad todavía.');
            }

            if (featureConfig.requireAlphaTester && !userData.sharedRideAlphaTester) {
                logger.warn(`[SHARED_RIDE_CREATE_BLOCKED] User is not an alpha tester.`);
                throw new HttpsError('permission-denied', 'No tienes acceso a la versión de prueba de VamO Compartido.');
            }

            if (featureConfig.beta) {
                logger.info(`[SHARED_RIDE_BETA] Creation attempt in Beta mode.`);
                if (!sharedRideNoticeAccepted) {
                    logger.warn(`[SHARED_RIDE_CREATE_BLOCKED] Beta notice not accepted.`);
                    throw new HttpsError('failed-precondition', 'Debes aceptar el aviso de servicio Beta para continuar.');
                }
                logger.info(`[SHARED_RIDE_NOTICE_ACCEPTED] User ${passengerId} accepted beta terms.`);
            }

            if (userData.role === 'driver') {
                throw new HttpsError('permission-denied', 'Los conductores no pueden solicitar viajes como pasajeros.');
            }

            // Removido: Los usuarios con beneficio Express pueden pedir compartido (con tarifa plana compartida).

            // 3. Validar que no tenga una solicitud activa (Idempotency)
            if (userData.activeSharedRequestId) {
                const existingReqSnap = await tx.get(db.doc(`shared_ride_requests/${userData.activeSharedRequestId}`));
                if (existingReqSnap.exists) {
                    const existingData = existingReqSnap.data() as SharedRideRequest;
                    // Solo retornar si no está en un estado terminal
                    const terminalStates = ['cancelled', 'completed', 'expired', 'no_show', 'undeclared_companion', 'rejected'];
                    if (!terminalStates.includes(existingData.status)) {
                        logger.info(`[SHARED_RIDE_IDEMPOTENCY] User ${passengerId} already has active request ${userData.activeSharedRequestId}. Returning existing.`);
                        return { 
                            requestId: userData.activeSharedRequestId, 
                            groupId: existingData.groupId,
                            roleInGroup: existingData.roleInGroup || 'creator',
                            status: existingData.status,
                            reusedExisting: true 
                        };
                    }
                }
            }

            // Si llegamos acá y tenía activeSharedRequestId pero estaba en estado terminal, se limpiará al crear el nuevo o podemos limpiarlo ahora
            if (userData.activeRideId) {
                const blockingState = await resolveActiveSharedRideState(passengerId, db, tx);
                if (blockingState.isBlocked) {
                    throw new HttpsError('already-exists', blockingState.reason || 'Ya tienes un viaje activo.', {
                        activeRideId: userData.activeRideId || null,
                        activeSharedGroupId: (userData as any).activeSharedGroupId || null,
                        activeSharedRequestId: userData.activeSharedRequestId || null,
                        isRecoverable: true
                    });
                }
            }

                        const { manualCreation = false } = request.data;
            const requestId = db.collection('shared_ride_requests').doc().id;
            
            let finalGroupId = null;
            let finalRoleInGroup = manualCreation ? 'creator' : 'joined';
            let finalStatus = 'forming';
            let finalGroupStatus = 'forming';
            let newOccupiedSeats = 1;

            let currentRequestPricing = null;

            type SeatId = 'front_passenger' | 'rear_left' | 'rear_center' | 'rear_right';
            let initialSeatLabels: SeatId[] = [];
            if (Array.isArray(selectedSeats) && selectedSeats.length > 0) {
                initialSeatLabels = selectedSeats as SeatId[];
            }

            if (!manualCreation) {
                const activeGroupsSnap = await tx.get(
                    db.collection('shared_ride_groups')
                      .where('cityKey', '==', cityKey)
                      .where('status', '==', 'forming')
                      .limit(5)
                );

                for (const groupDoc of activeGroupsSnap.docs) {
                    const groupData = groupDoc.data();
                    if (groupData.passengerIds.includes(passengerId)) continue;
                    if (groupData.occupiedSeats + requestSeatCount > 4) continue;
                    if (groupData.requestIds.length >= 2) continue; // Max 2 requests per group
                    
                    // Comprobar colisión de asientos
                    let seatCollision = false;
                    const currentSeatMap = groupData.seatMap || {};
                    for (const seat of selectedSeats) {
                        if (currentSeatMap[seat]) {
                            seatCollision = true;
                            break;
                        }
                    }
                    if (seatCollision) continue;

                    const memberRequests: any[] = [];
                    for (const rid of groupData.requestIds) {
                        const rSnap = await tx.get(db.doc(`shared_ride_requests/${rid}`));
                        if (rSnap.exists) memberRequests.push(rSnap.data());
                    }

                    const virtualRequest: any = { id: requestId, passengerId, origin, destination };
                    const compatibility = evaluateSharedRouteCompatibility([...memberRequests, virtualRequest]);
                    
                    if (compatibility.compatible) {
                        finalGroupId = groupDoc.id;
                        finalRoleInGroup = 'joined';
                        
                        const updatedRequestIds = [...groupData.requestIds, requestId];
                        const updatedPassengerIds = [...groupData.passengerIds, passengerId];
                        newOccupiedSeats = groupData.occupiedSeats + requestSeatCount;

                        const newSeatMap = { ...(groupData.seatMap || {}) };
                        let finalSeats = initialSeatLabels;
                        if (finalSeats.length === 0) {
                            const validSeats: SeatId[] = ['rear_right', 'front_passenger', 'rear_left', 'rear_center'];
                            const available = validSeats.filter(s => !newSeatMap[s]);
                            if (available.length >= requestSeatCount) {
                                finalSeats = available.slice(0, requestSeatCount);
                            } else {
                                throw new HttpsError('failed-precondition', 'No hay suficientes asientos disponibles en el grupo.');
                            }
                        }
                        for (const seat of finalSeats) {
                            newSeatMap[seat] = { passengerId, requestId, passengerName: userData.name || 'Pasajero' };
                        }

                        // Recalcular precios para todos
                        let totalSharedFare = 0;
                        const allRequests = [...memberRequests, { ...virtualRequest, individualFareReference, id: requestId, seatCount: requestSeatCount }];
                        
                        const updatedRequestPricings = allRequests.map((req: any) => {
                            const reqPricing = calculateSharedPricing({
                                individualFareReference: req.individualFareReference,
                                totalOccupiedSeats: newOccupiedSeats,
                                requestSeatCount: req.seatCount || 1,
                                cityKey
                            });
                            totalSharedFare += reqPricing.sharedFarePerPassenger;
                            return { requestId: req.id, pricing: reqPricing };
                        });

                        const creatorPricing = updatedRequestPricings.find(p => p.requestId === groupData.requestIds[0])?.pricing || updatedRequestPricings[0].pricing;

                        const driverBenefitAmount = totalSharedFare - groupData.estimatedIndividualFare;
                        const driverBenefitPercent = groupData.estimatedIndividualFare > 0 
                            ? driverBenefitAmount / groupData.estimatedIndividualFare 
                            : 0;

                        // [FIX] Use builder to guarantee requestId is always present
                        const newPassengerEntry = buildSharedPassengerGroupEntry({
                            requestId,           // ← from db.collection().doc().id above
                            passengerId,
                            passengerName: userData.name || 'Pasajero',
                            roleInGroup: 'joined',
                            pickupAddress: origin.address || '',
                            dropoffAddress: destination.address || ''
                        });

                        finalGroupStatus = newOccupiedSeats >= 2 ? 'ready_for_driver' : 'forming';
                        
                        tx.update(groupDoc.ref, {
                            requestIds: updatedRequestIds,
                            passengerIds: updatedPassengerIds,
                            passengers: FieldValue.arrayUnion(newPassengerEntry),
                            occupiedSeats: newOccupiedSeats,
                            requestCount: updatedRequestIds.length,
                            seatMap: newSeatMap,
                            sharedFarePerPassenger: creatorPricing.sharedFarePerPassenger,
                            estimatedSharedTotal: totalSharedFare,
                            driverBenefitAmount,
                            driverBenefitPercent,
                            status: finalGroupStatus,
                            pickupStops: compatibility.pickupStops || groupData.pickupStops,
                            dropoffStops: compatibility.dropoffStops || groupData.dropoffStops,
                            orderedStops: compatibility.orderedStops || groupData.orderedStops,
                            hasMinimumPassengers: newOccupiedSeats >= 2,
                            isPubliclyJoinable: newOccupiedSeats < 4,
                            updatedAt: FieldValue.serverTimestamp()
                        });

                        for (const item of updatedRequestPricings) {
                            if (item.requestId === requestId) {
                                currentRequestPricing = item.pricing;
                                continue;
                            }
                            tx.update(db.doc(`shared_ride_requests/${item.requestId}`), {
                                status: 'grouped',
                                sharedFareEstimate: item.pricing.sharedFarePerPassenger,
                                sharedFareRaw: item.pricing.rawSharedFare,
                                sharedPaymentPercent: item.pricing.sharedPaymentPercent,
                                sharedPassengerCount: newOccupiedSeats,
                                passengerSavingAmount: item.pricing.passengerSavingAmount,
                                passengerSavingPercent: item.pricing.passengerSavingPercent,
                                updatedAt: FieldValue.serverTimestamp()
                            });
                        }
                        
                        break;
                    }
                }
            }

            if (!finalGroupId) {
                finalGroupId = db.collection('shared_ride_groups').doc().id;
                finalRoleInGroup = 'creator';
                finalGroupStatus = 'forming';
                
                const initialSeatMap: any = {};
                let finalSeats = initialSeatLabels;
                if (finalSeats.length === 0) {
                    finalSeats = ['rear_right'];
                }
                for (const seat of finalSeats) {
                    initialSeatMap[seat] = { passengerId, requestId, passengerName: userData.name || 'Pasajero' };
                }

                const newGroup = {
                    id: finalGroupId,
                    cityKey,
                    status: 'forming',
                    requestIds: [requestId],
                    passengerIds: [passengerId],
                    passengers: [
                        // [FIX] requestId is now mandatory — use buildSharedPassengerGroupEntry
                        buildSharedPassengerGroupEntry({
                            requestId,           // ← from db.collection().doc().id above
                            passengerId,
                            passengerName: userData.name || 'Pasajero',
                            roleInGroup: 'creator',
                            pickupAddress: origin.address || '',
                            dropoffAddress: destination.address || ''
                        })
                    ],
                    occupiedSeats: requestSeatCount,
                    requestCount: 1,
                    maxRequests: 2,
                    seatMap: initialSeatMap,
                    maxSeats: 4,
                    paymentMethod: 'cash',
                    estimatedIndividualFare: individualFareReference,
                    sharedFarePerPassenger: individualFareReference * requestSeatCount, 
                    estimatedSharedTotal: individualFareReference * requestSeatCount,
                    estimatedDriverTotal: individualFareReference * requestSeatCount,
                    driverBenefitAmount: 0,
                    driverBenefitPercent: 0,
                    passengerSavingAmount: 0,
                    passengerSavingPercent: 0,
                    pickupStops: [origin],
                    dropoffStops: [destination],
                    orderedStops: [
                        { type: 'pickup', requestId: requestId, location: origin },
                        { type: 'dropoff', requestId: requestId, location: destination }
                    ],
                    expiresAt: Timestamp.fromMillis(Date.now() + 480000), // 8 min
                    hasMinimumPassengers: false,
                    isPubliclyJoinable: true,
                    creatorPassengerId: passengerId,
                    createdByPassengerId: passengerId,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                };
                tx.set(db.doc(`shared_ride_groups/${finalGroupId}`), newGroup);
                finalStatus = 'pending_group';
            } else {
                finalStatus = 'grouped';
            }

            const projectedPricing = currentRequestPricing || calculateSharedPricing({
                individualFareReference,
                totalOccupiedSeats: 2, // Siempre proyectamos el descuento de 2 asientos como mínimo
                requestSeatCount,
                cityKey
            });

            const newRequest = {
                id: requestId,
                passengerId,
                passengerName: userData.name || 'Pasajero',
                cityKey,
                origin,
                destination,
                status: finalStatus,
                groupId: finalGroupId,
                roleInGroup: finalRoleInGroup,
                individualFareReference,
                paymentMethod: 'cash',
                sharedRideNoticeAccepted: !!sharedRideNoticeAccepted,
                sharedRideNoticeAcceptedAt: FieldValue.serverTimestamp(),
                manualCreation: !!manualCreation,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                blockedBenefits: ["social", "retired", "disability", "express", "promo", "coupon"],
                appliedBenefitType: "shared_fare_only",
                selectedSeats: initialSeatLabels,
                seatCount: requestSeatCount,
                sharedFareEstimate: projectedPricing.sharedFarePerPassenger,
                sharedFareRaw: projectedPricing.rawSharedFare,
                sharedPaymentPercent: projectedPricing.sharedPaymentPercent,
                sharedPassengerCount: newOccupiedSeats,
                passengerSavingAmount: projectedPricing.passengerSavingAmount,
                passengerSavingPercent: projectedPricing.passengerSavingPercent,
            };

            tx.set(db.doc(`shared_ride_requests/${requestId}`), newRequest);
            tx.update(userRef, { 
                activeSharedRequestId: requestId,
                activeSharedRideGroupId: finalGroupId,
                sharedRideStatus: finalStatus,
                updatedAt: FieldValue.serverTimestamp()
            });

            return { 
                ok: true,
                requestId, 
                groupId: finalGroupId,
                roleInGroup: finalRoleInGroup,
                status: finalStatus,
                reusedExisting: false
            };
        });

        // Optional: Trigger dispatcher logic if it became ready
        // if (result.ok && result.groupId && result.status === 'grouped') {
        //     // ... dispatch to driver pool
        // }

        return result;
    } catch (error: any) {
        logger.error(`Error in requestSharedRideV1:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error interno al crear solicitud.');
    }
});

/**
 * Trigger que orquesta la agrupación de solicitudes cuando se crea una nueva.
 */
export const onSharedRideRequestCreateV1 = onDocumentCreated("shared_ride_requests/{requestId}", async (event) => {
    logger.info("onSharedRideRequestCreateV1 is now handled synchronously in requestSharedRideV1.");
    return;
});


/**
 * Callable para que el pasajero confirme el precio final.
 */
export const confirmSharedRidePriceV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const passengerId = request.auth.uid;
    const { requestId, confirmedPrice } = request.data;

    if (!requestId || !confirmedPrice) throw new HttpsError('invalid-argument', 'Faltan parámetros.');

    const db = getDb();
    const reqRef = db.doc(`shared_ride_requests/${requestId}`);

    try {
        const result = await db.runTransaction(async (tx) => {
            const reqSnap = await tx.get(reqRef);
            if (!reqSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
            const reqData = reqSnap.data() as SharedRideRequest;

            if (reqData.passengerId !== passengerId) throw new HttpsError('permission-denied', 'No es tu solicitud.');
            if (reqData.status !== 'pending_confirmation') throw new HttpsError('failed-precondition', 'La solicitud no está esperando confirmación.');

            const groupId = reqData.groupId;
            if (!groupId) throw new HttpsError('failed-precondition', 'La solicitud no tiene un grupo asignado.');
            
            const groupRef = db.doc(`shared_ride_groups/${groupId}`);
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists) throw new HttpsError('not-found', 'Grupo no encontrado.');
            const groupData = groupSnap.data() as SharedRideGroup;

            if (groupData.status !== 'pending_passenger_confirmation') throw new HttpsError('failed-precondition', 'El grupo ya no está en fase de confirmación.');
            
            // Validar timeout (45s)
            if (groupData.confirmationExpiresAt && groupData.confirmationExpiresAt.toMillis() < Date.now()) {
                throw new HttpsError('deadline-exceeded', 'El tiempo de confirmación ha expirado.');
            }

            // Validar precio
            if (reqData.sharedFareEstimate !== confirmedPrice) {
                throw new HttpsError('aborted', 'El precio ha cambiado. Revisa la nueva oferta.');
            }

            // Confirmar solicitud
            tx.update(reqRef, { 
                status: 'confirmed',
                finalFareCash: confirmedPrice,
                updatedAt: FieldValue.serverTimestamp()
            });

            logger.info(`[SHARED_GROUP_CONFIRMATION] Request ${requestId} confirmed for $${confirmedPrice}`);

            // Verificar si todos han confirmado
            // [FIX] Transaction.get(query) is not supported. Use regular get().
            const allRequestsSnap = await db.collection('shared_ride_requests')
                .where('groupId', '==', groupId)
                .get();
                
            const allConfirmed = allRequestsSnap.docs.every(d => {
                const data = d.data() as SharedRideRequest;
                // Si d es la que estamos actualizando ahora, ya sabemos que es confirmed
                return d.id === requestId ? true : data.status === 'confirmed';
            });

            if (allConfirmed) {
                // Grupo lleno cuando todos los usuarios registrados confirmaron (maxRequests = 2)
                const groupSnapshot = await tx.get(groupRef);
                const groupSnap = groupSnapshot.data() as SharedRideGroup;
                const maxReq = groupSnap?.maxRequests ?? 2;
                const isFull = allRequestsSnap.size >= maxReq;
                const newGroupStatus = isFull ? 'ready_for_driver' : 'forming';
                logger.info(`[SHARED_GROUP_CONFIRMED] Group ${groupId} fully confirmed by ${allRequestsSnap.size}/${maxReq} passengers. New status: ${newGroupStatus}`);
                tx.update(groupRef, { 
                    status: newGroupStatus,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }

            return { success: true, allConfirmed };
        });

        return result;
    } catch (error: any) {
        logger.error(`Error in confirmSharedRidePriceV1:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al confirmar precio.');
    }
});

/**
 * Trigger para limpiar activeSharedRequestId y manejar expiraciones terminales.
 */
export const onSharedRideRequestUpdateV1 = onDocumentUpdated("shared_ride_requests/{requestId}", async (event) => {
    if (!event.data) return;
    const after = event.data.after.data() as SharedRideRequest;
    const before = event.data.before.data() as SharedRideRequest;

    const terminalStates = ['cancelled', 'completed', 'expired', 'no_show', 'undeclared_companion'];
    
    if (terminalStates.includes(after.status) && !terminalStates.includes(before.status)) {
        const db = getDb();
        const passengerId = after.passengerId;
        
        logger.info(`[SHARED_GROUP_EXPIRED] Cleaning activeSharedRequestId for user ${passengerId} due to state ${after.status}`);
        
        await db.runTransaction(async (tx) => {
            const userRef = db.doc(`users/${passengerId}`);
            const userSnap = await tx.get(userRef);
            if (userSnap.exists) {
                const userData = userSnap.data() as UserProfile;
                if (userData.activeSharedRequestId === after.id) {
                    await clearPassengerSharedRideState(tx, passengerId, `terminal_state_${after.status}`);
                }
            }

            if (after.groupId) {
                const groupRef = db.doc(`shared_ride_groups/${after.groupId}`);
                const gSnap = await tx.get(groupRef);
                if (gSnap.exists) {
                    const gData = gSnap.data() as SharedRideGroup;

                    // [BUG_FIX] If the group is already past the forming stages (confirmed, ready, or dispatched),
                    // we do NOT recalculate prices, modify stops, or return the group to forming.
                    const lockedGroupStatuses = ['ready_for_driver', 'searching_driver', 'driver_assigned', 'completed', 'cancelled', 'expired'];
                    if (lockedGroupStatuses.includes(gData.status) || gData.finalRideId) {
                        logger.info(`[SHARED_GROUP_LOCKED] Group ${after.groupId} is in status ${gData.status} (Ride: ${gData.finalRideId || 'none'}). Skipping group reset and price recalculation.`);
                        return;
                    }

                    const remainingRequestIds = gData.requestIds.filter(id => id !== after.id);
                    
                    if (remainingRequestIds.length === 0) {
                        tx.update(groupRef, { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
                    } else {
                        let status: any = gData.status;
                        let pricing = null;

                        if (remainingRequestIds.length >= 1) {
                            pricing = calculateSharedPricing({
                                individualFareReference: gData.estimatedIndividualFare,
                                totalOccupiedSeats: remainingRequestIds.length,
                                requestSeatCount: 1,
                                cityKey: after.cityKey
                            });
                        }

                        status = 'forming';

                        // [FIX] Recalculate route for remaining members
                        const memberRequests: SharedRideRequest[] = [];
                        for (const rid of remainingRequestIds) {
                            const rSnap = await tx.get(db.doc(`shared_ride_requests/${rid}`));
                            if (rSnap.exists) memberRequests.push(rSnap.data() as SharedRideRequest);
                        }
                        const compatibility = evaluateSharedRouteCompatibility(memberRequests);

                        tx.update(groupRef, { 
                            requestIds: remainingRequestIds,
                            passengerIds: gData.passengerIds.filter(id => id !== passengerId),
                            occupiedSeats: remainingRequestIds.length,
                            status: status,
                            isPubliclyJoinable: true,
                            hasMinimumPassengers: remainingRequestIds.length >= 2,
                            driverSearchStartsAt: null,
                            closingExpiresAt: null,
                            sharedFarePerPassenger: pricing ? pricing.sharedFarePerPassenger : gData.estimatedIndividualFare,
                            estimatedSharedTotal: pricing ? pricing.totalSharedFare : gData.estimatedIndividualFare,
                            pickupStops: compatibility.pickupStops,
                            dropoffStops: compatibility.dropoffStops,
                            orderedStops: compatibility.orderedStops,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                        
                        for (const rid of remainingRequestIds) {
                            tx.update(db.doc(`shared_ride_requests/${rid}`), { 
                                status: 'forming',
                                updatedAt: FieldValue.serverTimestamp()
                            });
                        }

                        logger.info(`[SHARED_GROUP_RECALCULATED] Group ${after.groupId} updated and returned to forming after member exit.`);
                    }
                }
            }
        });
    }
});

/**
 * Maneja la cancelación desde un pasajero
 */
async function handlePassengerCancellation(db: FirebaseFirestore.Firestore, tx: FirebaseFirestore.Transaction, passengerId: string, requestId: string | null, groupId: string | null, providedRideId: string | null) {
    let finalGroupId = groupId;
    let finalRequestId = requestId;

    if (!finalGroupId && finalRequestId) {
        const reqSnap = await tx.get(db.doc(`shared_ride_requests/${finalRequestId}`));
        if (!reqSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
        const data = reqSnap.data() as any;
        if (data.passengerId !== passengerId) throw new HttpsError('permission-denied', 'No puedes cancelar una solicitud ajena.');
        
        const terminalStates = ['cancelled', 'completed', 'expired', 'no_show', 'undeclared_companion', 'rejected', 'dropped_off'];
        if (terminalStates.includes(data.status)) {
            await clearPassengerSharedRideState(tx, passengerId, 'cancel_already_terminal');
            return { success: true, alreadyTerminal: true };
        }
        finalGroupId = data.groupId;
    } else if (finalGroupId && !finalRequestId) {
        const groupSnap = await tx.get(db.doc(`shared_ride_groups/${finalGroupId}`));
        if (groupSnap.exists) {
            const groupData = groupSnap.data() as SharedRideGroup;
            const idx = groupData.passengerIds.indexOf(passengerId);
            if (idx >= 0) {
                finalRequestId = groupData.requestIds[idx];
            } else {
                throw new HttpsError('permission-denied', 'No eres parte del grupo.');
            }
        }
    }

    if (!finalGroupId || !finalRequestId) {
        // Fallback for isolated requests
        if (finalRequestId) {
            tx.update(db.doc(`shared_ride_requests/${finalRequestId}`), { 
                status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), cancelledBy: 'passenger'
            });
            await clearPassengerSharedRideState(tx, passengerId, 'manual_cancel');
        }
        return { success: true };
    }

    const groupRef = db.doc(`shared_ride_groups/${finalGroupId}`);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) return { success: true };
    const group = groupSnap.data() as SharedRideGroup;

    const rideId = providedRideId || `shared_${finalGroupId}`;
    const rideRef = db.doc(`rides/${rideId}`);
    const rideSnap = await tx.get(rideRef);
    const ride = rideSnap.exists ? rideSnap.data() as Ride : null;

    if (ride && ['in_progress', 'paused', 'driver_assigned', 'driver_arrived'].includes(ride.status)) {
        throw new HttpsError('failed-precondition', 'El viaje ya inició o el conductor está asignado. No se puede cancelar desde aquí.');
    }

    const paxCount = group.occupiedSeats;

    if (paxCount > 2) {
        // 3 o 4 pasajeros -> baja a 2 o 3. Queda vivo siempre.
        logger.info(`[SHARED_CANCEL_PARTIAL] Passenger ${passengerId} cancelled. Remaining: ${paxCount - 1}`);
        await performPartialSharedRideCancellation(db, tx, group, finalGroupId, ride ? rideId : null, passengerId, finalRequestId, 'cancelled_by_passenger');
    } else if (paxCount === 2) {
        // Eran 2, queda 1.
        if (ride) {
            // Ya estaba buscando o asignado. Se desarma todo.
            logger.info(`[SHARED_CANCEL_FULL_FROM_2] Group ${finalGroupId} drops to 1 pax while searching/assigned. Full cancellation.`);
            await performFullSharedRideCancellation(db, tx, rideId, finalGroupId, passengerId, 'group_dismantled_1_pax_left');
        } else {
            // Estaba formando. Vuelve a 1 pasajero y forming.
            logger.info(`[SHARED_CANCEL_PARTIAL_FORMING] Group ${finalGroupId} drops to 1 pax in forming. Removing hasMinimumPassengers.`);
            await performPartialSharedRideCancellation(db, tx, group, finalGroupId, null, passengerId, finalRequestId, 'cancelled_by_passenger');
            // Remove hasMinimumPassengers flag
            tx.update(groupRef, { hasMinimumPassengers: false, status: 'forming' });
        }
    } else {
        // paxCount === 1, el único pasajero cancela.
        logger.info(`[SHARED_CANCEL_FULL_LAST] Last passenger ${passengerId} cancelled. Full cancellation.`);
        await performFullSharedRideCancellation(db, tx, rideId, finalGroupId, passengerId, 'shared_search_cancelled_by_passenger');
    }

    return { success: true };
}

/**
 * Endpoint para que el pasajero cancele su solicitud de viaje compartido.
 */
export const cancelSharedRideRequestV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const passengerId = request.auth.uid;
    const { requestId } = request.data;
    if (!requestId) throw new HttpsError('invalid-argument', 'Falta requestId.');

    const db = getDb();
    try {
        await db.runTransaction(async (tx) => {
            await handlePassengerCancellation(db, tx, passengerId, requestId, null, null);
        });
        return { success: true };
    } catch (error: any) {
        logger.error(`Error in cancelSharedRideRequestV1:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al cancelar solicitud.');
    }
});

/**
 * [VamO Compartido V2.2] Specialized Cancellation during Driver Search
 */
export const cancelSharedRideSearchV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const passengerId = request.auth.uid;
    const { groupId, rideId } = request.data;
    if (!groupId) throw new HttpsError('invalid-argument', 'Falta groupId.');

    const db = getDb();
    try {
        await db.runTransaction(async (tx) => {
            await handlePassengerCancellation(db, tx, passengerId, null, groupId, rideId);
        });
        return { success: true };
    } catch (error: any) {
        logger.error(`[SHARED_CANCEL_CALLABLE_ERROR]`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al cancelar búsqueda.');
    }
});

/**
 * Trigger que detecta cuando un grupo está listo para buscar conductor.
 */
export const onSharedRideGroupUpdateV1 = onDocumentUpdated("shared_ride_groups/{groupId}", async (event) => {
    const before = event.data?.before.data() as SharedRideGroup;
    const after = event.data?.after.data() as SharedRideGroup;
    
    if (!before || !after) return;

    if (before.status !== 'ready_for_driver' && after.status === 'ready_for_driver') {
        const groupId = event.params.groupId;
        logger.info(`[SHARED_GROUP_UPDATE_TRIGGER] Group ${groupId} is ready. Calling centralized dispatch.`);
        await dispatchSharedRideGroupIfReady(groupId, 'group_status_updated_trigger');
    }
});

/**
 * Callable para que el conductor actualice el estado de un pasajero en un viaje compartido.
 */
export const updateSharedPassengerStatusV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const driverId = request.auth.uid;
    const { rideId, requestId, action } = request.data;

    if (!rideId || !requestId || !action) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros (rideId, requestId, action).');
    }

    const db = getDb();
    const rideRef = db.doc(`rides/${rideId}`);
    const reqRef = db.doc(`shared_ride_requests/${requestId}`);

    try {
        const result = await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists) throw new HttpsError('not-found', 'Viaje no encontrado.');
            const rideData = rideSnap.data() as any;

            if (rideData.driverId !== driverId) {
                throw new HttpsError('permission-denied', 'No eres el conductor asignado a este viaje.');
            }

            if (rideData.status === 'completed' || rideData.status === 'cancelled') {
                throw new HttpsError('failed-precondition', 'El viaje ya ha finalizado.');
            }

            if (!rideData.isSharedRide) {
                throw new HttpsError('failed-precondition', 'Este viaje no es de tipo compartido.');
            }

            const reqSnap = await tx.get(reqRef);
            if (!reqSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
            const reqData = reqSnap.data() as SharedRideRequest;

            if (reqData.finalRideId !== rideId) {
                throw new HttpsError('failed-precondition', 'La solicitud no pertenece a este viaje.');
            }

            const currentStatus = reqData.status;
            let newStatus = currentStatus;

            const terminalStates = ['no_show', 'undeclared_companion', 'dropped_off', 'cancelled'];
            if (terminalStates.includes(currentStatus)) {
                throw new HttpsError('failed-precondition', `La solicitud ya está en estado terminal: ${currentStatus}`);
            }

            switch (action) {
                case 'arrive_at_stop':
                    break;
                case 'mark_picked_up':
                    if (currentStatus !== 'assigned' && currentStatus !== 'pickup_pending') {
                         throw new HttpsError('failed-precondition', 'No se puede marcar como subido en este estado.');
                    }
                    newStatus = 'picked_up';
                    break;
                case 'mark_no_show':
                    if (currentStatus === 'picked_up') throw new HttpsError('failed-precondition', 'El pasajero ya subió.');
                    newStatus = 'no_show';
                    break;
                case 'mark_undeclared_companion':
                    if (currentStatus === 'picked_up') throw new HttpsError('failed-precondition', 'El pasajero ya subió.');
                    newStatus = 'undeclared_companion';
                    break;
                case 'mark_dropped_off':
                    if (currentStatus !== 'picked_up') {
                        throw new HttpsError('failed-precondition', 'No se puede marcar bajada sin previo pickup.');
                    }
                    newStatus = 'dropped_off';
                    break;
                default:
                    throw new HttpsError('invalid-argument', 'Acción no válida.');
            }

            if (newStatus !== currentStatus) {
                tx.update(reqRef, { 
                    status: newStatus, 
                    updatedAt: FieldValue.serverTimestamp() 
                });
                
                // Si el pasajero pasó a un estado terminal, liberarlo
                const terminalStatesForPax = ['no_show', 'undeclared_companion', 'cancelled'];
                if (terminalStatesForPax.includes(newStatus)) {
                    tx.update(db.doc(`users/${reqData.passengerId}`), {
                        activeRideId: FieldValue.delete(),
                        activeSharedRequestId: FieldValue.delete(),
                        activeSharedRideGroupId: FieldValue.delete(),
                        sharedRideStatus: newStatus,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
            }

            const now = admin.firestore.Timestamp.now();
            const updatedStops = (rideData.orderedStops || []).map((stop: any) => {
                if (stop.requestId === requestId) {
                    if (action === 'arrive_at_stop' && stop.type === 'pickup' && (stop.status === 'pending' || !stop.status)) {
                        return { ...stop, status: 'arrived', updatedAt: now, arrivedAt: now };
                    }
                    if (action === 'mark_picked_up' && stop.type === 'pickup') {
                        return { ...stop, status: 'completed', updatedAt: now, completedAt: now };
                    }
                    if ((action === 'mark_no_show' || action === 'mark_undeclared_companion') && stop.type === 'pickup') {
                        return { ...stop, status: 'skipped', updatedAt: now, completedAt: now };
                    }
                    if ((action === 'mark_no_show' || action === 'mark_undeclared_companion') && stop.type === 'dropoff') {
                        return { ...stop, status: 'skipped', updatedAt: now, completedAt: now };
                    }
                    if (action === 'mark_dropped_off' && stop.type === 'dropoff') {
                        return { ...stop, status: 'completed', updatedAt: now, completedAt: now };
                    }
                }
                return stop;
            });

            const rideUpdates: any = {
                orderedStops: updatedStops,
                updatedAt: FieldValue.serverTimestamp()
            };

            if (action === 'mark_picked_up' && rideData.status !== 'started') {
                rideUpdates.status = 'started';
            }

            tx.update(rideRef, rideUpdates);

            const terminalStatesForClosure = ['dropped_off', 'no_show', 'undeclared_companion', 'cancelled', 'expired'];
            if (terminalStatesForClosure.includes(newStatus)) {
                const groupRequestsSnap = await tx.get(
                    db.collection('shared_ride_requests')
                      .where('groupId', '==', rideData.sharedGroupId)
                );
                
                const allRequests = groupRequestsSnap.docs.map(d => ({
                    ...d.data() as SharedRideRequest,
                    id: d.id
                }));

                const updatedRequests = allRequests.map(r => r.id === requestId ? { ...r, status: newStatus } : r);

                const isEveryRequestTerminal = updatedRequests.every(r => 
                    terminalStatesForClosure.includes(r.status)
                );

                if (isEveryRequestTerminal && !rideData.sharedOperationalStatus) {
                    const totalRequests = updatedRequests.length;
                    const droppedOffCount = updatedRequests.filter(r => r.status === 'dropped_off').length;
                    const noShowCount = updatedRequests.filter(r => r.status === 'no_show').length;
                    const undeclaredCompanionCount = updatedRequests.filter(r => r.status === 'undeclared_companion').length;
                    const cancelledCount = updatedRequests.filter(r => r.status === 'cancelled').length;
                    const pickedUpCount = updatedRequests.filter(r => r.status === 'picked_up' || r.status === 'dropped_off').length;
                    const validCompletedCount = droppedOffCount;
                    const continuedWithSinglePassenger = totalRequests >= 2 && validCompletedCount === 1;

                    const summary = {
                        totalRequests,
                        droppedOffCount,
                        noShowCount,
                        undeclaredCompanionCount,
                        cancelledCount,
                        pickedUpCount,
                        validCompletedCount,
                        continuedWithSinglePassenger
                    };

                    const closureUpdates: any = {
                        sharedCompletionSummary: summary,
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    let closureEventType = 'shared_ride_completed';

                    tx.update(db.doc(`shared_ride_groups/${rideData.sharedGroupId}`), {
                        status: 'completed',
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    if (validCompletedCount > 0) {
                        closureUpdates.status = 'completed';
                        closureUpdates.sharedOperationalStatus = 'completed';
                        closureUpdates.sharedSettlementStatus = 'pending_shared_settlement';
                        closureUpdates.sharedCompletedAt = FieldValue.serverTimestamp();
                        
                        const readyEventRef = db.collection(`rides/${rideId}/shared_events`).doc();
                        tx.set(readyEventRef, {
                            id: readyEventRef.id,
                            type: 'shared_ready_for_settlement_v4',
                            rideId,
                            sharedGroupId: rideData.sharedGroupId,
                            driverId,
                            createdAt: FieldValue.serverTimestamp(),
                            source: "backend"
                        });
                    } else {
                        closureUpdates.status = 'cancelled';
                        closureUpdates.sharedOperationalStatus = 'cancelled_no_valid_passengers';
                        closureUpdates.sharedSettlementStatus = 'not_applicable';
                        closureUpdates.sharedCancelledAt = FieldValue.serverTimestamp();
                        closureEventType = 'shared_ride_cancelled_no_valid_passengers';
                    }

                    if (continuedWithSinglePassenger) {
                        const singlePaxEventRef = db.collection(`rides/${rideId}/shared_events`).doc();
                        tx.set(singlePaxEventRef, {
                            id: singlePaxEventRef.id,
                            type: 'shared_single_passenger_continued',
                            rideId,
                            sharedGroupId: rideData.sharedGroupId,
                            driverId,
                            createdAt: FieldValue.serverTimestamp(),
                            source: "backend"
                        });
                    }

                    const closureEventRef = db.collection(`rides/${rideId}/shared_events`).doc();
                    tx.set(closureEventRef, {
                        id: closureEventRef.id,
                        type: closureEventType,
                        rideId,
                        sharedGroupId: rideData.sharedGroupId,
                        driverId,
                        summary,
                        createdAt: FieldValue.serverTimestamp(),
                        source: "backend"
                    });

                    tx.update(rideRef, closureUpdates);
                    
                    logger.info(`[SHARED_RIDE_OPERATIONAL_CLOSURE] Ride ${rideId}, Status: ${closureUpdates.sharedOperationalStatus}`);
                } else if (isEveryRequestTerminal && rideData.sharedOperationalStatus) {
                    logger.info(`[SHARED_RIDE_ALREADY_OPERATIONALLY_CLOSED] Ride ${rideId}`);
                }
            }

            const eventRef = db.collection(`rides/${rideId}/shared_events`).doc();
            const auditEvent = {
                id: eventRef.id,
                type: `shared_${action}`,
                rideId,
                sharedGroupId: rideData.sharedGroupId,
                requestId,
                passengerId: reqData.passengerId,
                driverId,
                action,
                previousStatus: currentStatus,
                newStatus: newStatus,
                createdAt: FieldValue.serverTimestamp(),
                source: "driver_app"
            };
            tx.set(eventRef, auditEvent);

            return { success: true, newStatus };
        });

        return result;

    } catch (error: any) {
        logger.error(`[SHARED_STATUS_REJECTED] Error updating shared status:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error interno al actualizar estado.');
    }
});

/**
 * Avanza el estado de una parada específica en un viaje compartido.
 * Maneja llegadas, subidas (pickup) y bajadas (dropoff).
 */
function haversineDistance(coords1: { lat: number; lng: number; }, coords2: { lat: number; lng: number; }): number {
    const toRad = (x: number) => x * Math.PI / 180;
    const R = 6371e3; 
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const advanceSharedRideStopV1 = onCall({ cors: true, region: 'us-central1' }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const { rideId, stopOrder, requestId, stopType, action } = request.data;
    const driverId = request.auth.uid;

    if (!rideId || !action) {
        throw new HttpsError('invalid-argument', 'rideId y action son obligatorios.');
    }
    
    // Validar identificadores
    if (!requestId || !stopType) {
        if (typeof stopOrder !== 'number') {
            throw new HttpsError('invalid-argument', 'Debes proveer requestId y stopType, o stopOrder como fallback.');
        }
    }

    const db = getDb();
    const rideRef = db.doc(`rides/${rideId}`);

    try {
        const result = await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists) throw new Error('Viaje no encontrado.');
            const rideData = rideSnap.data() as Ride;

            if (rideData.driverId !== driverId) {
                throw new Error('No autorizado. Solo el conductor asignado puede avanzar paradas.');
            }

            if (!rideData.isSharedRide || !rideData.orderedStops) {
                throw new Error('Este no es un viaje compartido válido.');
            }

            // [GUARD – Opción A] Validate ALL stops have requestId before proceeding.
            // If any stop lacks requestId the ride was created with corrupt data and must
            // NOT advance. Fail loudly so the group is flagged for manual cleanup.
            assertOrderedStopsHaveRequestIds(
                rideData.orderedStops as any[],
                rideId,
                'advanceSharedRideStopV1'
            );

            let stopIndex = -1;
            if (requestId && stopType) {
                stopIndex = rideData.orderedStops.findIndex((s: any) => s.requestId === requestId && s.type === stopType);
            } else if (typeof stopOrder === 'number') {
                stopIndex = rideData.orderedStops.findIndex((s: any, idx: number) => s.order === stopOrder || idx === stopOrder);
            }

            if (stopIndex === -1) throw new HttpsError('not-found', 'Parada no encontrada en la hoja de ruta.');
            
            const stop = rideData.orderedStops[stopIndex];
            const stopRequestId = stop.requestId;
            const resolvedStopOrder = typeof stopOrder === 'number' ? stopOrder : ((stop as any).order ?? (stopIndex + 1));

            // [GUARD] requestId is mandatory on every stop. If missing, it means the ride
            // was created with corrupt sharedPassengers data. Fail loudly instead of silently.
            if (!stopRequestId) {
                logger.error(`[ADVANCE_STOP_CORRUPT_DATA] Stop at index ${stopIndex} in ride ${rideId} has no requestId. Stop data:`, JSON.stringify(stop));
                throw new HttpsError('failed-precondition', `CORRUPT_STOP_DATA: La parada ${stopIndex} no tiene requestId. Contacta soporte. (rideId=${rideId})`);
            }

            // [GUARD] passengerId on stop must also be present
            if (!stop.passengerId) {
                logger.warn(`[ADVANCE_STOP_MISSING_PASSENGER_ID] Stop at index ${stopIndex} in ride ${rideId} has no passengerId. requestId=${stopRequestId}`);
            }

            // Validar que no se salten paradas anteriores
            const previousStopsIncomplete = rideData.orderedStops.slice(0, stopIndex).some((s: any) => s.status !== 'completed' && s.status !== 'skipped');
            if (previousStopsIncomplete) {
                throw new Error('Debes completar las paradas anteriores primero.');
            }

            // ==========================================
            // FASE A: LECTURAS (STRICT)
            // ==========================================
            // (rideSnap is already read above)
            const reqRef = db.doc(`shared_ride_requests/${stopRequestId}`);
            const reqSnap = await tx.get(reqRef);
            let reqData: any = null;
            if (reqSnap.exists) {
                reqData = reqSnap.data() as SharedRideRequest;
            }

            // [SAFETY] Read ALL group requests to cross-validate before any completion.
            // This prevents completing the ride if a request says a passenger is still aboard
            // even if orderedStops disagrees (data inconsistency defense).
            const allGroupRequestsSnap = await tx.get(
                db.collection('shared_ride_requests').where('groupId', '==', rideData.sharedGroupId)
            );
            const allGroupRequests = allGroupRequestsSnap.docs.map(d => ({ ...(d.data() as SharedRideRequest), id: d.id }));

            // ==========================================
            // FASE B: CÁLCULO PURO
            // ==========================================
            let newStopStatus = stop.status || 'pending';
            let newPassengerStatus = '';
            let rideStatusUpdate = rideData.status;

            switch (action) {
                case 'arrive':
                    if (newStopStatus === 'completed' || newStopStatus === 'skipped' || newStopStatus === 'arrived') {
                        return { success: true, message: 'La parada ya se encontraba en estado arrived/completed.' };
                    }
                    newStopStatus = 'arrived';
                    break;
                
                case 'confirm_pickup':
                    if (stop.type !== 'pickup') throw new HttpsError('invalid-argument', 'Esta acción solo es válida para paradas de subida.');
                    if (newStopStatus === 'completed' || newStopStatus === 'skipped') {
                        return { success: true, message: 'La parada ya se encontraba completada.' };
                    }
                    newStopStatus = 'completed';
                    newPassengerStatus = 'picked_up';
                    if (rideData.status === 'driver_assigned' || rideData.status === 'driver_arrived') {
                        rideStatusUpdate = 'in_progress';
                    }
                    break;
                
                case 'confirm_dropoff':
                    if (stop.type !== 'dropoff') throw new HttpsError('invalid-argument', 'Esta acción solo es válida para paradas de bajada.');
                    if (newStopStatus === 'completed' || newStopStatus === 'skipped') {
                        return { success: true, message: 'La parada ya se encontraba completada.' };
                    }
                    newStopStatus = 'completed';
                    newPassengerStatus = 'dropped_off';
                    break;
                
                case 'no_show':
                    if (stop.type !== 'pickup') throw new HttpsError('invalid-argument', 'Esta acción solo es válida para paradas de subida.');
                    if (newStopStatus === 'completed' || newStopStatus === 'skipped') {
                        return { success: true, message: 'La parada ya se encontraba procesada.' };
                    }
                    newStopStatus = 'skipped';
                    newPassengerStatus = 'no_show';
                    // We'll also mark the corresponding dropoff as skipped
                    break;
                
                default:
                    throw new HttpsError('invalid-argument', 'Acción no válida (arrive, confirm_pickup, confirm_dropoff, no_show).');
            }

            // Actualizar orderedStops
            let updatedOrderedStops = [...rideData.orderedStops];
            const now = admin.firestore.Timestamp.now();
            updatedOrderedStops[stopIndex] = {
                ...stop,
                status: newStopStatus,
                updatedAt: now,
                arrivedAt: action === 'arrive' ? now : (stop.arrivedAt || null),
                completedAt: (action === 'confirm_pickup' || action === 'confirm_dropoff' || action === 'no_show') ? now : (stop.completedAt || null)
            };

            // [NO_SHOW LOGIC] If no-show, skip the corresponding dropoff
            if (action === 'no_show') {
                const dropoffIndex = updatedOrderedStops.findIndex((s: any) => s.type === 'dropoff' && s.requestId === stopRequestId);
                if (dropoffIndex !== -1) {
                    updatedOrderedStops[dropoffIndex] = {
                        ...updatedOrderedStops[dropoffIndex],
                        status: 'skipped',
                        updatedAt: now,
                        completedAt: now
                    };
                }
            }

            // [ROUTE_OPTIMIZATION] Greedy dropoff reordering if all pickups are complete
            if (action === 'confirm_pickup' && newPassengerStatus === 'picked_up') {
                const allPickupsDone = updatedOrderedStops.filter((s: any) => s.type === 'pickup').every((s: any) => s.status === 'completed' || s.status === 'skipped');
                if (allPickupsDone) {
                    let currentLoc = stop.location || rideData.origin; 
                    const pendingDropoffs = updatedOrderedStops.filter((s: any) => s.type === 'dropoff' && (s.status === 'pending' || !s.status));
                    const otherStops = updatedOrderedStops.filter((s: any) => !(s.type === 'dropoff' && (s.status === 'pending' || !s.status)));
                    
                    const optimizedDropoffs = [];
                    
                    while (pendingDropoffs.length > 0) {
                        let nearestIdx = 0;
                        let minDst = Infinity;
                        for (let i = 0; i < pendingDropoffs.length; i++) {
                            const dst = haversineDistance(currentLoc, pendingDropoffs[i].location);
                            if (dst < minDst) {
                                minDst = dst;
                                nearestIdx = i;
                            }
                        }
                        const nearest = pendingDropoffs.splice(nearestIdx, 1)[0];
                        optimizedDropoffs.push(nearest);
                        currentLoc = nearest.location;
                    }
                    
                    // Reassemble preserving stable reference array length
                    const newStops = [...otherStops, ...optimizedDropoffs];
                    updatedOrderedStops = newStops.map((s, i) => ({ ...s, order: i }));
                }
            }

            // Actualizar sharedPassengers array
            const updatedSharedPassengers = (rideData.sharedPassengers || []).map((p: any) => {
                if (newPassengerStatus && (p.requestId === stopRequestId || p.passengerId === stop.passengerId)) {
                    return { ...p, status: newPassengerStatus };
                }
                return p;
            });

            // Actualizar routePlan (para compatibilidad)
            const updatedRoutePlan = updatedOrderedStops.map((s: any) => ({ ...s }));

            // Preparar objetos de escritura
            const rideUpdates: any = {
                orderedStops: updatedOrderedStops,
                sharedPassengers: updatedSharedPassengers,
                routePlan: updatedRoutePlan,
                status: rideStatusUpdate,
                currentStopIndex: stopIndex,
                currentStopStatus: newStopStatus,
                currentStopPassengerId: stop.passengerId,
                currentStopType: stop.type,
                routeUpdatedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };

            const allStopsCompleted = updatedOrderedStops.every((s: any) => s.status === 'completed' || s.status === 'skipped');

            // [SAFETY CROSS-CHECK] Verify that request statuses also confirm all passengers are done.
            // A passenger in 'picked_up' state means they are physically still aboard the vehicle.
            // We must NOT complete the ride if anyone is still picked_up, regardless of what orderedStops says.
            const terminalStatesForStop = ['dropped_off', 'no_show', 'undeclared_companion', 'cancelled', 'expired'];
            const updatedGroupRequestsForCheck = allGroupRequests.map((r: any) => {
                if (r.id === stopRequestId && newPassengerStatus) {
                    return { ...r, status: newPassengerStatus };
                }
                return r;
            });
            const allRequestsTerminal = allGroupRequests.length > 0
                ? updatedGroupRequestsForCheck.every((r: any) => terminalStatesForStop.includes(r.status))
                : true;
            const safeAllStopsCompleted = allStopsCompleted && allRequestsTerminal;

            if (allStopsCompleted && !allRequestsTerminal) {
                logger.error(`[SAFETY_GUARD] allStopsCompleted=true BUT requests not terminal for ride ${rideId}. Passenger still aboard? Skipping premature completion.`, {
                    requestStatuses: updatedGroupRequestsForCheck.map((r: any) => ({ id: r.id, status: r.status, passengerName: r.passengerName }))
                });
            }

            if (safeAllStopsCompleted) {
                rideUpdates.status = 'completed';
                rideUpdates.completedAt = FieldValue.serverTimestamp();
            }

            let childRideId: string | null = null;
            let childRidePayload: any = null;
            let reqUpdates: any = null;
            let userUpdates: any = null;

            if (newPassengerStatus) {
                if (newPassengerStatus === 'dropped_off' && reqData) {
                    childRideId = `shared_child_${rideId}_${stop.passengerId}`;
                    reqUpdates = {
                        status: newPassengerStatus,
                        droppedOffAt: now,
                        completedAt: now,
                        updatedAt: FieldValue.serverTimestamp()
                    };
                    
                    childRidePayload = {
                        id: childRideId,
                        isSharedChildRide: true,
                        isSharedRide: true,
                        masterRideId: rideId,
                        sharedGroupId: rideData.sharedGroupId,
                        sharedRequestId: requestId,
                        passengerId: stop.passengerId,
                        driverId: driverId,
                        origin: reqData.origin,
                        destination: reqData.destination,
                        status: 'completed',
                        completedAt: now,
                        pickedUpAt: reqData.pickedUpAt || now,
                        droppedOffAt: now,
                        countsForHistory: true,
                        countsForWeeklyPot: true,
                        financialSettlementSource: "shared_master",
                        preventDuplicateFinancialLedger: true,
                        pricing: {
                            estimatedTotal: reqData.finalFareCash || reqData.sharedFareEstimate || 0,
                            originalTotal: reqData.individualFareReference || 0,
                            breakdown: {
                                baseFare: reqData.finalFareCash || reqData.sharedFareEstimate || 0,
                                distanceFare: 0,
                            }
                        },
                        individualQuotedFare: reqData.individualFareReference || 0,
                        sharedFare: reqData.finalFareCash || reqData.sharedFareEstimate || 0,
                        savingsAmount: reqData.passengerSavingAmount || 0,
                        groupGrossAmount: rideData.pricing?.estimatedTotal || 0,
                        paymentMethod: reqData.paymentMethod || 'cash',
                        cityKey: rideData.cityKey || 'rawson',
                        createdAt: reqData.createdAt,
                        updatedAt: FieldValue.serverTimestamp()
                    };
                } else {
                    reqUpdates = {
                        status: newPassengerStatus,
                        updatedAt: FieldValue.serverTimestamp()
                    };
                    if (action === 'confirm_pickup') {
                        reqUpdates.pickedUpAt = now;
                    }
                }

                if (newPassengerStatus === 'dropped_off' || newPassengerStatus === 'no_show') {
                    userUpdates = {
                        activeRideId: newPassengerStatus === 'dropped_off' && childRideId ? childRideId : FieldValue.delete(),
                        activeSharedRequestId: FieldValue.delete(),
                        activeSharedRideGroupId: FieldValue.delete(),
                        sharedRideStatus: newPassengerStatus === 'dropped_off' ? 'completed' : 'no_show',
                        updatedAt: FieldValue.serverTimestamp()
                    };
                }
            }

            const eventPayload: any = {
                id: db.collection(`rides/${rideId}/shared_events`).doc().id, // Se asigna ID
                type: `shared_stop_${action}`,
                rideId,
                stopOrder: resolvedStopOrder,
                stopType: stop.type,
                passengerId: stop.passengerId,
                newStopStatus,
                createdAt: FieldValue.serverTimestamp(),
                source: "driver_app"
            };
            if (newPassengerStatus) {
                eventPayload.newPassengerStatus = newPassengerStatus;
            }

            // ==========================================
            // FASE C: ESCRITURAS (STRICT)
            // ==========================================
            tx.update(rideRef, rideUpdates);

            if (newPassengerStatus && reqUpdates) {
                tx.update(reqRef, reqUpdates);
            }

            if (childRideId && childRidePayload) {
                const childRideRef = db.collection('rides').doc(childRideId);
                tx.set(childRideRef, childRidePayload);
            }

            if (userUpdates) {
                const targetPassengerId = reqData?.passengerId || stop.passengerId;
                if (targetPassengerId) {
                    const userRef = db.doc(`users/${targetPassengerId}`);
                    tx.update(userRef, userUpdates);
                } else {
                    logger.warn(`[ADVANCE_STOP_WARNING] Cannot apply userUpdates, passengerId is missing for stop ${stopRequestId}`);
                }
            }

            const eventRef = db.collection(`rides/${rideId}/shared_events`).doc(eventPayload.id);
            tx.set(eventRef, eventPayload);

            return { success: true, allStopsCompleted: safeAllStopsCompleted };
        });

        // Si terminó el viaje completo, disparar settlement y liberar conductor
        if (result.allStopsCompleted) {
            await settleSharedRideFinancialsV1(rideId).catch(e => logger.error(`[SETTLE_ERROR] Shared ride ${rideId}:`, e));
            
            const driverRef = db.doc(`users/${driverId}`);
            await driverRef.update({
                activeRideId: FieldValue.delete(),
                isAvailable: true,
                driverStatus: 'online',
                updatedAt: FieldValue.serverTimestamp()
            }).catch(e => logger.error(`[DRIVER_LIBERATION_ERROR] Driver ${driverId}:`, e));
        }

        return result;

    } catch (error: any) {
        logger.error(`[ADVANCE_STOP_ERROR] Ride ${rideId}, Stop ${stopOrder || requestId || 'unknown'}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al avanzar la parada.');
    }
});

/**
 * Realiza la liquidación financiera de un viaje compartido.
 */
export async function settleSharedRideFinancialsV1(rideId: string) {
    const db = getDb();
    const rideRef = db.doc(`rides/${rideId}`);

    try {
        await db.runTransaction(async (tx) => {
            const rideSnap = await tx.get(rideRef);
            if (!rideSnap.exists) return;
            const rideData = rideSnap.data() as Ride;

            if (rideData.sharedSettlementStatus === 'settled' || rideData.sharedSettlementStatus === 'not_applicable') {
                logger.info(`[SHARED_SETTLEMENT_ALREADY_DONE] Ride ${rideId}`);
                return;
            }

            if (!rideData.isSharedRide) {
                logger.error(`[SHARED_SETTLEMENT_ERROR] Ride ${rideId} is not a shared ride.`);
                return;
            }

            const cityKey = rideData.cityKey || 'rawson';
            const pricing = await getPricingConfig(cityKey);

            const requestsSnap = await tx.get(
                db.collection('shared_ride_requests').where('groupId', '==', rideData.sharedGroupId)
            );
            
            const allRequests = requestsSnap.docs.map(d => ({
                ...d.data() as SharedRideRequest,
                id: d.id
            }));
            
            const settledRequests = allRequests.filter(r => r.status === 'dropped_off');

            const totalRequests = allRequests.length;
            const droppedOffCount = settledRequests.length;
            const noShowCount = allRequests.filter(r => r.status === 'no_show').length;
            const undeclaredCompanionCount = allRequests.filter(r => r.status === 'undeclared_companion').length;
            const cancelledCount = allRequests.filter(r => r.status === 'cancelled' || r.status === 'expired').length;

            if (droppedOffCount === 0) {
                tx.update(rideRef, {
                    sharedSettlementStatus: 'not_applicable',
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                const eventRef = db.collection(`rides/${rideId}/shared_events`).doc();
                tx.set(eventRef, {
                    id: eventRef.id,
                    type: 'shared_settlement_skipped_no_valid_passengers',
                    rideId,
                    sharedGroupId: rideData.sharedGroupId,
                    driverId: rideData.driverId,
                    createdAt: FieldValue.serverTimestamp(),
                    source: "backend"
                });
                logger.info(`[SHARED_SETTLEMENT_SKIPPED] Ride ${rideId} has no dropped_off passengers.`);
                return;
            }

            const grossSharedCash = settledRequests.reduce((sum, r) => sum + (r.finalFareCash || r.sharedFareEstimate || 0), 0);
            const totalIndividualFare = settledRequests.reduce((sum, r) => sum + (r.individualFareReference || 0), 0);
            const totalPassengerSavings = settledRequests.reduce((sum, r) => sum + ((r as any).passengerSavingAmount || 0), 0);
            
            const driverSubtype = rideData.driverSubtypeSnapshot || 'express';
            
            const totalCommissionRate = 0.10;
            const totalCommissionAmount = Math.round(grossSharedCash * totalCommissionRate);
            const vamoNetAmount = Math.round(grossSharedCash * 0.06);
            const municipalAmount = Math.round(grossSharedCash * 0.02);
            const taxiAssociationAmount = Math.round(grossSharedCash * 0.01);
            const remisAssociationAmount = Math.round(grossSharedCash * 0.01);
            const totalAssociationsAmount = taxiAssociationAmount + remisAssociationAmount;
            
            const driverNetAfterCommission = grossSharedCash - totalCommissionAmount;

            const financialSummary = {
                totalRequests,
                settledRequests: droppedOffCount,
                droppedOffCount,
                noShowCount,
                undeclaredCompanionCount,
                cancelledCount,
                grossSharedCash,
                commissionBase: grossSharedCash,
                totalCommissionAmount,
                municipalAmount,
                vamoNetAmount,
                taxiAssociationAmount,
                remisAssociationAmount,
                totalAssociationsAmount,
                driverNetAfterCommission,
                commissionRate: totalCommissionRate,
                municipalRate: 0.02,
                totalIndividualFare,
                totalPassengerSavings,
                currency: "ARS",
                settledAt: FieldValue.serverTimestamp()
            };

            const movements = [
                {
                    amount: driverNetAfterCommission,
                    type: 'ride_earning' as const,
                    rideId: rideId,
                    note: `Ganancia neta VamO Compartido (${droppedOffCount} pax)`
                },
                {
                    amount: -grossSharedCash,
                    type: 'cash_collected' as const,
                    rideId: rideId,
                    note: `Efectivo cobrado VamO Compartido (${droppedOffCount} pax)`
                }
            ];

            await addWalletMovements(rideData.driverId!, movements, cityKey, tx);

            if (municipalAmount > 0) {
                const muniAccRef = db.doc(`municipal_accounts/${cityKey}`);
                tx.set(muniAccRef, {
                    cityKey,
                    currentBalance: FieldValue.increment(municipalAmount),
                    totalAccumulated: FieldValue.increment(municipalAmount),
                    lastMovementAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    status: 'active'
                }, { merge: true });

                const muniTxRef = db.collection('platform_transactions').doc(`muni_shared_${rideId}`);
                tx.set(muniTxRef, {
                    cityKey,
                    rideId,
                    amount: municipalAmount,
                    type: 'municipal_contribution',
                    note: `Participación municipal VamO Compartido ${rideId}`,
                    createdAt: FieldValue.serverTimestamp(),
                    systemVersion: 'v4_shared_settlement'
                });
            }

            tx.update(rideRef, {
                sharedSettlementStatus: 'settled',
                sharedSettlementId: `shared_settlement_${rideId}`,
                sharedSettledAt: FieldValue.serverTimestamp(),
                sharedFinancialSummary: financialSummary,
                updatedAt: FieldValue.serverTimestamp()
            });

            const eventRef = db.collection(`rides/${rideId}/shared_events`).doc();
            tx.set(eventRef, {
                id: eventRef.id,
                type: 'shared_settlement_completed',
                rideId,
                sharedGroupId: rideData.sharedGroupId,
                driverId: rideData.driverId,
                summary: financialSummary,
                createdAt: FieldValue.serverTimestamp(),
                source: "backend"
            });

            logger.info(`[SHARED_SETTLEMENT_SUCCESS] Ride ${rideId}, Gross: ${grossSharedCash}, Commission: ${totalCommissionAmount}`);

            await generateSharedRideReceiptsV1(rideId, tx, { ...rideData, sharedFinancialSummary: financialSummary }, financialSummary, requestsSnap);
        });
    } catch (error: any) {
        logger.error(`[SHARED_SETTLEMENT_FAILED] Ride ${rideId}:`, error);
        await db.doc(`rides/${rideId}`).update({
            sharedSettlementStatus: 'failed',
            settlementError: error.message,
            updatedAt: FieldValue.serverTimestamp()
        });
    }
}

/**
 * Genera los recibos para pasajeros y conductor una vez liquidado el viaje.
 */
export async function generateSharedRideReceiptsV1(
    rideId: string, 
    tx: admin.firestore.Transaction,
    rideData: Ride,
    summary: any,
    requestsSnap: admin.firestore.QuerySnapshot
) {
    const db = getDb();
    const rideRef = db.doc(`rides/${rideId}`);

    if (rideData.sharedReceiptsGenerated === true || rideData.sharedReceiptsGenerated === 'not_applicable') {
        logger.info(`[SHARED_RECEIPTS_ALREADY_DONE] Ride ${rideId}`);
        return;
    }

    if (rideData.sharedSettlementStatus === 'not_applicable') {
        tx.update(rideRef, {
            sharedReceiptsGenerated: 'not_applicable',
            sharedReceiptsGeneratedAt: FieldValue.serverTimestamp()
        });
        return;
    }

    const passengerBreakdown: any[] = [];

    for (const doc of requestsSnap.docs) {
        const req = doc.data() as SharedRideRequest;
        const reqRef = doc.ref;

        if (req.status === 'dropped_off') {
            const receipt = {
                type: "shared_passenger_receipt",
                rideId,
                sharedGroupId: rideData.sharedGroupId || "",
                requestId: doc.id,
                passengerId: req.passengerId,
                driverId: rideData.driverId || "",
                driverName: rideData.driverName || "Conductor",
                cityKey: rideData.cityKey || "",
                origin: req.origin,
                destination: req.destination,
                status: "completed",
                paymentMethod: "cash",
                farePaid: req.finalFareCash || req.sharedFareEstimate || 0,
                individualFareReference: req.individualFareReference || 0,
                sharedFareRaw: (req as any).sharedFareRaw || 0,
                sharedPaymentPercent: (req as any).sharedPaymentPercent || 1,
                sharedPassengerCount: (req as any).sharedPassengerCount || 1,
                savingsAmount: req.passengerSavingAmount || 0,
                savingsPercent: req.passengerSavingPercent || 0,
                completedAt: rideData.completedAt || FieldValue.serverTimestamp(),
                settledAt: summary.settledAt || FieldValue.serverTimestamp(),
                isShared: true,
                createdAt: FieldValue.serverTimestamp()
            };

            tx.update(reqRef, {
                passengerReceipt: receipt,
                updatedAt: FieldValue.serverTimestamp()
            });

            passengerBreakdown.push({
                passengerId: req.passengerId,
                passengerName: req.passengerName,
                status: req.status,
                amount: receipt.farePaid
            });
        } else {
            const opReceipt = {
                type: "shared_operational_no_charge",
                status: req.status,
                reason: req.status === 'no_show' ? 'Pasajero no se presentó' : (req.status === 'undeclared_companion' ? 'Acompañante no declarado' : 'Cancelado'),
                amount: 0,
                isFinancialReceipt: false,
                createdAt: FieldValue.serverTimestamp()
            };

            tx.update(reqRef, {
                operationalReceipt: opReceipt,
                updatedAt: FieldValue.serverTimestamp()
            });

            passengerBreakdown.push({
                passengerId: req.passengerId,
                passengerName: req.passengerName,
                status: req.status,
                amount: 0
            });
        }
    }

    const driverReceiptSummary = {
        type: "shared_driver_summary",
        rideId,
        sharedGroupId: rideData.sharedGroupId,
        driverId: rideData.driverId,
        cityKey: rideData.cityKey,
        paymentMethod: "cash",
        ...summary,
        passengerBreakdown,
        createdAt: FieldValue.serverTimestamp()
    };

    tx.update(rideRef, {
        sharedDriverReceiptSummary: driverReceiptSummary,
        sharedReceiptsGenerated: true,
        sharedReceiptsGeneratedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const eventRefP = db.collection(`rides/${rideId}/shared_events`).doc();
    tx.set(eventRefP, {
        id: eventRefP.id,
        type: 'shared_passenger_receipts_created',
        rideId,
        sharedGroupId: rideData.sharedGroupId,
        driverId: rideData.driverId,
        count: summary.settledRequests || 0,
        createdAt: FieldValue.serverTimestamp(),
        source: "backend"
    });

    const eventRefD = db.collection(`rides/${rideId}/shared_events`).doc();
    tx.set(eventRefD, {
        id: eventRefD.id,
        type: 'shared_driver_summary_created',
        rideId,
        sharedGroupId: rideData.sharedGroupId,
        driverId: rideData.driverId,
        createdAt: FieldValue.serverTimestamp(),
        source: "backend"
    });

    logger.info(`[SHARED_RECEIPTS_SUCCESS] Generated receipts for Ride ${rideId}`);
}

/**
 * [VamO Compartido V2.1] Listar grupos cercanos compatibles
 */
export const listNearbySharedRideGroupsV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { origin, destination, cityKey: rawCityKey } = request.data;
    const cityKey = normalizeCityKey(rawCityKey || '');

    if (!origin || !destination || !cityKey) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros: origin, destination, cityKey.');
    }

    const db = getDb();
    const groupsSnap = await db.collection('shared_ride_groups')
        .where('cityKey', '==', cityKey)
        .where('status', 'in', ['forming', 'pending_passenger_confirmation'])
        .where('isPubliclyJoinable', '==', true)
        .limit(20)
        .get();

    const results: any[] = [];
    const now = Date.now();

    for (const doc of groupsSnap.docs) {
        const group = doc.data() as SharedRideGroup;
        
        // Skip expired
        const expiresAt = group.expiresAt?.toDate ? group.expiresAt.toDate() : null;
        if (expiresAt && expiresAt.getTime() < now) continue;

        // Skip full
        if (group.occupiedSeats >= 4) continue;

        // Fetch requests to check compatibility
        const memberRequests: SharedRideRequest[] = [];
        for (const rid of group.requestIds) {
            const rSnap = await db.doc(`shared_ride_requests/${rid}`).get();
            if (rSnap.exists) memberRequests.push(rSnap.data() as SharedRideRequest);
        }

        // Simular solicitud entrante para chequear compatibilidad
        const virtualRequest: SharedRideRequest = {
            id: 'virtual',
            passengerId: request.auth.uid,
            passengerName: 'Pasajero',
            cityKey,
            origin,
            destination,
            status: 'proposed',
            individualFareReference: group.estimatedIndividualFare,
            paymentMethod: 'cash',
            sharedRideNoticeAccepted: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        const compatibility = evaluateSharedRouteCompatibility([...memberRequests, virtualRequest]);
        
        const distanceToPickupM = getDistanceM(origin, group.pickupStops[0]);
        const IS_WITHIN_RANGE = distanceToPickupM <= 1500;

        if (compatibility.compatible && IS_WITHIN_RANGE) {
            logger.info(`[SHARED_RIDE_GROUP_VISIBLE] Group ${group.id} is compatible and within range (${Math.round(distanceToPickupM)}m) for user ${request.auth.uid}`);
            
            // Derivar lista de seat IDs ocupados desde seatMap
            const seatMapRaw = group.seatMap as any;
            const occupiedSeatIds: string[] = (seatMapRaw && typeof seatMapRaw === 'object' && seatMapRaw !== 'LEGACY')
                ? Object.keys(seatMapRaw)
                : [];

            results.push({
                groupId: group.id,
                distanceToPickupM,
                compatibilityScore: Math.round((1 - compatibility.extraDistancePercent) * 100),
                passengerCount: group.requestCount ?? group.passengerIds?.length ?? 1,
                maxPassengers: group.maxRequests ?? 2,
                expiresAt: group.expiresAt,
                estimatedDelayMin: Math.round(compatibility.extraDurationSeconds / 60),
                approximateDestinationLabel: group.dropoffStops[group.dropoffStops.length - 1].address || 'Destino cercano',
                occupiedSeats: occupiedSeatIds,  // ← IDs de asientos ya tomados
            });
        } else {
            if (!IS_WITHIN_RANGE) {
                logger.info(`[SHARED_RIDE_GROUP_HIDDEN_TOO_FAR] Group ${group.id} is too far (${Math.round(distanceToPickupM)}m) for user ${request.auth.uid}`);
            } else if (!compatibility.compatible) {
                logger.info(`[SHARED_RIDE_GROUP_HIDDEN_INCOMPATIBLE] Group ${group.id} not compatible: ${compatibility.reason}`);
            }
        }
    }

    logger.info(`[SHARED_RIDE_LIST_NEARBY] Found ${results.length} compatible groups within 1500m for user ${request.auth.uid}`);

    // Ordenar por distancia y score
    results.sort((a, b) => (a.distanceToPickupM - b.distanceToPickupM) || (b.compatibilityScore - a.compatibilityScore));

    logger.info(`[SHARED_RIDE_LIST_NEARBY] Found ${results.length} compatible groups for ${request.auth.uid}`);
    return { groups: results };
});

/**
 * [VamO Compartido V2.1] Unirse manualmente a un grupo
 */
export const joinSharedRideGroupV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const passengerId = request.auth.uid;
    const { groupId, origin, destination, cityKey: rawCityKey, individualFareReference, sharedRideNoticeAccepted, selectedSeats } = request.data;
    const cityKey = normalizeCityKey(rawCityKey || '');

    if (!groupId || !origin || !destination || !cityKey || !individualFareReference) {
        throw new HttpsError('invalid-argument', 'Faltan parámetros obligatorios.');
    }

    const db = getDb();
    const userRef = db.doc(`users/${passengerId}`);
    const groupRef = db.doc(`shared_ride_groups/${groupId}`);

    try {
        const result = await db.runTransaction(async (tx) => {
            const [userSnap, groupSnap] = await Promise.all([tx.get(userRef), tx.get(groupRef)]);

            if (!userSnap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
            const userData = userSnap.data() as UserProfile;

            if (userData.activeSharedRequestId || userData.activeRideId) {
                throw new HttpsError('already-exists', 'Ya tienes una solicitud o viaje activo.', {
                    activeRideId: userData.activeRideId || null,
                    activeSharedGroupId: (userData as any).activeSharedGroupId || null,
                    activeSharedRequestId: userData.activeSharedRequestId || null,
                    isRecoverable: true
                });
            }

            // Removido: Los usuarios con beneficio Express pueden unirse a compartidos (con tarifa plana compartida).

            if (!groupSnap.exists) throw new HttpsError('not-found', 'El grupo ya no existe.');
            const groupData = groupSnap.data() as SharedRideGroup;

            if (!['forming', 'pending_passenger_confirmation'].includes(groupData.status)) {
                throw new HttpsError('failed-precondition', 'El grupo no está en un estado válido para unirse.');
            }

            const maxRequests = groupData.maxRequests ?? 2;
            if ((groupData.requestCount ?? groupData.requestIds.length) >= maxRequests) {
                throw new HttpsError('failed-precondition', 'El grupo ya está lleno (máx ' + maxRequests + ' usuarios).');
            }

            const now = Date.now();
            const expiresAt = groupData.expiresAt?.toDate ? groupData.expiresAt.toDate() : null;
            if (expiresAt && expiresAt.getTime() < now) {
                throw new HttpsError('failed-precondition', 'La oferta del grupo ha expirado.');
            }

            // Validar compatibilidad nuevamente (Transaccional)
            const memberRequests: SharedRideRequest[] = [];
            for (const rid of groupData.requestIds) {
                const rSnap = await tx.get(db.doc(`shared_ride_requests/${rid}`));
                if (rSnap.exists) memberRequests.push(rSnap.data() as SharedRideRequest);
            }

            const requestId = db.collection('shared_ride_requests').doc().id;

            // Calcular asientos del nuevo pasajero ANTES de crear el request
            type SeatId = 'front_passenger' | 'rear_left' | 'rear_center' | 'rear_right';
            let newSeatLabels: SeatId[] = [];
            if (Array.isArray(selectedSeats) && selectedSeats.length > 0) {
                newSeatLabels = selectedSeats as SeatId[];
            } else {
                const validSeats: SeatId[] = ['rear_right', 'front_passenger', 'rear_left', 'rear_center'];
                const currentSeatMap = (groupData.seatMap && typeof groupData.seatMap === 'object') ? { ...groupData.seatMap as any } : {};
                const available = validSeats.filter(s => !currentSeatMap[s]);
                if (available.length > 0) {
                    newSeatLabels = [available[0]];
                } else {
                    throw new HttpsError('failed-precondition', 'No hay asientos disponibles en este grupo.');
                }
            }
            const newSeatCount = newSeatLabels.length;

            const newRequest: SharedRideRequest = {
                id: requestId,
                passengerId,
                passengerName: userData.name || 'Pasajero',
                cityKey,
                origin,
                destination,
                status: 'forming',
                roleInGroup: 'joined',
                groupId: groupData.id,
                individualFareReference,
                paymentMethod: 'cash',
                seatCount: newSeatCount,
                selectedSeats: newSeatLabels,
                sharedRideNoticeAccepted: !!sharedRideNoticeAccepted,
                sharedRideNoticeAcceptedAt: FieldValue.serverTimestamp(),
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };

            const compatibility = evaluateSharedRouteCompatibility([...memberRequests, newRequest]);
            
            const distanceToAnchorM = getDistanceM(origin, groupData.pickupStops[0]);
            if (distanceToAnchorM > 1500) {
                logger.warn(`[SHARED_RIDE_JOIN_REJECTED_ORIGIN_TOO_FAR] Passenger ${passengerId} too far from anchor: ${Math.round(distanceToAnchorM)}m`);
                throw new HttpsError('failed-precondition', `ORIGIN_TOO_FAR: Estás a ${Math.round(distanceToAnchorM)}m del origen del grupo (máx 1500m).`);
            }

            if (!compatibility.compatible) {
                logger.warn(`[SHARED_RIDE_JOIN_REJECTED_INCOMPATIBLE] Passenger ${passengerId} not compatible with group ${groupId}: ${compatibility.reason}`);
                throw new HttpsError('failed-precondition', `No compatible: ${compatibility.reason}`);
            }

            // Calcular nuevos asientos ocupados acumulando sobre los existentes
            const existingOccupied = groupData.occupiedSeats ?? 0;
            const newOccupiedSeats = existingOccupied + newSeatCount;
            const updatedRequestIds = [...groupData.requestIds, newRequest.id];
            const updatedPassengerIds = [...groupData.passengerIds, passengerId];

            // Construir seatMap actualizado con los asientos del nuevo pasajero
            const existingSeatMap = (groupData.seatMap && typeof groupData.seatMap === 'object') ? { ...groupData.seatMap as any } : {};
            for (const seatId of newSeatLabels) {
                existingSeatMap[seatId] = { passengerId, requestId, passengerName: userData.name || 'Pasajero' };
            }

            // [FIX] Use builder to guarantee requestId is always present in joinSharedRideGroupV1
            const newPassengerEntry = buildSharedPassengerGroupEntry({
                requestId,           // ← from db.collection().doc().id above
                passengerId,
                passengerName: userData.name || 'Pasajero',
                roleInGroup: 'joined',
                pickupAddress: origin.address || '',
                dropoffAddress: destination.address || ''
            });

            // Recalcular precios de forma individual para cada pasajero en el grupo
            let totalSharedFare = 0;
            const allRequests = [...memberRequests, newRequest];
            
            const updatedRequestPricings = allRequests.map(req => {
                const reqPricing = calculateSharedPricing({
                    individualFareReference: req.individualFareReference,
                    totalOccupiedSeats: newOccupiedSeats,
                    requestSeatCount: req.seatCount || 1,
                    cityKey
                });
                totalSharedFare += reqPricing.sharedFarePerPassenger;
                return {
                    requestId: req.id,
                    pricing: reqPricing
                };
            });

            // Encontrar la tarifa del creador como referencia para el grupo
            const creatorPricing = updatedRequestPricings.find(p => p.requestId === groupData.requestIds[0])?.pricing || updatedRequestPricings[0].pricing;

            const driverBenefitAmount = totalSharedFare - groupData.estimatedIndividualFare;
            const driverBenefitPercent = groupData.estimatedIndividualFare > 0 
                ? driverBenefitAmount / groupData.estimatedIndividualFare 
                : 0;

            // Validación estricta de requestId en orderedStops
            if (!compatibility.orderedStops || compatibility.orderedStops.some((s: any) => !s.requestId || !s.location || !s.type)) {
                logger.error(`[CRITICAL] Error al generar orderedStops. Hay campos undefined.`, compatibility.orderedStops);
                throw new HttpsError('internal', 'Error fatal: no se pudo mapear la parada al pasajero correctamente.');
            }

            const groupUpdate: any = {
                requestIds: updatedRequestIds,
                passengerIds: updatedPassengerIds,
                passengers: FieldValue.arrayUnion(newPassengerEntry),
                occupiedSeats: newOccupiedSeats,
                requestCount: updatedRequestIds.length,  // ← incrementar contador de usuarios
                seatMap: existingSeatMap,                // ← guardar seatMap con los asientos del nuevo pasajero
                sharedFarePerPassenger: creatorPricing.sharedFarePerPassenger,
                estimatedSharedTotal: totalSharedFare,
                driverBenefitAmount,
                driverBenefitPercent,
                pickupStops: compatibility.pickupStops,
                dropoffStops: compatibility.dropoffStops,
                orderedStops: compatibility.orderedStops,
                updatedAt: FieldValue.serverTimestamp()
            };

            // Lanzar conductor cuando el grupo está lleno de usuarios (requestCount >= maxRequests)
            const isGroupNowFull = updatedRequestIds.length >= maxRequests;
            if (isGroupNowFull) {
                groupUpdate.status = 'ready_for_driver';
                groupUpdate.launchReason = 'group_full';
                groupUpdate.hasMinimumPassengers = true;
                groupUpdate.isPubliclyJoinable = false;
                groupUpdate.driverSearchStartsAt = FieldValue.serverTimestamp();
                groupUpdate.closingExpiresAt = FieldValue.serverTimestamp();
                logger.info(`[SHARED_RIDE_DRIVER_READY] Group ${groupId} is FULL. Launching driver search.`);
                
                // Actualizar todas las solicitudes a 'confirmed' y setear su precio final
                for (const item of updatedRequestPricings) {
                    if (item.requestId === requestId) {
                        newRequest.sharedFareEstimate = item.pricing.sharedFarePerPassenger;
                        newRequest.passengerSavingAmount = item.pricing.passengerSavingAmount;
                        newRequest.passengerSavingPercent = item.pricing.passengerSavingPercent;
                        newRequest.status = 'confirmed';
                        newRequest.finalFareCash = item.pricing.sharedFarePerPassenger;
                    } else {
                        tx.update(db.doc(`shared_ride_requests/${item.requestId}`), {
                            status: 'confirmed',
                            sharedFareEstimate: item.pricing.sharedFarePerPassenger,
                            passengerSavingAmount: item.pricing.passengerSavingAmount,
                            passengerSavingPercent: item.pricing.passengerSavingPercent,
                            finalFareCash: item.pricing.sharedFarePerPassenger,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                }
            } else if (newOccupiedSeats >= 2 && !groupData.hasMinimumPassengers) {
                groupUpdate.status = 'forming'; // Eliminamos pending_passenger_confirmation
                groupUpdate.hasMinimumPassengers = true;
                groupUpdate.isPubliclyJoinable = true; // Pax 3 y 4 pueden unirse
                
                groupUpdate.launchReason = 'min_passengers_reached';
                groupUpdate.minPassengersToLaunch = 2;
                logger.info(`[SHARED_RIDE_DRIVER_COUNTDOWN] Group ${groupId} reached 2 pax. Maintaining forming status. Global timer preserved.`);
                
                // Todos pasan a grouped, ya no requieren confirmación
                for (const item of updatedRequestPricings) {
                    if (item.requestId === requestId) {
                        newRequest.sharedFareEstimate = item.pricing.sharedFarePerPassenger;
                        newRequest.passengerSavingAmount = item.pricing.passengerSavingAmount;
                        newRequest.passengerSavingPercent = item.pricing.passengerSavingPercent;
                        newRequest.status = 'grouped';
                    } else {
                        tx.update(db.doc(`shared_ride_requests/${item.requestId}`), {
                            status: 'grouped',
                            sharedFareEstimate: item.pricing.sharedFarePerPassenger,
                            passengerSavingAmount: item.pricing.passengerSavingAmount,
                            passengerSavingPercent: item.pricing.passengerSavingPercent,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                }
            } else {
                // Caso fallback (1 pax u otro)
                const joinedPricing = updatedRequestPricings.find(p => p.requestId === requestId)?.pricing;
                if (joinedPricing) {
                    newRequest.sharedFareEstimate = joinedPricing.sharedFarePerPassenger;
                    newRequest.passengerSavingAmount = joinedPricing.passengerSavingAmount;
                    newRequest.passengerSavingPercent = joinedPricing.passengerSavingPercent;
                }
            }

            tx.set(db.doc(`shared_ride_requests/${requestId}`), newRequest);
            tx.update(userRef, { 
                activeSharedRequestId: requestId,
                activeSharedRideGroupId: groupId,
                sharedRideStatus: 'forming',
                updatedAt: FieldValue.serverTimestamp()
            });

            tx.update(groupRef, groupUpdate);

            logger.info(`[SHARED_RIDE_JOIN_SUCCESS] Passenger ${passengerId} joined group ${groupId}`);
            return { 
                ok: true, 
                requestId, 
                groupId, 
                roleInGroup: 'joined', 
                status: 'forming' 
            };
        });

        return result;
    } catch (error: any) {
        logger.error(`[SHARED_RIDE_JOIN_REJECTED] Error:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al unirse al grupo.');
    }
});
/**
 * [VamO Compartido V2.1] Lanzar búsqueda de conductor (al terminar cuenta regresiva o manual)
 */
export const launchSharedRideDriverSearchV1 = onCall({ cors: true, region: 'us-central1' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { groupId } = request.data;
    if (!groupId) throw new HttpsError('invalid-argument', 'groupId es requerido.');

    const db = getDb();
    const groupRef = db.doc(`shared_ride_groups/${groupId}`);

    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(groupRef);
            if (!snap.exists) throw new HttpsError('not-found', 'Grupo no encontrado.');
            const data = snap.data() as SharedRideGroup;

            // Idempotencia: Solo lanzar si está en forming
            if (data.status !== 'forming') {
                logger.warn(`[SHARED_RIDE_SEARCH_SKIPPED_DUPLICATE] Group ${groupId} already in status ${data.status}.`);
                return { success: true, alreadyStarted: true };
            }

            // Validar que realmente pasaron los 60s (o margen de seguridad)
            const now = Date.now();
            const startsAt = (data.driverSearchStartsAt as any)?.toMillis?.() || (data.driverSearchStartsAt as any)?.seconds * 1000 || 0;
            
            if (startsAt === 0) {
                throw new HttpsError('failed-precondition', 'El grupo no está listo para lanzar búsqueda.');
            }

            // [REGRESO UX] Transición a ready_for_driver
            tx.update(groupRef, {
                status: 'ready_for_driver',
                isPubliclyJoinable: false,
                driverSearchTriggeredAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            logger.info(`[SHARED_RIDE_DRIVER_SEARCH_TRIGGERED] Group ${groupId} launched driver search by ${request.auth?.uid}`);
        });

        // Lanzar despacho fuera de la transacción anterior para manejar su propia lógica transaccional y matching
        await dispatchSharedRideGroupIfReady(groupId, 'manual_launch');

        return { success: true };
    } catch (error: any) {
        logger.error(`[SHARED_RIDE_LAUNCH_ERROR] Error in launchSharedRideDriverSearchV1:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Error al lanzar búsqueda.');
    }
});
/**
 * [VamO Compartido V2.2] Watchdog de Grupos Compartidos
 * Ejecuta cada 1 minuto para expirar grupos que vencieron sin alcanzar el mínimo de 2 pasajeros.
 */
export const sharedRideWatchdogV1 = onSchedule({
    schedule: "every 1 minutes",
    region: "us-central1",
    memory: "256MiB"
}, async (event: ScheduledEvent) => {
    const db = getDb();
    const now = Timestamp.now();
    const featureSnap = await db.doc(`features/sharedRide`).get();
    const featureConfig = featureSnap.exists ? (featureSnap.data() as SharedRideFeatureConfig) : null;
    const driverSearchEnabled = featureConfig?.driverSearchEnabled === true;

    logger.info("[SHARED_RIDE_WATCHDOG] Auditando grupos en formación y cierre...");

    // Caso A: Grupos que expiraron en etapa de formación (8m)
    const formingSnap = await db.collection('shared_ride_groups')
        .where('status', '==', 'forming')
        .where('expiresAt', '<=', now)
        .get();

    // Caso B: Grupos que alcanzaron el mínimo y terminó su ventana de cierre (1m)
    const closingSnap = await db.collection('shared_ride_groups')
        .where('status', 'in', ['forming', 'pending_passenger_confirmation'])
        .where('hasMinimumPassengers', '==', true)
        .where('closingExpiresAt', '<=', now)
        .get();

    const allGroups = [...formingSnap.docs];
    // Evitar duplicados si coinciden ambos timers
    for (const d of closingSnap.docs) {
        if (!allGroups.find(g => g.id === d.id)) allGroups.push(d);
    }

    if (allGroups.length === 0) return;

    logger.info(`[SHARED_RIDE_WATCHDOG] Detectados ${allGroups.length} grupos para procesar.`);

    for (const groupDoc of allGroups) {
        const group = groupDoc.data() as SharedRideGroup;
        const groupId = groupDoc.id;

        // Si ya está bloqueado y el despacho sigue desactivado, no hacer nada peligroso
        if (group.driverSearchBlockedForBeta === true && !driverSearchEnabled) {
            logger.info(`[SHARED_RIDE_WATCHDOG_SKIP] Group ${groupId} is already blocked for beta. Skipping.`);
            continue;
        }

        // [VamO PRO] Auditoría rigurosa de pasajeros válidos
        let validPassengerCount = 0;
        const terminalStates = ['cancelled', 'completed', 'expired', 'no_show', 'undeclared_companion', 'rejected'];

        for (const rid of group.requestIds) {
            const rSnap = await db.doc(`shared_ride_requests/${rid}`).get();
            if (rSnap.exists) {
                const rData = rSnap.data() as SharedRideRequest;
                if (!terminalStates.includes(rData.status)) {
                    validPassengerCount++;
                }
            }
        }

        if (validPassengerCount < 2) {
            logger.warn(`[SHARED_RIDE_WATCHDOG] Expirando grupo ${groupId} (Pax válidos: ${validPassengerCount})`);
            
            await db.runTransaction(async (tx) => {
                // 1. ALL READS FIRST
                const requestSnaps = await Promise.all(
                    group.requestIds.map(rid => tx.get(db.doc(`shared_ride_requests/${rid}`)))
                );
                
                // 2. ALL WRITES
                // Marcar grupo como expirado
                tx.update(groupDoc.ref, {
                    status: 'expired',
                    expiredAt: FieldValue.serverTimestamp(),
                    expiredReason: 'timeout_minimum_passengers_not_reached',
                    hasMinimumPassengers: false,
                    updatedAt: FieldValue.serverTimestamp()
                });

                // Marcar todas las solicitudes del grupo como expiradas y limpiar pasajeros
                for (let i = 0; i < group.requestIds.length; i++) {
                    const requestId = group.requestIds[i];
                    const reqSnap = requestSnaps[i];
                    
                    tx.update(db.doc(`shared_ride_requests/${requestId}`), {
                        status: 'expired',
                        expiredAt: FieldValue.serverTimestamp(),
                        expiredReason: 'timeout_minimum_passengers_not_reached',
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    if (reqSnap.exists) {
                        const passengerId = reqSnap.data()?.passengerId;
                        if (passengerId) {
                            await clearPassengerSharedRideState(tx, passengerId, 'watchdog_group_expired');
                        }
                    }
                }
                
                logger.info(`[SHARED_RIDE_EXPIRED_TIMEOUT] Grupo ${groupId} limpiado por falta de pasajeros.`);
            });
        } else {
            // NO se expira. Se fuerza el despacho.
            logger.info(`[SHARED_RIDE_WATCHDOG] Grupo ${groupId} tiene ${validPassengerCount} pax. Forzando despacho por fin de tiempo.`);
            await dispatchSharedRideGroupIfReady(groupId, 'watchdog_ttl_expired');
        }
    }
});

/**
 * [VamO PRO] dispatchSharedRideGroupIfReady
 * Función central e idempotente para convertir un grupo en un viaje real y lanzar matching.
 */
export async function dispatchSharedRideGroupIfReady(groupId: string, reason: string = 'unknown') {
    const db = getDb();
    const groupRef = db.doc(`shared_ride_groups/${groupId}`);
    const rideId = `shared_${groupId}`;
    const rideRef = db.doc(`rides/${rideId}`);

    logger.info(`[SHARED_DISPATCH] Attempting dispatch for group ${groupId}. Reason: ${reason}`);

    try {
        let shouldTriggerMatching = false;

        await db.runTransaction(async (tx) => {
            const featureRef = db.doc(`features/sharedRide`);
            const [groupSnap, rideSnap, featureSnap] = await Promise.all([
                tx.get(groupRef),
                tx.get(rideRef),
                tx.get(featureRef)
            ]);

            if (!groupSnap.exists) {
                logger.warn(`[SHARED_DISPATCH_ABORT] Group ${groupId} does not exist.`);
                return;
            }

            const group = groupSnap.data() as SharedRideGroup;
            const featureConfig = featureSnap.exists ? (featureSnap.data() as SharedRideFeatureConfig) : null;
            const driverSearchEnabled = featureConfig?.driverSearchEnabled === true;

            // Beta Guard: si driverSearchEnabled !== true, abortar despacho y marcar grupo
            if (!driverSearchEnabled) {
                logger.info(`[SHARED_BETA_GUARD] Driver search disabled for shared ride group ${groupId}`);
                
                tx.update(groupRef, {
                    status: 'ready_for_driver',
                    driverSearchBlockedForBeta: true,
                    driverSearchBlockedReason: "shared_beta_driver_search_disabled",
                    driverSearchBlockedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });

                // Actualizar solicitudes a confirmed usando set con merge para evitar fallos FATALES si no existe el doc
                for (const rid of group.requestIds) {
                    tx.set(db.doc(`shared_ride_requests/${rid}`), {
                        status: 'confirmed',
                        updatedAt: FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                return;
            }

            // 1. Idempotencia: Si ya tiene rideId final o el ride ya existe
            if (group.finalRideId || group.status === 'ready_for_driver' || group.status === 'searching_driver') {
                if (rideSnap.exists) {
                    logger.info(`[SHARED_DISPATCH_IDEMPOTENCY] Group ${groupId} already dispatched to ride ${rideId}.`);
                    const rideData = rideSnap.data() as Ride;
                    if (rideData.status === 'searching') shouldTriggerMatching = true;
                    return;
                }
            }

            // 2. Validaciones de negocio
            const validPassengerCount = group.passengerIds?.length || 0;
            if (validPassengerCount < 2) {
                logger.warn(`[SHARED_DISPATCH_ABORT] Group ${groupId} has insufficient passengers (${validPassengerCount}).`);
                return;
            }

            // 3. Crear el viaje (Ride)
            // IMPORTANTE: passengerId es obligatorio para triggers de rides.ts
            // Usamos el primer pasajero como 'titular' del documento principal.
            const primaryPassengerId = group.passengerIds[0];

            const rideData: any = {
                id: rideId,
                rideType: 'shared',
                isSharedRide: true,
                serviceType: 'shared',
                sharedGroupId: groupId,
                sharedRequestIds: group.requestIds,
                passengerIds: group.passengerIds,
                passengerId: primaryPassengerId, // CRITICAL FIX
                sharedPassengerCount: group.occupiedSeats,
                seatMap: group.seatMap || {},
                pickupStops: group.pickupStops,
                dropoffStops: group.dropoffStops,
                orderedStops: group.orderedStops,
                paymentMethod: 'cash',
                totalFare: group.estimatedSharedTotal,
                cashExpected: group.estimatedSharedTotal,
                sharedFarePerPassenger: group.sharedFarePerPassenger,
                individualFareReference: group.estimatedIndividualFare,
                driverBenefitAmount: group.driverBenefitAmount,
                driverBenefitPercent: group.driverBenefitPercent,
                cityKey: group.cityKey,
                status: 'searching',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                origin: group.pickupStops[0],
                destination: group.dropoffStops[group.dropoffStops.length - 1],
                passengerName: "VamO Compartido",
                sharedPricingSnapshot: {
                    farePerPassenger: group.sharedFarePerPassenger,
                    totalFare: group.estimatedSharedTotal,
                    benefitAmount: group.driverBenefitAmount,
                    benefitPercent: group.driverBenefitPercent
                },
                routeCompatibilitySnapshot: group.routeCompatibility || null,
                
                // Blocked benefits for shared rides rule
                blockedBenefits: ["social", "retired", "disability", "express", "promo", "coupon"],
                appliedBenefitType: "shared_fare_only",
                socialBenefitDiscountAmount: 0,
                expressDiscountAmount: 0,
                promoDiscountAmount: 0,
                couponDiscountAmount: 0,
                benefitDiscountAmount: 0,
                
                pricing: {
                    estimated: {
                        total: group.estimatedSharedTotal,
                        breakdown: {
                            baseFare: group.sharedFarePerPassenger,
                            distanceFare: 0,
                            timeFare: 0,
                            waitingFare: 0,
                            subtotal: group.estimatedSharedTotal,
                            serviceMultiplier: 1.0,
                            urgentCharge: 0,
                            assistanceFee: 0,
                            minimumFareApplied: false,
                            total: group.estimatedSharedTotal,
                            expressDiscountAmount: 0,
                            expressDiscountPercent: 0
                        },
                        configSnapshot: {},
                        calculatedAt: FieldValue.serverTimestamp()
                    },
                    estimatedTotal: group.estimatedSharedTotal,
                    originalTotal: group.estimatedSharedTotal,
                    expressDiscountAmount: 0,
                    creditCoveredAmount: 0,
                    creditsApplied: false,
                    serviceType: 'shared',
                    driverReceivesTotal: group.estimatedSharedTotal,
                    passengerPaysTotal: group.estimatedSharedTotal,
                    walletCoveredAmount: 0,
                    cashToCollect: group.estimatedSharedTotal,
                    paymentMethodSnapshot: 'cash',
                    compensationAmount: 0,
                    socialBenefitDiscountAmount: 0,
                    promoDiscountAmount: 0,
                    couponDiscountAmount: 0,
                    benefitDiscountAmount: 0,
                    appliedBenefitType: "shared_fare_only",
                    blockedBenefits: ["social", "retired", "disability", "express", "promo", "coupon"]
                }
            };

            // 2.5 Fetch Requests to get snapshots for the driver (Critical for route visibility)
            const requestSnaps = await Promise.all(
                group.requestIds.map(rid => tx.get(db.doc(`shared_ride_requests/${rid}`)))
            );
            const requestMap: Record<string, SharedRideRequest> = {};
            requestSnaps.forEach(snap => {
                if (snap.exists) requestMap[snap.id] = snap.data() as SharedRideRequest;
            });

            // 3. Build enriched route and passengers
            // [FIX] requestId MUST be present on every stop and sharedPassenger entry.
            // Without it, acceptRideV2 and advanceSharedRideStopV1 cannot update requests.
            const enrichedOrderedStops = (group.orderedStops || []).map(stop => {
                if (!stop.requestId) {
                    logger.error(`[CRITICAL_DATA_INTEGRITY] Stop in group ${groupId} missing requestId. Stop:`, JSON.stringify(stop));
                    throw new HttpsError('failed-precondition', `CORRUPT_GROUP_DATA: Una parada del grupo no tiene requestId. groupId=${groupId}`);
                }
                const req = requestMap[stop.requestId];
                const stopAny = stop as any;
                return {
                    ...stop,
                    passengerId: req?.passengerId || stopAny.passengerId || 'unknown',
                    passengerName: req?.passengerName || stopAny.passengerName || 'Pasajero',
                    requestId: stop.requestId, // [FIX] Explicitly preserve requestId
                    status: 'pending'
                };
            });

            // [FIX] Each sharedPassenger MUST have requestId. This was the root cause
            // of the cascading failure: acceptRideV2 iterated sharedPassengers and
            // checked `if (p.requestId)` — which was always false, so requests were
            // never updated to driver_assigned, causing stuck states for all users.
            const sharedPassengers = (group.requestIds || []).map(rid => {
                const req = requestMap[rid];
                if (!req) {
                    logger.error(`[CRITICAL_DATA_INTEGRITY] No request found for rid=${rid} in group ${groupId}`);
                    throw new HttpsError('failed-precondition', `MISSING_REQUEST: No se encontró la solicitud ${rid} del grupo.`);
                }
                if (!req.passengerId) {
                    logger.error(`[CRITICAL_DATA_INTEGRITY] Request ${rid} missing passengerId in group ${groupId}`);
                    throw new HttpsError('failed-precondition', `CORRUPT_REQUEST_DATA: La solicitud ${rid} no tiene passengerId.`);
                }
                return {
                    requestId: rid,              // [FIX] THE MISSING FIELD — was never set before
                    passengerId: req.passengerId,
                    passengerName: req.passengerName || 'Pasajero',
                    pickupAddress: req.origin?.address || '',
                    dropoffAddress: req.destination?.address || '',
                    individualQuotedFare: req.individualFareReference || 0,
                    sharedFare: req.sharedFareEstimate || req.finalFareCash || 0,
                    savingsAmount: req.passengerSavingAmount || 0,
                    status: 'waiting_pickup',
                    seatCount: req.seatCount || 1,
                    selectedSeats: req.selectedSeats || []
                };
            });

            // [GUARD] Final integrity check before writing to Firestore
            for (const p of sharedPassengers) {
                if (!p.requestId || !p.passengerId) {
                    logger.error(`[CRITICAL_GUARD_FAILED] sharedPassenger missing requestId or passengerId:`, JSON.stringify(p));
                    throw new HttpsError('failed-precondition', 'INTEGRITY_GUARD: sharedPassenger incompleto. Abortando dispatch.');
                }
            }

            const routePlan = enrichedOrderedStops.map((stop, index) => ({
                order: index + 1,
                type: stop.type as 'pickup' | 'dropoff',
                passengerId: requestMap[stop.requestId]?.passengerId || 'unknown',
                passengerName: stop.passengerName,
                address: stop.location?.address || '',
                status: 'pending'
            }));

            rideData.orderedStops = enrichedOrderedStops;
            rideData.sharedPassengers = sharedPassengers;
            rideData.routePlan = routePlan;

            tx.set(rideRef, rideData);

            // 4. Actualizar el grupo
            tx.update(groupRef, {
                status: 'ready_for_driver',
                finalRideId: rideId,
                isPubliclyJoinable: false,
                dispatchStartedAt: FieldValue.serverTimestamp(),
                launchReason: reason,
                updatedAt: FieldValue.serverTimestamp()
            });

            // 5. Actualizar solicitudes
            for (const rid of group.requestIds) {
                tx.set(db.doc(`shared_ride_requests/${rid}`), {
                    status: 'assigned',
                    finalRideId: rideId,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            }

            // 6. Actualizar punteros de usuarios
            for (const pid of group.passengerIds) {
                tx.set(db.doc(`users/${pid}`), {
                    activeRideId: rideId,
                    sharedRideStatus: 'searching_driver',
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            }

            shouldTriggerMatching = true;
            logger.info(`[SHARED_DISPATCH_SUCCESS] Group ${groupId} converted to Ride ${rideId}`);
        });

        // 7. Lanzar matching engine (fuera de la transacción)
        if (shouldTriggerMatching) {
            logger.info(`[SHARED_DISPATCH_MATCHING] Triggering findNextDriverAndCreateOffer for ride ${rideId}`);
            await findNextDriverAndCreateOffer(rideId).catch(e => {
                logger.error(`[SHARED_DISPATCH_MATCHING_ERROR] Failed for ride ${rideId}:`, e);
            });
        }

    } catch (error: any) {
        logger.error(`[SHARED_DISPATCH_FATAL] Error dispatching group ${groupId}:`, error);
        await groupRef.update({
            lastDispatchError: error.message || 'Error desconocido',
            updatedAt: FieldValue.serverTimestamp()
        }).catch(() => {});
    }
}
