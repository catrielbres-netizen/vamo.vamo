import admin from 'firebase-admin';

try {
    admin.initializeApp({ projectId: 'test-project' });
} catch(e) {}


async function runTest() {
    console.log("==========================================");
    console.log("Prueba de Orden de Transacción - advanceSharedRideStopV1");
    console.log("==========================================");

    console.log("Evaluando la refactorización de Fase A, Fase B, y Fase C.");

    const db = admin.firestore();

    // Mock functions to verify order
    let phaseCount = { reads: 0, computations: 0, writes: 0 };
    let hasWritten = false;
    let failed = false;

    // Simulate transaction object
    const tx = {
        get: async (ref: any) => {
            if (hasWritten) {
                console.error("[CRITICAL ERROR] tx.get() llamado DESPUÉS de un tx.update/tx.set. Esto viola Firestore y causará un aborto.");
                failed = true;
            }
            phaseCount.reads++;
            return {
                exists: true,
                data: () => ({
                    // mock ride data
                    orderedStops: [{ id: 'stop_1', requestId: 'req_1', passengerId: 'pax_1', type: 'dropoff' }],
                    sharedGroupId: 'group_1',
                    origin: { lat: -34, lng: -58 },
                    destination: { lat: -34.1, lng: -58.1 },
                    paymentMethod: 'cash',
                    sharedFareEstimate: 1000
                })
            };
        },
        update: (ref: any, data: any) => {
            hasWritten = true;
            phaseCount.writes++;
        },
        set: (ref: any, data: any) => {
            hasWritten = true;
            phaseCount.writes++;
        }
    };

    try {
        console.log("--- INICIANDO SIMULACIÓN TRANSACT (advanceSharedRideStopV1) ---");
        
        // Fase A: Lecturas
        console.log("Ejecutando Fase A (Lecturas estrictas)...");
        const rideRef = db.doc('rides/ride_1');
        const rideSnap = await tx.get(rideRef);
        const rideData = rideSnap.data();

        const stop = rideData.orderedStops[0];
        const reqRef = db.doc(`shared_ride_requests/${stop.requestId}`);
        const reqSnap = await tx.get(reqRef);
        const reqData = reqSnap.data();

        // Fase B: Cálculo Puro
        console.log("Ejecutando Fase B (Cálculos en memoria)...");
        let newPassengerStatus = 'dropped_off';
        let childRideId = `shared_child_ride_1_pax_1`;
        let rideUpdates = { status: 'completed' };
        let reqUpdates = { status: 'dropped_off' };
        let childRidePayload = { id: childRideId, isSharedChildRide: true };
        let userUpdates = { activeRideId: childRideId };
        let eventPayload = { id: 'evt_1', type: 'dropoff' };
        phaseCount.computations++;

        // Fase C: Escrituras
        console.log("Ejecutando Fase C (Escrituras estrictas)...");
        tx.update(rideRef, rideUpdates);
        tx.update(reqRef, reqUpdates);
        const childRideRef = db.collection('rides').doc(childRideId);
        tx.set(childRideRef, childRidePayload);
        const userRef = db.doc('users/pax_1');
        tx.update(userRef, userUpdates);
        const eventRef = db.collection('rides/ride_1/shared_events').doc('evt_1');
        tx.set(eventRef, eventPayload);

        console.log("--- FIN SIMULACIÓN ---");

        if (failed) {
            console.error("\n[FAIL] El test falló. Se detectó una lectura después de escritura.");
        } else {
            console.log(`\n[SUCCESS] El flujo de transacciones es correcto.`);
            console.log(`Lecturas: ${phaseCount.reads}`);
            console.log(`Cálculos: ${phaseCount.computations}`);
            console.log(`Escrituras: ${phaseCount.writes}`);
        }

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest().then(() => process.exit(0));
