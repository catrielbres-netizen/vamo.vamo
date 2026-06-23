/**
 * test_shared_e2e_full_2p.ts
 * Full E2E simulation for VamO Compartido with 2 passengers.
 * All tests are OFFLINE (no Firestore connection needed).
 * Simulates the entire lifecycle from group creation to driver release.
 */

// =====================
// STATE MACHINE SIMULATOR
// =====================
type RideStatus = 'searching' | 'driver_assigned' | 'in_progress' | 'completed' | 'cancelled';
type GroupStatus = 'forming' | 'pending' | 'ready_for_driver_dispatch' | 'driver_assigned' | 'in_progress' | 'completed' | 'cancelled';
type RequestStatus = 'pending_group' | 'grouped' | 'driver_assigned' | 'waiting_pickup' | 'picked_up' | 'dropped_off' | 'completed' | 'cancelled';
type StopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

interface Stop {
    type: 'pickup' | 'dropoff';
    requestId: string;
    passengerId: string;
    passengerName: string;
    location: { lat: number; lng: number; address: string };
    status: StopStatus;
}

interface SimState {
    group: { id: string; status: GroupStatus; driverId?: string; masterRideId: string };
    masterRide: { id: string; status: RideStatus; driverId?: string; orderedStops: Stop[]; sharedPassengers: any[] };
    requests: { [id: string]: { id: string; status: RequestStatus; passengerId: string } };
    passengers: { [id: string]: { activeRideId?: string; activeSharedRideId?: string } };
    driver: { activeRideId?: string; driverStatus: string };
    childRides: { [id: string]: { status: string; passengerId: string; masterRideId: string } };
    events: string[];
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
    if (cond) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ FAIL: ${name}`); fail++; }
}

// =====================
// INITIAL STATE
// =====================
function createInitialState(): SimState {
    return {
        group: { id: 'group1', status: 'forming', masterRideId: 'shared_ride1' },
        masterRide: {
            id: 'shared_ride1',
            status: 'searching',
            orderedStops: [
                { type: 'pickup', requestId: 'req_A', passengerId: 'paxA', passengerName: 'Creador A', location: { lat: -43.200, lng: -65.250, address: 'Calle A 123' }, status: 'pending' },
                { type: 'pickup', requestId: 'req_B', passengerId: 'paxB', passengerName: 'Pasajero B', location: { lat: -43.310, lng: -65.103, address: 'Calle B 456' }, status: 'pending' },
                { type: 'dropoff', requestId: 'req_A', passengerId: 'paxA', passengerName: 'Creador A', location: { lat: -43.100, lng: -65.100, address: 'Destino A' }, status: 'pending' },
                { type: 'dropoff', requestId: 'req_B', passengerId: 'paxB', passengerName: 'Pasajero B', location: { lat: -43.050, lng: -65.050, address: 'Destino B' }, status: 'pending' },
            ],
            sharedPassengers: [
                { passengerId: 'paxA', requestId: 'req_A', passengerName: 'Creador A', status: 'waiting_pickup' },
                { passengerId: 'paxB', requestId: 'req_B', passengerName: 'Pasajero B', status: 'waiting_pickup' },
            ]
        },
        requests: {
            req_A: { id: 'req_A', status: 'grouped', passengerId: 'paxA' },
            req_B: { id: 'req_B', status: 'grouped', passengerId: 'paxB' },
        },
        passengers: {
            paxA: {},
            paxB: {},
        },
        driver: { driverStatus: 'online' },
        childRides: {},
        events: [],
    };
}

// =====================
// STATE TRANSITIONS
// =====================
function acceptRide(state: SimState, driverId: string): SimState {
    state.events.push('acceptRide');
    state.masterRide.status = 'driver_assigned';
    state.masterRide.driverId = driverId;
    state.group.status = 'driver_assigned';
    state.group.driverId = driverId;
    state.driver.activeRideId = state.masterRide.id;
    state.driver.driverStatus = 'in_ride';
    for (const req of Object.values(state.requests)) {
        req.status = 'driver_assigned';
    }
    state.passengers.paxA.activeRideId = state.masterRide.id;
    state.passengers.paxA.activeSharedRideId = state.masterRide.id;
    state.passengers.paxB.activeRideId = state.masterRide.id;
    state.passengers.paxB.activeSharedRideId = state.masterRide.id;
    return state;
}

function pickupPassenger(state: SimState, requestId: string): SimState {
    state.events.push(`pickup:${requestId}`);
    const stop = state.masterRide.orderedStops.find(s => s.type === 'pickup' && s.requestId === requestId);
    if (stop) stop.status = 'completed';
    state.requests[requestId].status = 'picked_up';
    // Update sharedPassengers
    const sp = state.masterRide.sharedPassengers.find(p => p.requestId === requestId);
    if (sp) sp.status = 'picked_up';
    // Check if all picked up
    const allPickedUp = state.masterRide.orderedStops.filter(s => s.type === 'pickup').every(s => s.status === 'completed');
    if (allPickedUp) state.masterRide.status = 'in_progress';
    return state;
}

function dropoffPassenger(state: SimState, requestId: string): SimState {
    state.events.push(`dropoff:${requestId}`);
    const stop = state.masterRide.orderedStops.find(s => s.type === 'dropoff' && s.requestId === requestId);
    if (stop) stop.status = 'completed';
    state.requests[requestId].status = 'dropped_off';
    // Create child ride
    const childId = `child_${requestId}`;
    state.childRides[childId] = { status: 'completed', passengerId: state.requests[requestId].passengerId, masterRideId: state.masterRide.id };
    // Update sharedPassengers
    const sp = state.masterRide.sharedPassengers.find(p => p.requestId === requestId);
    if (sp) sp.status = 'dropped_off';
    // Clear passenger
    const passId = state.requests[requestId].passengerId;
    delete state.passengers[passId].activeRideId;
    delete state.passengers[passId].activeSharedRideId;
    return state;
}

function closeGroup(state: SimState): SimState {
    state.events.push('closeGroup');
    const allDropped = state.masterRide.orderedStops.filter(s => s.type === 'dropoff').every(s => s.status === 'completed');
    if (allDropped) {
        state.masterRide.status = 'completed';
        state.group.status = 'completed';
        delete state.driver.activeRideId;
        state.driver.driverStatus = 'online';
    }
    return state;
}

// =====================
// RUN SIMULATION
// =====================
console.log("\n=== E2E SIMULATION: 2 PASSENGERS ===\n");

let state = createInitialState();

// Phase 1: Group formed, searching
console.log("Phase 1: Group formed, searching for driver");
check("Group status = forming/searching", state.group.status === 'forming' && state.masterRide.status === 'searching');
check("2 ordered stops of type pickup", state.masterRide.orderedStops.filter(s => s.type === 'pickup').length === 2);
check("2 ordered stops of type dropoff", state.masterRide.orderedStops.filter(s => s.type === 'dropoff').length === 2);

// Phase 2: Driver accepts
console.log("\nPhase 2: Driver Eduardo accepts");
state = acceptRide(state, 'driver_eduardo');
check("Master ride = driver_assigned", state.masterRide.status === 'driver_assigned');
check("Group = driver_assigned", state.group.status === 'driver_assigned');
check("Driver has activeRideId", state.driver.activeRideId === 'shared_ride1');
check("Driver status = in_ride", state.driver.driverStatus === 'in_ride');
check("PaxA has activeRideId", state.passengers.paxA.activeRideId === 'shared_ride1');
check("PaxB has activeSharedRideId", state.passengers.paxB.activeSharedRideId === 'shared_ride1');
check("req_A = driver_assigned", state.requests.req_A.status === 'driver_assigned');
check("req_B = driver_assigned", state.requests.req_B.status === 'driver_assigned');

// Phase 3: Pickup B (nearest)
console.log("\nPhase 3: Pickup Pasajero B (nearest)");
state = pickupPassenger(state, 'req_B');
check("req_B = picked_up", state.requests.req_B.status === 'picked_up');
check("B pickup stop = completed", state.masterRide.orderedStops.find(s => s.type === 'pickup' && s.requestId === 'req_B')?.status === 'completed');
check("Master ride still driver_assigned (A not picked up yet)", state.masterRide.status === 'driver_assigned');

// Phase 4: Pickup A
console.log("\nPhase 4: Pickup Creador A");
state = pickupPassenger(state, 'req_A');
check("req_A = picked_up", state.requests.req_A.status === 'picked_up');
check("Master ride = in_progress (all picked up)", state.masterRide.status === 'in_progress');

// Phase 5: Dropoff A
console.log("\nPhase 5: Dropoff Creador A (intermediate)");
state = dropoffPassenger(state, 'req_A');
check("req_A = dropped_off", state.requests.req_A.status === 'dropped_off');
check("Child ride created for A", !!state.childRides['child_req_A']);
check("Child ride A = completed", state.childRides['child_req_A'].status === 'completed');
check("PaxA cleared from activeRideId", !state.passengers.paxA.activeRideId);
check("PaxA cleared from activeSharedRideId", !state.passengers.paxA.activeSharedRideId);
check("PaxB still active", !!state.passengers.paxB.activeSharedRideId);
check("Master ride still in_progress", state.masterRide.status === 'in_progress');
check("Group still driver_assigned (not closed)", state.group.status === 'driver_assigned');

// Phase 6: Dropoff B
console.log("\nPhase 6: Dropoff Pasajero B (final)");
state = dropoffPassenger(state, 'req_B');
check("req_B = dropped_off", state.requests.req_B.status === 'dropped_off');
check("Child ride created for B", !!state.childRides['child_req_B']);
check("PaxB cleared", !state.passengers.paxB.activeRideId);

// Phase 7: Close group
console.log("\nPhase 7: Close group");
state = closeGroup(state);
check("Master ride = completed", state.masterRide.status === 'completed');
check("Group = completed", state.group.status === 'completed');
check("Driver freed (no activeRideId)", !state.driver.activeRideId);
check("Driver status = online", state.driver.driverStatus === 'online');
check("2 child rides created", Object.keys(state.childRides).length === 2);
check("All events fired", state.events.length >= 7);

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
