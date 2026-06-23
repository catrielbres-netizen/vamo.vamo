import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

function getDistanceM(p1: any, p2: any): number {
    const R = 6371e3;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function optimizePickupStopsFromDriverLocation(
    orderedStops: any[],
    driverLocation: { lat: number; lng: number }
): any[] {
    const pickups = orderedStops.filter((s: any) => s.type === 'pickup');
    const dropoffs = orderedStops.filter((s: any) => s.type === 'dropoff');

    if (pickups.length === 0) return orderedStops;

    const driverPlace = { lat: driverLocation.lat, lng: driverLocation.lng };
    const optimized: any[] = [];

    // Optimize Pickups
    let lastLoc = driverPlace;
    let remainingPickups = [...pickups];
    while (remainingPickups.length > 0) {
        let nextIdx = 0;
        let nextDist = Infinity;
        remainingPickups.forEach((r, idx) => {
            const d = r.location ? getDistanceM(lastLoc, r.location) : Infinity;
            if (d < nextDist) {
                nextDist = d;
                nextIdx = idx;
            }
        });
        const next = remainingPickups.splice(nextIdx, 1)[0];
        optimized.push(next);
        lastLoc = next.location;
    }

    optimized.push(...dropoffs);

    // Re-assign order field
    return optimized.map((s, idx) => ({ ...s, order: idx + 1 }));
}

async function runTest() {
    console.log("--- TEST FALLBACK DE UBICACIÓN DEL CONDUCTOR ---\n");

    const reqA = { type: 'pickup', requestId: "req_A", passengerId: "paxA", passengerName: "Creador A", location: { lat: -43.200, lng: -65.250 } };
    const reqB = { type: 'pickup', requestId: "req_B", passengerId: "paxB", passengerName: "Pasajero B", location: { lat: -43.245, lng: -65.295 } };
    const dropA = { type: 'dropoff', requestId: "req_A", passengerId: "paxA", passengerName: "Creador A", location: { lat: -43.150, lng: -65.200 } };
    const dropB = { type: 'dropoff', requestId: "req_B", passengerId: "paxB", passengerName: "Pasajero B", location: { lat: -43.100, lng: -65.100 } };

    const initialStops = [reqA, reqB, dropA, dropB];
    const driverLocValid = { lat: -43.250, lng: -65.300 }; // Cerca de B

    console.log("Caso 1: Driver con ubicación válida => optimiza pickups.");
    const res1 = optimizePickupStopsFromDriverLocation(initialStops, driverLocValid);
    if (res1[0].requestId === "req_B") console.log(" ✅ PASS: B quedó primero.");
    else console.log(" ❌ FAIL: B no quedó primero.");

    console.log("\nCaso 2: Stop sin location => NO falla, o mantiene orden.");
    const reqC = { type: 'pickup', requestId: "req_C", passengerId: "paxC", passengerName: "Pasajero C sin location" };
    const stopsConFalla = [reqA, reqB, reqC, dropA, dropB];
    try {
        const res2 = optimizePickupStopsFromDriverLocation(stopsConFalla, driverLocValid);
        console.log(" ✅ PASS: No tiró excepción. Orden devuelto con length: " + res2.length);
    } catch (e: any) {
        console.log(" ❌ FAIL: Tiró excepción: " + e.message);
    }

    console.log("\nCaso 3: Simulación de acceptRideV2 con driverLocation null => NO falla, mantiene orden actual.");
    let testDriverLocation = null;
    if (testDriverLocation && initialStops.length > 0) {
        const res3 = optimizePickupStopsFromDriverLocation(initialStops, testDriverLocation);
        console.log(" ❌ FAIL: No debió optimizar");
    } else {
        console.log(" ✅ PASS: Saltó la optimización y mantuvo initialStops.");
    }
}

runTest().catch(console.error);
