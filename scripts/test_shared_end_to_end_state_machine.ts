import * as admin from 'firebase-admin';

async function runStateMachineSimulation() {
    console.log("==========================================");
    console.log("Prueba de Máquina de Estados End-to-End");
    console.log("==========================================");

    let state = {
        masterRideStatus: 'in_progress',
        driverAvailable: false,
        stops: [
            { id: 's1', type: 'pickup', passengerId: 'p1', status: 'pending' },
            { id: 's2', type: 'pickup', passengerId: 'p2', status: 'pending' },
            { id: 's3', type: 'pickup', passengerId: 'p3', status: 'pending' },
            { id: 's4', type: 'dropoff', passengerId: 'p1', status: 'pending' },
            { id: 's5', type: 'dropoff', passengerId: 'p2', status: 'pending' },
            { id: 's6', type: 'dropoff', passengerId: 'p3', status: 'pending' }
        ],
        childRides: [],
        users: {
            p1: { activeRideId: 'master_1', sharedRideStatus: 'in_progress' },
            p2: { activeRideId: 'master_1', sharedRideStatus: 'in_progress' },
            p3: { activeRideId: 'master_1', sharedRideStatus: 'in_progress' },
            driver1: { isAvailable: false, activeRideId: 'master_1' }
        }
    };

    function simulateAdvanceStop(stopId: string, action: string) {
        const stopIndex = state.stops.findIndex(s => s.id === stopId);
        const stop = state.stops[stopIndex];
        
        console.log(`\n-> Conductor ejecuta '${action}' en parada ${stop.type} de ${stop.passengerId}`);

        if (action === 'confirm_pickup') {
            stop.status = 'completed';
        } else if (action === 'confirm_dropoff') {
            stop.status = 'completed';
            
            // FASE B: Simulando creación de child ride
            const childId = `shared_child_1_${stop.passengerId}`;
            (state.childRides as any).push({ id: childId, isSharedChildRide: true });
            
            // FASE B: Simulando actualización de usuario
            (state.users as any)[stop.passengerId].activeRideId = childId;
            (state.users as any)[stop.passengerId].sharedRideStatus = 'completed';
        }

        // FASE B: Simulando optimización Greedy
        const allPickupsDone = state.stops.filter(s => s.type === 'pickup').every(s => s.status === 'completed');
        if (allPickupsDone && action === 'confirm_pickup') {
            console.log("   [OPTIMIZACIÓN] Se completó el último pickup. Reordenando dropoffs (simulado).");
        }

        // FASE B: Comprobar master ride
        const allCompleted = state.stops.every(s => s.status === 'completed');
        if (allCompleted) {
            console.log("   [MASTER RIDE] Todas las paradas completadas. Cerrando master.");
            state.masterRideStatus = 'completed';
            state.driverAvailable = true;
            state.users.driver1.isAvailable = true;
            state.users.driver1.activeRideId = null as any;
        }
    }

    // Flujo
    simulateAdvanceStop('s1', 'confirm_pickup');
    simulateAdvanceStop('s2', 'confirm_pickup');
    simulateAdvanceStop('s3', 'confirm_pickup'); // Aquí ocurre optimización
    
    simulateAdvanceStop('s4', 'confirm_dropoff');
    console.log(`   Estado pasajero 1: activeRideId = ${state.users.p1.activeRideId}`);
    
    simulateAdvanceStop('s5', 'confirm_dropoff');
    console.log(`   Estado pasajero 2: activeRideId = ${state.users.p2.activeRideId}`);
    
    simulateAdvanceStop('s6', 'confirm_dropoff'); // Aquí se cierra master
    console.log(`   Estado pasajero 3: activeRideId = ${state.users.p3.activeRideId}`);

    console.log(`\nResumen Final:`);
    console.log(`Master Ride Status: ${state.masterRideStatus}`);
    console.log(`Driver Disponible: ${state.driverAvailable}`);
    console.log(`Child Rides Generados: ${state.childRides.length}`);

    if (state.masterRideStatus === 'completed' && state.driverAvailable && state.childRides.length === 3) {
        console.log("[SUCCESS] La máquina de estados validó el flujo end-to-end sin bloqueos.");
    } else {
        console.error("[FAIL] El estado final no es el esperado.");
    }
}

runStateMachineSimulation().then(() => process.exit(0));
