/**
 * [VamO Compartido] Helpers defensivos para construcción y validación de pasajeros compartidos.
 *
 * Regla de negocio (Opción A – fail hard):
 * Ningún grupo, viaje o función crítica puede operar si un sharedPassenger
 * no tiene `requestId`. Si falta, se lanza error `failed-precondition` inmediatamente.
 */

import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// Tipo canónico de entrada de pasajero en shared_ride_groups.passengers[]
// ─────────────────────────────────────────────────────────────────────────────
export interface SharedPassengerGroupEntry {
    /** ID del documento shared_ride_requests. OBLIGATORIO. */
    requestId: string;
    passengerId: string;
    passengerName: string;
    roleInGroup: 'creator' | 'joined';
    joinedAt: Timestamp;
    status: 'joined';
    pickupAddress: string;
    dropoffAddress: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo canónico de entrada en rides.sharedPassengers[]
// ─────────────────────────────────────────────────────────────────────────────
export interface SharedPassengerRideEntry {
    /** ID del documento shared_ride_requests. OBLIGATORIO. */
    requestId: string;
    passengerId: string;
    passengerName: string;
    pickupAddress: string;
    dropoffAddress: string;
    individualQuotedFare: number;
    sharedFare: number;
    savingsAmount: number;
    status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye un objeto de pasajero para `group.passengers[]`.
 * Falla en tiempo de ejecución si `requestId` es vacío o undefined.
 */
export function buildSharedPassengerGroupEntry(params: {
    requestId: string;
    passengerId: string;
    passengerName: string;
    roleInGroup: 'creator' | 'joined';
    pickupAddress: string;
    dropoffAddress: string;
}): SharedPassengerGroupEntry {
    if (!params.requestId) {
        logger.error('[BUILD_SHARED_PASSENGER] requestId is empty. Params:', JSON.stringify(params));
        throw new HttpsError(
            'failed-precondition',
            `INTEGRITY_ERROR: Se intentó construir un pasajero compartido sin requestId (passengerId=${params.passengerId}). Abortando.`
        );
    }
    if (!params.passengerId) {
        logger.error('[BUILD_SHARED_PASSENGER] passengerId is empty. Params:', JSON.stringify(params));
        throw new HttpsError(
            'failed-precondition',
            `INTEGRITY_ERROR: Se intentó construir un pasajero compartido sin passengerId. Abortando.`
        );
    }
    return {
        requestId: params.requestId,
        passengerId: params.passengerId,
        passengerName: params.passengerName || 'Pasajero',
        roleInGroup: params.roleInGroup,
        joinedAt: Timestamp.now(),
        status: 'joined',
        pickupAddress: params.pickupAddress || '',
        dropoffAddress: params.dropoffAddress || '',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que todos los entries de `sharedPassengers` (en un Ride) tengan `requestId`.
 * Si alguno falta, lanza `failed-precondition` inmediatamente (Opción A – fail hard).
 *
 * @param sharedPassengers - Array de pasajeros del campo `ride.sharedPassengers`
 * @param rideId - Para logging contextual
 * @param callerContext - Nombre de la función que llama, para logs
 */
export function assertSharedPassengersHaveRequestIds(
    sharedPassengers: Array<{ requestId?: string; passengerId?: string }>,
    rideId: string,
    callerContext: string
): void {
    if (!sharedPassengers || sharedPassengers.length === 0) {
        logger.error(`[${callerContext}] sharedPassengers array is empty or missing in ride ${rideId}.`);
        throw new HttpsError(
            'failed-precondition',
            `CORRUPT_RIDE_DATA: El viaje ${rideId} no tiene pasajeros compartidos. No se puede continuar. (ctx=${callerContext})`
        );
    }

    for (let i = 0; i < sharedPassengers.length; i++) {
        const p = sharedPassengers[i];
        if (!p.requestId) {
            logger.error(
                `[${callerContext}] CORRUPT_DATA: sharedPassengers[${i}] missing requestId in ride ${rideId}. ` +
                `passengerId=${p.passengerId}. Full entry: ${JSON.stringify(p)}`
            );
            throw new HttpsError(
                'failed-precondition',
                `CORRUPT_RIDE_DATA: El pasajero ${i} del viaje ${rideId} no tiene requestId. ` +
                `Este viaje fue creado con datos corruptos. Requiere limpieza manual. (ctx=${callerContext})`
            );
        }
        if (!p.passengerId) {
            logger.error(
                `[${callerContext}] CORRUPT_DATA: sharedPassengers[${i}] missing passengerId in ride ${rideId}. ` +
                `requestId=${p.requestId}. Full entry: ${JSON.stringify(p)}`
            );
            throw new HttpsError(
                'failed-precondition',
                `CORRUPT_RIDE_DATA: El pasajero ${i} del viaje ${rideId} no tiene passengerId. ` +
                `Este viaje fue creado con datos corruptos. Requiere limpieza manual. (ctx=${callerContext})`
            );
        }
    }
}

/**
 * Verifica que todos los orderedStops de un Ride tengan `requestId`.
 * Si alguno falta, lanza `failed-precondition` inmediatamente.
 *
 * @param orderedStops - Array de paradas del campo `ride.orderedStops`
 * @param rideId - Para logging contextual
 * @param callerContext - Nombre de la función que llama, para logs
 */
export function assertOrderedStopsHaveRequestIds(
    orderedStops: Array<{ requestId?: string; type?: string }>,
    rideId: string,
    callerContext: string
): void {
    if (!orderedStops || orderedStops.length === 0) {
        logger.error(`[${callerContext}] orderedStops array is empty or missing in ride ${rideId}.`);
        throw new HttpsError(
            'failed-precondition',
            `CORRUPT_RIDE_DATA: El viaje ${rideId} no tiene paradas ordenadas. No se puede continuar. (ctx=${callerContext})`
        );
    }

    for (let i = 0; i < orderedStops.length; i++) {
        const s = orderedStops[i];
        if (!s.requestId) {
            logger.error(
                `[${callerContext}] CORRUPT_DATA: orderedStops[${i}] (type=${s.type}) missing requestId in ride ${rideId}. ` +
                `Full entry: ${JSON.stringify(s)}`
            );
            throw new HttpsError(
                'failed-precondition',
                `CORRUPT_RIDE_DATA: La parada ${i} (${s.type}) del viaje ${rideId} no tiene requestId. ` +
                `Este viaje fue creado con datos corruptos. Requiere limpieza manual. (ctx=${callerContext})`
            );
        }
    }
}
