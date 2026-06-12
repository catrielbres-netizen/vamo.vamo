// Scripts sin dependencias de admin

// No db needed

function haversineDistance(coords1: { lat: number, lng: number }, coords2: { lat: number, lng: number }) {
    const toRad = (value: number) => value * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLng = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function runTest() {
    console.log("==========================================");
    console.log("Prueba de Optimización Greedy de Ruta (Dropoffs)");
    console.log("==========================================");

    // Simulated stops
    const stops = [
        { type: 'pickup', requestId: 'req1', status: 'completed', location: { lat: -34.6037, lng: -58.3816 } },
        { type: 'pickup', requestId: 'req2', status: 'completed', location: { lat: -34.6050, lng: -58.3820 } },
        { type: 'pickup', requestId: 'req3', status: 'pending', location: { lat: -34.6070, lng: -58.3830 } }, // Last pickup
        { type: 'dropoff', requestId: 'req1', status: 'pending', location: { lat: -34.6200, lng: -58.4000 } }, // Farther
        { type: 'dropoff', requestId: 'req2', status: 'pending', location: { lat: -34.6100, lng: -58.3900 } }, // Closer
        { type: 'dropoff', requestId: 'req3', status: 'pending', location: { lat: -34.6150, lng: -58.3950 } }  // Medium
    ];

    console.log("Ruta Original:");
    stops.forEach((s, i) => console.log(`[${i}] ${s.type} ${s.requestId} - Status: ${s.status}`));

    // Simulate completion of req3 pickup
    const stopIndex = 2; // req3 pickup
    stops[stopIndex].status = 'completed';

    const areAllPickupsCompleted = stops.filter(s => s.type === 'pickup').every(s => s.status === 'completed' || s.status === 'skipped');
    
    console.log(`\nPickup req3 completado. areAllPickupsCompleted = ${areAllPickupsCompleted}`);

    if (areAllPickupsCompleted) {
        console.log("Optimización activada (Nearest Neighbor)...");
        const remainingDropoffs = stops.filter(s => s.type === 'dropoff' && s.status === 'pending');
        let currentLocation = stops[stopIndex].location;

        const optimizedDropoffs = [];
        
        while (remainingDropoffs.length > 0) {
            // Find nearest
            let nearestIdx = 0;
            let minDistance = Infinity;

            for (let i = 0; i < remainingDropoffs.length; i++) {
                const d = haversineDistance(currentLocation, remainingDropoffs[i].location);
                if (d < minDistance) {
                    minDistance = d;
                    nearestIdx = i;
                }
            }

            const nearest = remainingDropoffs.splice(nearestIdx, 1)[0];
            optimizedDropoffs.push(nearest);
            currentLocation = nearest.location; // Move driver here
            console.log(`-> Siguiente destino seleccionado: ${nearest.requestId} a ${minDistance.toFixed(2)} km de distancia.`);
        }

        // Replace dropoffs in the original array
        const dropoffStartIndex = stops.findIndex(s => s.type === 'dropoff');
        stops.splice(dropoffStartIndex, stops.length - dropoffStartIndex, ...optimizedDropoffs);
        
        console.log("\nNueva Hoja de Ruta Optimizada:");
        stops.forEach((s, i) => console.log(`[${i}] ${s.type} ${s.requestId} - Status: ${s.status}`));

        // Expected order: req2 (nearest to req3 pickup), req3 (next nearest), req1 (farthest)
        const expectedOrder = ['req2', 'req3', 'req1'];
        let success = true;
        for (let i = 0; i < expectedOrder.length; i++) {
            if (stops[dropoffStartIndex + i].requestId !== expectedOrder[i]) {
                success = false;
            }
        }
        
        if (success) {
            console.log("\n[SUCCESS] El algoritmo Greedy ordenó los dropoffs correctamente por proximidad.");
        } else {
            console.error("\n[ERROR] El algoritmo Greedy falló en el ordenamiento.");
        }
    }
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
