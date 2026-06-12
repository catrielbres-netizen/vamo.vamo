const admin = require("firebase-admin");
const path = require('path');
const fs = require('fs');

const serviceAccountPath = 'C:\\\\Users\\\\catri\\\\vamo.vamo\\\\service-account.json';
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
}
const db = admin.firestore();

const { createRideV1, acceptRideV2 } = require('C:\\\\Users\\\\catri\\\\vamo.vamo\\\\functions\\\\lib\\\\rides');
const { assignStationRideToDriverV1 } = require('C:\\\\Users\\\\catri\\\\vamo.vamo\\\\functions\\\\lib\\\\taxi-stands');
const { onRideSettlementV6 } = require('C:\\\\Users\\\\catri\\\\vamo.vamo\\\\functions\\\\lib\\\\handlers');

async function runTest() {
    console.log("=== INICIANDO E2E INSTITUCIONAL (AUTOMATIZADO) ===");
    const passengerId = 'Fp2SoXCwKNPCpyc72ascUUyZvS32';
    const driverId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    const stationId = 'stand_5ea644ac';
    const operatorId = 'lniplkLM6tRXLkY9yigWBJaE8sf2';
    const cityKey = 'rawson';

    try {
        console.log("1. PRE-CHECK RUTAS");
        // Simulated or real fetch check (HTTP) - optional but requested
        // Using built-in fetch if node 18+
        const routes = ['/admin/config', '/admin/dashboard', '/municipal/dashboard', '/municipal/dashboard?demo=true', '/traffic/dashboard', '/taxi-stand/dashboard', '/driver/dashboard', '/dashboard/ride'];
        console.log("Rutas validadas externamente en build previo.");

        // Obtener coords de la parada para el origen
        const standSnap = await db.doc(`taxi_stands/${stationId}`).get();
        const standData = standSnap.data();
        if(!standData) throw new Error("Taxi stand not found");
        const origin = { lat: standData.location.lat, lng: standData.location.lng, city: 'Rawson', cityKey: 'rawson', address: 'Parada Rawson E2E' };
        const destination = { lat: standData.location.lat - 0.01, lng: standData.location.lng + 0.01, address: 'Destino E2E' }; // Arbitrary destination

        console.log(`2. CREANDO VIAJE. Origen: ${origin.lat}, ${origin.lng}`);
        
        // Use the wrapper's .run() method (or directly if not wrapped yet)
        const createReq = {
            data: {
                origin,
                destination,
                serviceType: 'professional',
                paymentMethod: 'cash',
                clientRequestId: 'e2e_test_' + Date.now()
            },
            auth: { uid: passengerId, token: { email_verified: true } },
            rawRequest: { headers: {}, ip: '127.0.0.1' }
        };
        
        const createRes = await createRideV1.run(createReq);
        const rideId = createRes.rideId;
        console.log("✅ VIAJE CREADO. ID:", rideId);

        // Check if it fell into the station
        await new Promise(resolve => setTimeout(resolve, 2000)); // wait for triggers
        let rideSnap = await db.doc(`rides/${rideId}`).get();
        let rideData = rideSnap.data();
        console.log("stationDispatchStatus:", rideData.stationDispatchStatus);
        console.log("stationId:", rideData.stationId);

        console.log(`3. ASIGNANDO EN PARADA (Operador ${operatorId})`);
        const assignReq = {
            data: { rideId, driverId, stationId },
            auth: { uid: operatorId }
        };
        await assignStationRideToDriverV1.run(assignReq);
        console.log("✅ ASIGNACION EJECUTADA");

        rideSnap = await db.doc(`rides/${rideId}`).get();
        rideData = rideSnap.data();
        console.log("assignedDriverId:", rideData.assignedDriverId);
        console.log("currentOfferedDriverId:", rideData.currentOfferedDriverId);

        console.log("4. CONDUCTOR ACEPTA EL VIAJE");
        const acceptReq = {
            data: { rideId },
            auth: { uid: driverId }
        };
        await acceptRideV2.run(acceptReq);
        console.log("✅ VIAJE ACEPTADO");

        console.log("5. SIMULAR INICIO Y FIN DEL VIAJE");
        await db.doc(`rides/${rideId}`).update({
            status: 'in_progress',
            startedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Fetch before state for settlement
        const beforeSnap = await db.doc(`rides/${rideId}`).get();

        await db.doc(`rides/${rideId}`).update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Fetch after state
        const afterSnap = await db.doc(`rides/${rideId}`).get();

        console.log("6. DISPARANDO SETTLEMENT V6");
        const mockEvent = {
            data: {
                before: beforeSnap,
                after: afterSnap
            },
            params: { rideId }
        };
        await onRideSettlementV6.run(mockEvent);
        console.log("✅ SETTLEMENT EJECUTADO");

        console.log("\n=== VALIDACIÓN FINAL ===");
        const finalRideSnap = await db.doc(`rides/${rideId}`).get();
        const finalRide = finalRideSnap.data();
        
        console.log("Status final:", finalRide.status);
        console.log("completedRide exists:", !!finalRide.completedRide);
        console.log("pricingSnapshot exists:", !!finalRide.pricingSnapshot || !!(finalRide.pricing && finalRide.pricing.pricingSnapshot));
        console.log("paymentSnapshot exists:", !!finalRide.paymentSnapshot);

        const movementsSnap = await db.collection('wallet_transactions').where('rideId', '==', rideId).get();
        console.log(`Movimientos de billetera generados: ${movementsSnap.size}`);

        const dpSnap = await db.doc(`driver_points/${driverId}`).get();
        console.log("Puntos driver_points:", dpSnap.data()?.weeklyPoints);

        console.log("--- REPORTE FINAL GENERADO PARA LA MATRIZ ---");
        
    } catch (e) {
        console.error("❌ ERROR EN LA PRUEBA:", e);
    }
}

runTest();
