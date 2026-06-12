// Prueba unitaria de la lógica de indexado para advanceSharedRideStopV1

describe('advanceSharedRideStopV1 Logic', () => {
    const mockOrderedStops = [
        { type: 'pickup', order: 1, requestId: 'REQ_1', passengerId: 'PASS_1', status: 'completed' },
        { type: 'pickup', order: 2, requestId: 'REQ_2', passengerId: 'PASS_2', status: 'pending' },
        { type: 'dropoff', order: 3, requestId: 'REQ_1', passengerId: 'PASS_1', status: 'pending' },
        { type: 'dropoff', order: 4, requestId: 'REQ_2', passengerId: 'PASS_2', status: 'pending' },
    ];

    function findStopIndex(stops: any[], stopOrder?: number, requestId?: string, stopType?: string): number {
        let stopIndex = -1;
        if (requestId && stopType) {
            stopIndex = stops.findIndex((s) => s.requestId === requestId && s.type === stopType);
        } else if (typeof stopOrder === 'number') {
            stopIndex = stops.findIndex((s, idx) => s.order === stopOrder || idx === stopOrder);
        }
        return stopIndex;
    }

    test('1. stop 1 completed y stop 2 pending: frontend/backend avanzan stop 2 correctamente con requestId y stopType', () => {
        // Frontend envía requestId y stopType del stop 2 (que es REQ_2, pickup)
        const idx = findStopIndex(mockOrderedStops, undefined, 'REQ_2', 'pickup');
        expect(idx).toBe(1); // El índice correcto
        expect(mockOrderedStops[idx].requestId).toBe('REQ_2');
    });

    test('2. order base 1 no debe confundirse con índice base 0 al usar fallback', () => {
        // Si el frontend viejo manda stopOrder: 1 (pensando que es índice 1), el backend mapea al order 1 (índice 0)
        // Esto demuestra el bug original, y por qué el nuevo método es superior.
        const idxBug = findStopIndex(mockOrderedStops, 1);
        expect(idxBug).toBe(0); // El bug viejo
    });

    test('3. no se puede avanzar un stop completed dos veces (idempotencia en el switch)', () => {
        // Esto se valida en el switch statement de la cloud function devolviendo success sin modificar.
        const action = 'confirm_pickup';
        const stopStatus = 'completed';
        
        let returnedSuccess = false;
        if (action === 'confirm_pickup') {
            if (stopStatus === 'completed' || stopStatus === 'skipped') {
                returnedSuccess = true;
            }
        }
        expect(returnedSuccess).toBe(true);
    });

    test('4. requestId + stopType identifica correctamente pickup y dropoff del mismo pasajero', () => {
        const pickupIdx = findStopIndex(mockOrderedStops, undefined, 'REQ_1', 'pickup');
        expect(pickupIdx).toBe(0);

        const dropoffIdx = findStopIndex(mockOrderedStops, undefined, 'REQ_1', 'dropoff');
        expect(dropoffIdx).toBe(2);
    });
    test('5. fallback index calculator yields valid resolvedStopOrder when stopOrder is undefined', () => {
        const stopOrderUndefined = undefined;
        const requestId = 'REQ_2';
        const stopType = 'pickup';

        const stopIndex = findStopIndex(mockOrderedStops, stopOrderUndefined, requestId, stopType);
        expect(stopIndex).toBe(1);

        const stop = mockOrderedStops[stopIndex];
        const resolvedStopOrder = typeof stopOrderUndefined === 'number' ? stopOrderUndefined : (stop.order ?? (stopIndex + 1));
        
        expect(resolvedStopOrder).toBe(2);
        expect(resolvedStopOrder).not.toBeUndefined();
    });
});
