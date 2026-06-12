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

// Emula la función optimizeSharedRouteWithDriver
function optimizeSharedRouteWithDriver(
    driverLocation: { lat: number; lng: number },
    requests: any[]
): any[] {
    if (requests.length === 0) return [];
    
    const driverPlace = { address: 'Driver', lat: driverLocation.lat, lng: driverLocation.lng };
    
    // 1. First Pickup
    let closestPickupIndex = 0;
    let minDistance = Infinity;
    
    requests.forEach((req, idx) => {
        const d = getDistanceM(driverPlace, req.origin);
        if (d < minDistance) {
            minDistance = d;
            closestPickupIndex = idx;
        }
    });

    const firstRequest = requests[closestPickupIndex];
    const otherRequests = requests.filter((_, idx) => idx !== closestPickupIndex);

    const orderedStops: any[] = [];
    
    // First Pickup
    orderedStops.push({ type: 'pickup', requestId: firstRequest.id, location: firstRequest.origin, passengerId: firstRequest.passengerId, passengerName: firstRequest.passengerName });
    
    // Remaining Pickups
    let lastLocation = firstRequest.origin;
    const remainingPickups = [...otherRequests];
    while (remainingPickups.length > 0) {
        let nextIdx = 0;
        let nextDist = Infinity;
        remainingPickups.forEach((r, idx) => {
            const d = getDistanceM(lastLocation, r.origin);
            if (d < nextDist) {
                nextDist = d;
                nextIdx = idx;
            }
        });
        const next = remainingPickups.splice(nextIdx, 1)[0];
        orderedStops.push({ type: 'pickup', requestId: next.id, location: next.origin, passengerId: next.passengerId, passengerName: next.passengerName });
        lastLocation = next.origin;
    }

    // Dropoffs
    const remainingDropoffs = [...requests];
    // Optimize dropoffs based on last pickup location
    while (remainingDropoffs.length > 0) {
        let nextIdx = 0;
        let nextDist = Infinity;
        remainingDropoffs.forEach((r, idx) => {
            const d = getDistanceM(lastLocation, r.destination);
            if (d < nextDist) {
                nextDist = d;
                nextIdx = idx;
            }
        });
        const next = remainingDropoffs.splice(nextIdx, 1)[0];
        orderedStops.push({ type: 'dropoff', requestId: next.id, location: next.destination, passengerId: next.passengerId, passengerName: next.passengerName });
        lastLocation = next.destination;
    }

    return orderedStops;
}

async function runTest() {
    console.log("--- TEST DE OPTIMIZACIÓN DE RUTAS SHARED ---");
    
    const driverLocation = { lat: -43.250, lng: -65.300 }; // Punto D
    
    // A: Lejos (Creador)
    const reqA = {
        id: "req_A",
        passengerId: "paxA",
        passengerName: "Creador A",
        origin: { lat: -43.200, lng: -65.250, address: "Origen A (Lejos)" },
        destination: { lat: -43.150, lng: -65.200, address: "Destino A" }
    };

    // B: Cerca
    const reqB = {
        id: "req_B",
        passengerId: "paxB",
        passengerName: "Pasajero B",
        origin: { lat: -43.245, lng: -65.295, address: "Origen B (Cerca)" },
        destination: { lat: -43.100, lng: -65.100, address: "Destino B" }
    };

    // C: Intermedio
    const reqC = {
        id: "req_C",
        passengerId: "paxC",
        passengerName: "Pasajero C",
        origin: { lat: -43.220, lng: -65.280, address: "Origen C (Intermedio)" },
        destination: { lat: -43.120, lng: -65.150, address: "Destino C" }
    };

    const requests = [reqA, reqB, reqC];
    
    console.log(`\nDriver está en: ${driverLocation.lat}, ${driverLocation.lng}`);
    requests.forEach(r => {
        const d = getDistanceM(driverLocation, r.origin);
        console.log(`- ${r.passengerName}: dist = ${Math.round(d)}m`);
    });

    console.log("\nEjecutando optimizeSharedRouteWithDriver...");
    const optimized = optimizeSharedRouteWithDriver(driverLocation, requests);

    console.log("\nResultado final (Stops):");
    optimized.forEach((s, i) => {
        console.log(`${i+1}. [${s.type}] ${s.passengerName} - ${s.location.address}`);
    });

    const isFirstB = optimized[0].requestId === "req_B";
    const isNoLoss = optimized.length === 6 && optimized.every(s => s.requestId && s.passengerId);

    if (isFirstB && isNoLoss) {
        console.log("\n✅ TEST PASS");
    } else {
        console.log("\n❌ TEST FAIL");
    }
}

runTest().catch(console.error);
