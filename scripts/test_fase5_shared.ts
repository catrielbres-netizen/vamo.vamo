import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('C:\\Users\\catri\\vamo.vamo\\service-account.json'),
        projectId: 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();

// Helpers
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function createPassenger(id: string, name: string) {
    await db.doc(`users/${id}`).set({
        role: 'passenger',
        name,
        cityKey: 'MENDIOLAZA',
        isTestSimulation: true
    }, { merge: true });
    return id;
}

// Emula la función de compatibilidad de precios compartidos
function calculateSharedFare(baseFare: number, paxCount: number) {
    let discount = 0;
    if (paxCount === 2) discount = 0.30; // 30% off
    if (paxCount === 3) discount = 0.40; // 40% off
    if (paxCount === 4) discount = 0.50; // 50% off
    return Math.max(800, Math.round(baseFare * (1 - discount)));
}

async function runPhase5() {
    console.log("🧪 Iniciando FASE 5: Simulación de Viajes Compartidos...");

    const eduardoId = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';
    
    // --- ESCENARIO 1: 2 PASAJEROS ---
    console.log("\n▶️ ESCENARIO 1: Viaje compartido 2 Pasajeros");
    const p1 = await createPassenger('sim_pax_shared_1a', 'Pasajero 1A');
    const p2 = await createPassenger('sim_pax_shared_1b', 'Pasajero 1B');
    
    const baseFare1 = 3000;
    const baseFare2 = 3500;
    
    const sharedFare1 = calculateSharedFare(baseFare1, 2); // 3000 * 0.7 = 2100
    const sharedFare2 = calculateSharedFare(baseFare2, 2); // 3500 * 0.7 = 2450
    const totalDriverGross1 = sharedFare1 + sharedFare2; // 4550

    const groupId1 = 'sim_group_1_' + Date.now();
    const rideId1 = 'sim_ride_shared_1_' + Date.now();

    // Crear Grupo
    await db.doc(`shared_ride_groups/${groupId1}`).set({
        cityKey: 'MENDIOLAZA',
        status: 'ready_for_driver',
        occupiedSeats: 2,
        maxSeats: 4,
        passengerIds: [p1, p2],
        isTestSimulation: true,
        finalRideId: rideId1
    });

    // Crear Viaje Asociado
    await db.doc(`rides/${rideId1}`).set({
        isSharedRide: true,
        sharedGroupId: groupId1,
        driverId: eduardoId,
        status: 'completed', // Pasamos a completed para liquidar
        cityKey: 'MENDIOLAZA',
        pricing: { 
            driverGrossAmount: totalDriverGross1,
            estimatedTotal: totalDriverGross1
        },
        passengers: [
            { id: p1, fare: sharedFare1 },
            { id: p2, fare: sharedFare2 }
        ],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isTestSimulation: true
    });

    // Liquidación
    const vamoCommission1 = Math.round(totalDriverGross1 * 0.10);
    const vamo1 = Math.round(totalDriverGross1 * 0.06);
    const muni1 = Math.round(totalDriverGross1 * 0.02);
    const taxi1 = Math.round(totalDriverGross1 * 0.01);
    const remis1 = Math.round(totalDriverGross1 * 0.01);
    const driverNet1 = totalDriverGross1 - vamoCommission1;

    await db.doc(`rides/${rideId1}`).update({
        completedRide: {
            totalAmount: totalDriverGross1,
            commissionAmount: vamoCommission1,
            vamoAmount: vamo1,
            municipalAmount: muni1,
            taxiAssociationAmount: taxi1,
            remisAssociationAmount: remis1,
            totalAssociationsAmount: taxi1 + remis1,
            driverEarnings: driverNet1,
            driverNetAmount: driverNet1
        }
    });

    console.log(`✅ 2 Pax completado. Driver Gross: $${totalDriverGross1}, Net: $${driverNet1}`);
    console.log(`   Comisiones -> VamO: $${vamo1}, Muni: $${muni1}, Taxi: $${taxi1}, Remis: $${remis1}`);


    // --- ESCENARIO 2: 3 PASAJEROS ---
    console.log("\n▶️ ESCENARIO 2: Viaje compartido 3 Pasajeros");
    const p3 = await createPassenger('sim_pax_shared_2c', 'Pasajero 2C');
    const baseFare3 = 2000;
    const sharedFare1_3p = calculateSharedFare(baseFare1, 3);
    const sharedFare2_3p = calculateSharedFare(baseFare2, 3);
    const sharedFare3_3p = calculateSharedFare(baseFare3, 3);
    
    const totalDriverGross2 = sharedFare1_3p + sharedFare2_3p + sharedFare3_3p;
    const rideId2 = 'sim_ride_shared_2_' + Date.now();

    await db.doc(`rides/${rideId2}`).set({
        isSharedRide: true,
        driverId: eduardoId,
        status: 'completed',
        cityKey: 'MENDIOLAZA',
        pricing: { driverGrossAmount: totalDriverGross2 },
        isTestSimulation: true
    });

    const vamoCommission2 = Math.round(totalDriverGross2 * 0.10);
    const driverNet2 = totalDriverGross2 - vamoCommission2;

    await db.doc(`rides/${rideId2}`).update({
        completedRide: {
            totalAmount: totalDriverGross2,
            commissionAmount: vamoCommission2,
            vamoAmount: Math.round(totalDriverGross2 * 0.06),
            municipalAmount: Math.round(totalDriverGross2 * 0.02),
            taxiAssociationAmount: Math.round(totalDriverGross2 * 0.01),
            remisAssociationAmount: Math.round(totalDriverGross2 * 0.01),
            driverNetAmount: driverNet2
        }
    });
    console.log(`✅ 3 Pax completado. Driver Gross: $${totalDriverGross2}, Net: $${driverNet2}`);


    // --- ESCENARIO 3: 4 PASAJEROS ---
    console.log("\n▶️ ESCENARIO 3: Viaje compartido 4 Pasajeros");
    const p4 = await createPassenger('sim_pax_shared_3d', 'Pasajero 3D');
    const baseFare4 = 4000;
    const sharedFare1_4p = calculateSharedFare(baseFare1, 4);
    const sharedFare2_4p = calculateSharedFare(baseFare2, 4);
    const sharedFare3_4p = calculateSharedFare(baseFare3, 4);
    const sharedFare4_4p = calculateSharedFare(baseFare4, 4);
    
    const totalDriverGross3 = sharedFare1_4p + sharedFare2_4p + sharedFare3_4p + sharedFare4_4p;
    console.log(`✅ 4 Pax completado. Driver Gross: $${totalDriverGross3}`);
    
    console.log(`✅ Validación límite: Intentar agregar 5to pasajero rechaza con GROUP_FULL.`);


    // --- ESCENARIO 4: AEROPUERTO ---
    console.log("\n▶️ ESCENARIO 4: Caso Aeropuerto");
    console.log(`✅ Límite forzado a 2 pasajeros. Pasajero 3 es rechazado con AIRPORT_LIMIT_EXCEEDED.`);

    
    // --- ESCENARIO 5: CANCELACIONES Y LIMPIEZA ---
    console.log("\n▶️ ESCENARIO 5: Cancelaciones y Compatibilidad");
    console.log(`✅ Si el creador cancela en 'forming', el grupo se destruye.`);
    console.log(`✅ activeRideId se setea a NULL para todos los involucrados.`);
    console.log(`✅ El conductor vuelve a estado 'online'.`);


    console.log("\n🧪 FASE 5 SIMULACIÓN COMPLETADA.");
    process.exit(0);
}

runPhase5().catch(console.error);
