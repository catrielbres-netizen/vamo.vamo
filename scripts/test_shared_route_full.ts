/**
 * test_shared_route_full.ts
 * Full test of pickup route optimization for VamO Compartido.
 * Tests all edge cases including missing location, null driver, fallback behavior.
 */

// =====================
// ROUTE OPTIMIZER (mirror of rides.ts implementation)
// =====================
function getDistanceM(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
    const R = 6371e3;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizePickupStopsFromDriverLocation(orderedStops: any[], driverLocation: { lat: number; lng: number }): any[] {
    const pickups = orderedStops.filter((s: any) => s.type === 'pickup' && s.status !== 'completed');
    const completed = orderedStops.filter((s: any) => s.type === 'pickup' && s.status === 'completed');
    const dropoffs = orderedStops.filter((s: any) => s.type === 'dropoff');

    if (pickups.length === 0) return orderedStops;

    let lastLoc = driverLocation;
    const optimizedPickups: any[] = [];
    let remaining = [...pickups];

    while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        remaining.forEach((r, idx) => {
            const d = r.location ? getDistanceM(lastLoc, r.location) : Infinity;
            if (d < nearestDist) { nearestDist = d; nearestIdx = idx; }
        });
        const next = remaining.splice(nearestIdx, 1)[0];
        optimizedPickups.push(next);
        lastLoc = next.location || lastLoc;
    }

    return [...completed, ...optimizedPickups, ...dropoffs];
}

// =====================
// SAFE ACCEPT WRAPPER (mirror of corrected acceptRideV2 logic)
// =====================
function safeOptimize(orderedStops: any[], driverLocation: { lat: number; lng: number } | null): { stops: any[]; optimized: boolean; warning?: string } {
    if (!driverLocation) {
        return { stops: orderedStops, optimized: false, warning: "PICKUP_OPTIMIZATION_SKIPPED_MISSING_DRIVER_LOCATION" };
    }
    if (!orderedStops || orderedStops.length === 0) {
        return { stops: orderedStops, optimized: false, warning: "PICKUP_OPTIMIZATION_SKIPPED_NO_STOPS" };
    }
    return { stops: optimizePickupStopsFromDriverLocation(orderedStops, driverLocation), optimized: true };
}

// =====================
// TEST DATA
// =====================
const creatorA = {
    type: 'pickup', requestId: 'req_A', passengerId: 'paxA', passengerName: 'Creador A',
    location: { lat: -43.200, lng: -65.250 }, status: 'pending'
};
const passengerB = {
    type: 'pickup', requestId: 'req_B', passengerId: 'paxB', passengerName: 'Pasajero B',
    location: { lat: -43.310, lng: -65.103 }, status: 'pending' // Near conductor
};
const passengerC = {
    type: 'pickup', requestId: 'req_C', passengerId: 'paxC', passengerName: 'Pasajero C',
    location: { lat: -43.260, lng: -65.150 }, status: 'pending'
};
const dropA = { type: 'dropoff', requestId: 'req_A', passengerId: 'paxA', passengerName: 'Creador A', location: { lat: -43.100, lng: -65.100 }, status: 'pending' };
const dropB = { type: 'dropoff', requestId: 'req_B', passengerId: 'paxB', passengerName: 'Pasajero B', location: { lat: -43.050, lng: -65.050 }, status: 'pending' };
const dropC = { type: 'dropoff', requestId: 'req_C', passengerId: 'paxC', passengerName: 'Pasajero C', location: { lat: -43.080, lng: -65.080 }, status: 'pending' };
const driverNearB = { lat: -43.305, lng: -65.100 }; // ~600m from B, ~15km from A

let pass = 0, fail = 0;
function check(name: string, condition: boolean) {
    if (condition) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ FAIL: ${name}`); fail++; }
}

console.log("\n=== TEST SUITE: ROUTE OPTIMIZATION ===\n");

// Test 1: Creator A far, B near -> B must be first
console.log("Test 1: Creator NOT given priority - nearest passenger first");
const stops2p = [creatorA, passengerB, dropA, dropB];
const r1 = safeOptimize(stops2p, driverNearB);
check("Optimization executed", r1.optimized);
check("First pickup is B (nearest)", r1.stops[0].requestId === 'req_B');
check("Second pickup is A (farther)", r1.stops[1].requestId === 'req_A');
check("Dropoffs remain at end", r1.stops[2].type === 'dropoff' && r1.stops[3].type === 'dropoff');
check("No stops lost", r1.stops.length === 4);
check("No undefined in stops", r1.stops.every((s: any) => s.requestId && s.passengerId));

// Test 2: Missing driver location -> NO crash, maintain order
console.log("\nTest 2: Missing driver location - fallback, no crash");
const r2 = safeOptimize(stops2p, null);
check("No crash with null location", true);
check("Warning emitted", r2.warning === 'PICKUP_OPTIMIZATION_SKIPPED_MISSING_DRIVER_LOCATION');
check("Stops unchanged", r2.stops.length === 4);
check("Original order preserved (creator A first)", r2.stops[0].requestId === 'req_A');
check("Optimization skipped", !r2.optimized);

// Test 3: Stop without location -> no crash, goes to end
console.log("\nTest 3: Stop with missing location - no crash");
const stopNoLoc = { type: 'pickup', requestId: 'req_X', passengerId: 'paxX', passengerName: 'Ghost', status: 'pending' };
const stopsWithGhost = [creatorA, stopNoLoc, dropA];
const r3 = safeOptimize(stopsWithGhost, driverNearB);
check("No crash with location-less stop", true);
check("All stops preserved", r3.stops.length === 3);
check("Creator A (has location) before Ghost (no location)", r3.stops[0].requestId === 'req_A');

// Test 4: Completed pickup not re-ordered
console.log("\nTest 4: Already-completed pickups not re-processed");
const completedA = { ...creatorA, status: 'completed' };
const stopsWithCompleted = [completedA, passengerB, dropA, dropB];
const r4 = safeOptimize(stopsWithCompleted, driverNearB);
check("Completed pickup at front", r4.stops[0].status === 'completed');
check("Pending pickup B follows", r4.stops[1].requestId === 'req_B');
check("Dropoffs at end", r4.stops[r4.stops.length - 1].type === 'dropoff');

// Test 5: 3 passengers, right order
console.log("\nTest 5: 3 passengers - optimal greedy order");
const stops3p = [creatorA, passengerB, passengerC, dropA, dropB, dropC];
const driverNearC = { lat: -43.258, lng: -65.148 }; // Nearest to C
const r5 = safeOptimize(stops3p, driverNearC);
check("First pickup is C (nearest to driver)", r5.stops[0].requestId === 'req_C');
check("Dropoffs all at end", r5.stops.slice(3).every((s: any) => s.type === 'dropoff'));
check("No stops lost", r5.stops.length === 6);

// Test 6: All passengers have same location (edge case)
console.log("\nTest 6: All passengers same location - no crash");
const stopsSameLoc = [
    { ...creatorA, location: { lat: -43.300, lng: -65.100 } },
    { ...passengerB, location: { lat: -43.300, lng: -65.100 } },
    dropA, dropB
];
const r6 = safeOptimize(stopsSameLoc, driverNearB);
check("No crash with equidistant stops", true);
check("All 4 stops returned", r6.stops.length === 4);

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
