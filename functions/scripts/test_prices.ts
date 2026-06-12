import { calculateSharedPricing } from '../src/lib/sharedPricing';
// Initialize Firebase Admin if not already initialized
// Removed to avoid credential errors

async function runTest() {
    console.log("=== INICIANDO PRUEBA LOCAL DE PRECIOS COMPARTIDOS ===");

    const requestA = {
        id: "reqA",
        individualFareReference: 5000,
        cityKey: "rawson"
    };

    const requestB = {
        id: "reqB",
        individualFareReference: 10000,
        cityKey: "rawson"
    };

    const newOccupiedSeats = 2; // Grupo de 2 pasajeros

    let totalSharedFare = 0;
    const allRequests = [requestA, requestB];
    
    console.log(`\nSimulando grupo de ${newOccupiedSeats} pasajeros.`);

    const updatedRequestPricings = allRequests.map(req => {
        const reqPricing = calculateSharedPricing({
            individualFareReference: req.individualFareReference,
            confirmedPassengerCount: newOccupiedSeats,
            cityKey: req.cityKey
        });
        
        console.log(`\nPasajero ${req.id}:`);
        console.log(`- individualQuotedFare: $${req.individualFareReference}`);
        console.log(`- sharedFare calculada: $${reqPricing.sharedFarePerPassenger}`);
        console.log(`- Ahorro (savingsAmount): $${reqPricing.passengerSavingAmount}`);
        
        totalSharedFare += reqPricing.sharedFarePerPassenger;
        return {
            requestId: req.id,
            pricing: reqPricing
        };
    });

    console.log(`\n=== RESULTADO DEL GRUPO ===`);
    console.log(`- groupGrossAmount (Suma Real): $${totalSharedFare}`);
    
    if (totalSharedFare === 3000 + 6000) {
        console.log("-> ✅ LA FÓRMULA ES CORRECTA. No multiplica por 2.");
    } else {
        console.log("-> ❌ HAY UN BUG EN LA FÓRMULA.");
    }
}

runTest().catch(console.error).finally(() => process.exit(0));
