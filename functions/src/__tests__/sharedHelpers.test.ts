/**
 * Tests unitarios para VamO Compartido — reparación del bug requestId=undefined.
 *
 * Estos tests corren WITHOUT Firebase emulator (pure unit tests).
 * Validan la lógica de construcción y validación de sharedPassengers.
 *
 * Para correr:
 *   cd functions && npm run test:shared
 */

import {
    buildSharedPassengerGroupEntry,
    assertSharedPassengersHaveRequestIds,
    assertOrderedStopsHaveRequestIds,
    SharedPassengerGroupEntry
} from '../lib/sharedHelpers';

// The HttpsError mock is injected via moduleNameMapper in jest config
import { HttpsError } from 'firebase-functions/v2/https';

// ─────────────────────────────────────────────────────────────────────────────
// Helper factories
// ─────────────────────────────────────────────────────────────────────────────

function makePassengerGroupEntry(overrides: Partial<SharedPassengerGroupEntry> = {}): SharedPassengerGroupEntry {
    return {
        requestId: 'req-abc-123',
        passengerId: 'user-111',
        passengerName: 'Ana García',
        roleInGroup: 'creator',
        joinedAt: expect.anything() as any,
        status: 'joined',
        pickupAddress: 'Calle Falsa 123',
        dropoffAddress: 'Av. Siempre Viva 456',
        ...overrides
    };
}

function makeSharedPassengerRide(overrides: any = {}): any {
    return {
        requestId: 'req-abc-123',
        passengerId: 'user-111',
        passengerName: 'Ana García',
        pickupAddress: 'Calle Falsa 123',
        dropoffAddress: 'Av. Siempre Viva 456',
        individualQuotedFare: 2000,
        sharedFare: 1200,
        savingsAmount: 800,
        status: 'waiting_pickup',
        ...overrides
    };
}

function makeOrderedStop(overrides: any = {}): any {
    return {
        type: 'pickup',
        requestId: 'req-abc-123',
        passengerId: 'user-111',
        location: { address: 'Calle Falsa 123', lat: -43.3, lng: -65.1 },
        status: 'pending',
        ...overrides
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 1: buildSharedPassengerGroupEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSharedPassengerGroupEntry', () => {
    test('Caso 1 — Grupo nuevo (creator): incluye requestId en passengers[0]', () => {
        const entry = buildSharedPassengerGroupEntry({
            requestId: 'req-creator-001',
            passengerId: 'user-creator',
            passengerName: 'Juan Pérez',
            roleInGroup: 'creator',
            pickupAddress: 'Origen A',
            dropoffAddress: 'Destino A',
        });

        expect(entry.requestId).toBe('req-creator-001');
        expect(entry.passengerId).toBe('user-creator');
        expect(entry.roleInGroup).toBe('creator');
        expect(entry.status).toBe('joined');
        expect(entry.pickupAddress).toBe('Origen A');
        expect(entry.dropoffAddress).toBe('Destino A');
    });

    test('Caso 2 — Unión automática a grupo existente: requestId presente en newPassengerEntry', () => {
        const entry = buildSharedPassengerGroupEntry({
            requestId: 'req-joined-002',
            passengerId: 'user-joiner',
            passengerName: 'María López',
            roleInGroup: 'joined',
            pickupAddress: 'Origen B',
            dropoffAddress: 'Destino B',
        });

        expect(entry.requestId).toBe('req-joined-002');
        expect(entry.passengerId).toBe('user-joiner');
        expect(entry.roleInGroup).toBe('joined');
    });

    test('Caso 3 — Unión manual (joinSharedRideGroupV1): requestId presente', () => {
        const entry = buildSharedPassengerGroupEntry({
            requestId: 'req-manual-003',
            passengerId: 'user-manual',
            passengerName: 'Carlos Ruiz',
            roleInGroup: 'joined',
            pickupAddress: 'Origen C',
            dropoffAddress: 'Destino C',
        });

        expect(entry.requestId).toBe('req-manual-003');
    });

    test('Falla con failed-precondition si requestId es string vacío', () => {
        expect(() => buildSharedPassengerGroupEntry({
            requestId: '',          // <── vacío
            passengerId: 'user-x',
            passengerName: 'X',
            roleInGroup: 'creator',
            pickupAddress: 'A',
            dropoffAddress: 'B',
        })).toThrow(HttpsError);

        expect(() => buildSharedPassengerGroupEntry({
            requestId: '',
            passengerId: 'user-x',
            passengerName: 'X',
            roleInGroup: 'creator',
            pickupAddress: 'A',
            dropoffAddress: 'B',
        })).toThrow('INTEGRITY_ERROR');
    });

    test('Falla con failed-precondition si requestId es undefined (campo ausente)', () => {
        const params = {
            passengerId: 'user-y',
            passengerName: 'Y',
            roleInGroup: 'creator' as const,
            pickupAddress: 'A',
            dropoffAddress: 'B',
        };

        // Cast to bypass TypeScript — simulates runtime data without requestId
        expect(() => buildSharedPassengerGroupEntry(params as any)).toThrow(HttpsError);
    });

    test('Falla con failed-precondition si passengerId es vacío', () => {
        expect(() => buildSharedPassengerGroupEntry({
            requestId: 'req-ok',
            passengerId: '',        // <── vacío
            passengerName: 'X',
            roleInGroup: 'creator',
            pickupAddress: 'A',
            dropoffAddress: 'B',
        })).toThrow(HttpsError);
    });

    test('Usa nombre por defecto si passengerName es vacío', () => {
        const entry = buildSharedPassengerGroupEntry({
            requestId: 'req-default-name',
            passengerId: 'user-noname',
            passengerName: '',
            roleInGroup: 'joined',
            pickupAddress: 'A',
            dropoffAddress: 'B',
        });
        expect(entry.passengerName).toBe('Pasajero');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2: assertSharedPassengersHaveRequestIds (ride.sharedPassengers)
// ─────────────────────────────────────────────────────────────────────────────

describe('assertSharedPassengersHaveRequestIds', () => {
    test('Caso OK — 2 pasajeros sanos: no lanza error', () => {
        const passengers = [
            makeSharedPassengerRide({ requestId: 'req-1', passengerId: 'user-1' }),
            makeSharedPassengerRide({ requestId: 'req-2', passengerId: 'user-2' }),
        ];

        expect(() =>
            assertSharedPassengersHaveRequestIds(passengers, 'ride-001', 'acceptRideV2')
        ).not.toThrow();
    });

    test('Caso OK — 4 pasajeros sanos: no lanza error', () => {
        const passengers = [1, 2, 3, 4].map(i =>
            makeSharedPassengerRide({ requestId: `req-${i}`, passengerId: `user-${i}` })
        );

        expect(() =>
            assertSharedPassengersHaveRequestIds(passengers, 'ride-full', 'acceptRideV2')
        ).not.toThrow();
    });

    test('Caso CORRUPTO — acceptRideV2 falla con failed-precondition si requestId undefined', () => {
        const passengers = [
            makeSharedPassengerRide({ requestId: 'req-1', passengerId: 'user-1' }),
            makeSharedPassengerRide({ requestId: undefined, passengerId: 'user-2' }), // <── corrupto
        ];

        let caughtError: any;
        try {
            assertSharedPassengersHaveRequestIds(passengers, 'ride-corrupto', 'acceptRideV2');
        } catch (e) {
            caughtError = e;
        }

        expect(caughtError).toBeInstanceOf(HttpsError);
        expect(caughtError.code).toBe('failed-precondition');
        expect(caughtError.message).toContain('CORRUPT_RIDE_DATA');
        expect(caughtError.message).toContain('ride-corrupto');
    });

    test('Caso CORRUPTO — requestId es null: falla con failed-precondition', () => {
        const passengers = [
            makeSharedPassengerRide({ requestId: null, passengerId: 'user-1' }), // <── null
        ];

        expect(() =>
            assertSharedPassengersHaveRequestIds(passengers, 'ride-null-req', 'acceptRideV2')
        ).toThrow(HttpsError);
    });

    test('Caso CORRUPTO — requestId es string vacío: falla', () => {
        const passengers = [
            makeSharedPassengerRide({ requestId: '', passengerId: 'user-1' }), // <── vacío
        ];

        expect(() =>
            assertSharedPassengersHaveRequestIds(passengers, 'ride-empty-req', 'acceptRideV2')
        ).toThrow(HttpsError);
    });

    test('Caso CORRUPTO — passengerId undefined: falla', () => {
        const passengers = [
            makeSharedPassengerRide({ requestId: 'req-1', passengerId: undefined }), // <── corrupto
        ];

        expect(() =>
            assertSharedPassengersHaveRequestIds(passengers, 'ride-no-paxid', 'acceptRideV2')
        ).toThrow(HttpsError);
    });

    test('Array vacío: falla con failed-precondition', () => {
        expect(() =>
            assertSharedPassengersHaveRequestIds([], 'ride-empty', 'acceptRideV2')
        ).toThrow(HttpsError);
    });

    test('Array null/undefined: falla con failed-precondition', () => {
        expect(() =>
            assertSharedPassengersHaveRequestIds(null as any, 'ride-null', 'acceptRideV2')
        ).toThrow(HttpsError);
    });

    test('El error incluye el callerContext en el mensaje', () => {
        const passengers = [
            makeSharedPassengerRide({ requestId: undefined, passengerId: 'user-1' }),
        ];

        let caughtError: any;
        try {
            assertSharedPassengersHaveRequestIds(passengers, 'ride-x', 'advanceSharedRideStopV1');
        } catch (e) {
            caughtError = e;
        }

        expect(caughtError.message).toContain('advanceSharedRideStopV1');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 3: assertOrderedStopsHaveRequestIds (ride.orderedStops)
// ─────────────────────────────────────────────────────────────────────────────

describe('assertOrderedStopsHaveRequestIds', () => {
    test('Caso OK — 4 paradas sanas (2 pickup, 2 dropoff): no lanza error', () => {
        const stops = [
            makeOrderedStop({ type: 'pickup',  requestId: 'req-1' }),
            makeOrderedStop({ type: 'pickup',  requestId: 'req-2' }),
            makeOrderedStop({ type: 'dropoff', requestId: 'req-1' }),
            makeOrderedStop({ type: 'dropoff', requestId: 'req-2' }),
        ];

        expect(() =>
            assertOrderedStopsHaveRequestIds(stops, 'ride-ok', 'advanceSharedRideStopV1')
        ).not.toThrow();
    });

    test('Avance de paradas no permite pasajeros sin requestId — falla con failed-precondition', () => {
        const stops = [
            makeOrderedStop({ type: 'pickup',  requestId: 'req-1' }),
            makeOrderedStop({ type: 'pickup',  requestId: undefined }), // <── corrupto
        ];

        let caughtError: any;
        try {
            assertOrderedStopsHaveRequestIds(stops, 'ride-corrupto', 'advanceSharedRideStopV1');
        } catch (e) {
            caughtError = e;
        }

        expect(caughtError).toBeInstanceOf(HttpsError);
        expect(caughtError.code).toBe('failed-precondition');
        expect(caughtError.message).toContain('CORRUPT_RIDE_DATA');
    });

    test('Stop con requestId null: falla', () => {
        const stops = [makeOrderedStop({ requestId: null })];

        expect(() =>
            assertOrderedStopsHaveRequestIds(stops, 'ride-null', 'advanceSharedRideStopV1')
        ).toThrow(HttpsError);
    });

    test('Array vacío de stops: falla', () => {
        expect(() =>
            assertOrderedStopsHaveRequestIds([], 'ride-empty', 'advanceSharedRideStopV1')
        ).toThrow(HttpsError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 4: Integración — flujo completo happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('Flujo completo — grupo de 2 pasajeros bien formados', () => {
    test('Grupo con 2 pasajeros: ambos tienen requestId, passengerId, origen y destino', () => {
        const creator = buildSharedPassengerGroupEntry({
            requestId: 'req-creator-final',
            passengerId: 'user-creator-final',
            passengerName: 'Lucía Fernández',
            roleInGroup: 'creator',
            pickupAddress: 'San Martín 100',
            dropoffAddress: 'Rivadavia 500',
        });

        const joiner = buildSharedPassengerGroupEntry({
            requestId: 'req-joiner-final',
            passengerId: 'user-joiner-final',
            passengerName: 'Marcos Díaz',
            roleInGroup: 'joined',
            pickupAddress: 'Belgrano 200',
            dropoffAddress: 'Mitre 300',
        });

        // Simular que se guardan en el grupo y luego se leen
        const groupPassengers = [creator, joiner];

        // Ambos tienen requestId válido
        expect(groupPassengers[0].requestId).toBe('req-creator-final');
        expect(groupPassengers[1].requestId).toBe('req-joiner-final');

        // Simular conversión a sharedPassengers de Ride (como hace dispatchSharedRideGroupIfReady)
        const ridePassengers = groupPassengers.map(p => ({
            requestId: p.requestId,
            passengerId: p.passengerId,
            passengerName: p.passengerName,
            pickupAddress: p.pickupAddress,
            dropoffAddress: p.dropoffAddress,
            individualQuotedFare: 2000,
            sharedFare: 1200,
            savingsAmount: 800,
            status: 'waiting_pickup',
        }));

        // Assertion de integridad no lanza error
        expect(() =>
            assertSharedPassengersHaveRequestIds(ridePassengers, 'ride-final-001', 'acceptRideV2')
        ).not.toThrow();
    });

    test('Cancelación antes de pickup — pasajero 2 cancela, pasajero 1 sigue con requestId', () => {
        // Simular un grupo de 2 donde el 2do cancela
        const creator = buildSharedPassengerGroupEntry({
            requestId: 'req-stays',
            passengerId: 'user-stays',
            passengerName: 'El que queda',
            roleInGroup: 'creator',
            pickupAddress: 'A',
            dropoffAddress: 'B',
        });

        const canceller = buildSharedPassengerGroupEntry({
            requestId: 'req-cancels',
            passengerId: 'user-cancels',
            passengerName: 'El que cancela',
            roleInGroup: 'joined',
            pickupAddress: 'C',
            dropoffAddress: 'D',
        });

        // Simular que se filtra el que cancela
        const remainingPassengers = [creator].filter(p => p.requestId !== 'req-cancels');
        expect(remainingPassengers).toHaveLength(1);
        expect(remainingPassengers[0].requestId).toBe('req-stays');

        // Los requestIds restantes son válidos
        const remainingRidePassengers = remainingPassengers.map(p => ({
            requestId: p.requestId,
            passengerId: p.passengerId,
            passengerName: p.passengerName,
            pickupAddress: p.pickupAddress,
            dropoffAddress: p.dropoffAddress,
            individualQuotedFare: 2000,
            sharedFare: 2000,
            savingsAmount: 0,
            status: 'waiting_pickup',
        }));

        // No lanza aunque quede solo 1 (aunque en producción el ride se cancela si quedan <2)
        expect(remainingRidePassengers[0].requestId).toBeDefined();
        expect(remainingRidePassengers[0].requestId).not.toBe('');
    });

    test('acceptRideV2 — viaje sano: assertSharedPassengersHaveRequestIds pasa sin error', () => {
        const healthyRidePassengers = [
            { requestId: 'req-a', passengerId: 'user-a', passengerName: 'A', pickupAddress: 'PA', dropoffAddress: 'DA', status: 'waiting_pickup' },
            { requestId: 'req-b', passengerId: 'user-b', passengerName: 'B', pickupAddress: 'PB', dropoffAddress: 'DB', status: 'waiting_pickup' },
        ];

        // Simula la llamada que hace acceptRideV2
        expect(() =>
            assertSharedPassengersHaveRequestIds(healthyRidePassengers, 'ride-sano', 'acceptRideV2')
        ).not.toThrow();
    });

    test('acceptRideV2 — viaje corrupto pre-fix: falla ANTES de asignar conductor', () => {
        // Simula un ride que fue creado ANTES del fix (sin requestId en sharedPassengers)
        const corruptRidePassengers = [
            { passengerId: 'user-a', passengerName: 'A', pickupAddress: 'PA', dropoffAddress: 'DA', status: 'waiting_pickup' }, // sin requestId
            { passengerId: 'user-b', passengerName: 'B', pickupAddress: 'PB', dropoffAddress: 'DB', status: 'waiting_pickup' }, // sin requestId
        ];

        let caughtError: any;
        try {
            assertSharedPassengersHaveRequestIds(corruptRidePassengers as any, 'ride-prefix', 'acceptRideV2');
        } catch (e) {
            caughtError = e;
        }

        expect(caughtError).toBeInstanceOf(HttpsError);
        expect(caughtError.code).toBe('failed-precondition');
        // El mensaje debe incluir info suficiente para el admin
        expect(caughtError.message).toContain('CORRUPT_RIDE_DATA');
        expect(caughtError.message).toContain('ride-prefix');
        expect(caughtError.message).toContain('Requiere limpieza manual');
    });

    test('advanceSharedRideStopV1 — paradas corruptas pre-fix: falla antes de avanzar', () => {
        const corruptStops = [
            { type: 'pickup', passengerId: 'user-a', location: { lat: -43, lng: -65, address: 'A' }, status: 'pending' }, // sin requestId
            { type: 'dropoff', passengerId: 'user-a', location: { lat: -43, lng: -65, address: 'A' }, status: 'pending' }, // sin requestId
        ];

        expect(() =>
            assertOrderedStopsHaveRequestIds(corruptStops as any, 'ride-stops-prefix', 'advanceSharedRideStopV1')
        ).toThrow(HttpsError);
    });
});
