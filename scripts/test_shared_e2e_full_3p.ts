/**
 * test_shared_e2e_full_3p.ts
 * Full E2E simulation for VamO Compartido with 3 passengers.
 */

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
    if (cond) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ FAIL: ${name}`); fail++; }
}

type StopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';
interface Stop { type: 'pickup' | 'dropoff'; requestId: string; passengerId: string; status: StopStatus; }

interface State {
    group: { status: string; driverId?: string };
    masterRide: { status: string; driverId?: string; orderedStops: Stop[]; };
    requests: { [id: string]: { status: string; passengerId: string } };
    passengers: { [id: string]: { active: boolean } };
    driver: { active: boolean; driverStatus: string };
    childRides: string[];
}

function buildInitialState(): State {
    return {
        group: { status: 'forming' },
        masterRide: {
            status: 'searching',
            orderedStops: [
                { type: 'pickup', requestId: 'req_A', passengerId: 'paxA', status: 'pending' },
                { type: 'pickup', requestId: 'req_B', passengerId: 'paxB', status: 'pending' },
                { type: 'pickup', requestId: 'req_C', passengerId: 'paxC', status: 'pending' },
                { type: 'dropoff', requestId: 'req_A', passengerId: 'paxA', status: 'pending' },
                { type: 'dropoff', requestId: 'req_B', passengerId: 'paxB', status: 'pending' },
                { type: 'dropoff', requestId: 'req_C', passengerId: 'paxC', status: 'pending' },
            ]
        },
        requests: {
            req_A: { status: 'grouped', passengerId: 'paxA' },
            req_B: { status: 'grouped', passengerId: 'paxB' },
            req_C: { status: 'grouped', passengerId: 'paxC' },
        },
        passengers: { paxA: { active: false }, paxB: { active: false }, paxC: { active: false } },
        driver: { active: false, driverStatus: 'online' },
        childRides: []
    };
}

function acceptRide(s: State): State {
    s.masterRide.status = 'driver_assigned';
    s.masterRide.driverId = 'driver_eduardo';
    s.group.status = 'driver_assigned';
    s.group.driverId = 'driver_eduardo';
    s.driver.active = true;
    s.driver.driverStatus = 'in_ride';
    Object.values(s.requests).forEach(r => { r.status = 'driver_assigned'; });
    Object.values(s.passengers).forEach(p => { p.active = true; });
    return s;
}

function pickupPassenger(s: State, requestId: string): State {
    const stop = s.masterRide.orderedStops.find(st => st.type === 'pickup' && st.requestId === requestId);
    if (stop) stop.status = 'completed';
    s.requests[requestId].status = 'picked_up';
    const allPickedUp = s.masterRide.orderedStops.filter(st => st.type === 'pickup').every(st => st.status === 'completed');
    if (allPickedUp) s.masterRide.status = 'in_progress';
    return s;
}

function dropoffPassenger(s: State, requestId: string): State {
    const stop = s.masterRide.orderedStops.find(st => st.type === 'dropoff' && st.requestId === requestId);
    if (stop) stop.status = 'completed';
    s.requests[requestId].status = 'dropped_off';
    s.childRides.push(`child_${requestId}`);
    const passId = s.requests[requestId].passengerId;
    s.passengers[passId].active = false;
    return s;
}

function closeGroup(s: State): State {
    const allDone = s.masterRide.orderedStops.filter(st => st.type === 'dropoff').every(st => st.status === 'completed');
    if (allDone) {
        s.masterRide.status = 'completed';
        s.group.status = 'completed';
        s.driver.active = false;
        s.driver.driverStatus = 'online';
    }
    return s;
}

console.log("\n=== E2E SIMULATION: 3 PASSENGERS ===\n");

let s = buildInitialState();

console.log("Phase 1: Group forming");
check("3 pickups", s.masterRide.orderedStops.filter(st => st.type === 'pickup').length === 3);
check("3 dropoffs", s.masterRide.orderedStops.filter(st => st.type === 'dropoff').length === 3);

console.log("\nPhase 2: Accept");
s = acceptRide(s);
check("driver_assigned", s.masterRide.status === 'driver_assigned');
check("All 3 requests driver_assigned", Object.values(s.requests).every(r => r.status === 'driver_assigned'));
check("All 3 passengers active", Object.values(s.passengers).every(p => p.active));

console.log("\nPhase 3: Pickup B first (nearest)");
s = pickupPassenger(s, 'req_B');
check("B picked up", s.requests.req_B.status === 'picked_up');
check("Still driver_assigned (A and C not yet picked)", s.masterRide.status === 'driver_assigned');

console.log("\nPhase 4: Pickup C");
s = pickupPassenger(s, 'req_C');
check("C picked up", s.requests.req_C.status === 'picked_up');
check("Still driver_assigned (A not yet)", s.masterRide.status === 'driver_assigned');

console.log("\nPhase 5: Pickup A (last)");
s = pickupPassenger(s, 'req_A');
check("A picked up", s.requests.req_A.status === 'picked_up');
check("All picked -> in_progress", s.masterRide.status === 'in_progress');

console.log("\nPhase 6: Dropoff B (intermediate)");
s = dropoffPassenger(s, 'req_B');
check("B dropped_off", s.requests.req_B.status === 'dropped_off');
check("Child ride B created", s.childRides.includes('child_req_B'));
check("PaxB inactive", !s.passengers.paxB.active);
check("PaxA still active", s.passengers.paxA.active);
check("PaxC still active", s.passengers.paxC.active);
check("Master still in_progress", s.masterRide.status === 'in_progress');
check("Group still driver_assigned", s.group.status === 'driver_assigned');

console.log("\nPhase 7: Dropoff C (intermediate)");
s = dropoffPassenger(s, 'req_C');
check("C dropped_off", s.requests.req_C.status === 'dropped_off');
check("Child ride C created", s.childRides.includes('child_req_C'));
check("PaxC inactive", !s.passengers.paxC.active);
check("PaxA still active", s.passengers.paxA.active);

console.log("\nPhase 8: Dropoff A (final)");
s = dropoffPassenger(s, 'req_A');
check("A dropped_off", s.requests.req_A.status === 'dropped_off');
check("Child ride A created", s.childRides.includes('child_req_A'));

console.log("\nPhase 9: Close group");
s = closeGroup(s);
check("Master = completed", s.masterRide.status === 'completed');
check("Group = completed", s.group.status === 'completed');
check("Driver freed", !s.driver.active);
check("Driver online", s.driver.driverStatus === 'online');
check("3 child rides created (1 per passenger)", s.childRides.length === 3);
check("All 3 passengers inactive", Object.values(s.passengers).every(p => !p.active));
check("All 6 stops completed", s.masterRide.orderedStops.every(st => st.status === 'completed'));
check("No duplicate child rides", new Set(s.childRides).size === s.childRides.length);

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
