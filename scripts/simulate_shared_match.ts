
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert('./service-account.json'),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6697160840-7c67f',
    });
}

const db = admin.firestore();

async function simulateCaseA() {
    console.log("🧪 --- SIMULACIÓN CASO A: 2 PASAJEROS COMPATIBLES ---");

    const passengerA_Id = "sim_pax_A_" + Date.now();
    const passengerB_Id = "sim_pax_B_" + Date.now();

    // Rawson Center -> Playa Unión
    const originA = { lat: -43.3001, lng: -65.1001, address: "Rawson Center" };
    const destA = { lat: -43.3300, lng: -65.0300, address: "Playa Unión Coast" };

    // Muy cerca de A -> Muy cerca de destino A
    const originB = { lat: -43.3005, lng: -65.1005, address: "Rawson Nearby" };
    const destB = { lat: -43.3310, lng: -65.0310, address: "Playa Unión Nearby" };

    console.log("1. Creando solicitud Pasajero A...");
    const reqA_Id = "req_A_" + Date.now();
    await db.collection('shared_ride_requests').doc(reqA_Id).set({
        id: reqA_Id,
        passengerId: passengerA_Id,
        passengerName: "Passenger A (Sim)",
        cityKey: "rawson",
        origin: originA,
        destination: destA,
        status: 'proposed', // status inicial que espera el backend
        individualFareReference: 2500,
        paymentMethod: 'cash',
        sharedRideNoticeAccepted: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("   Esperando 3 segundos para que el trigger cree el grupo...");
    await new Promise(r => setTimeout(r, 3000));

    // Verificar si se creó el grupo
    const reqASnap = await db.collection('shared_ride_requests').doc(reqA_Id).get();
    const groupId = reqASnap.data()?.groupId;
    if (!groupId) {
        console.error("❌ Error: No se asignó un groupId al Pasajero A. ¿El trigger falló?");
        return;
    }
    console.log(`✅ Pasajero A asignado al grupo: ${groupId}`);

    console.log("2. Creando solicitud Pasajero B (Compatible)...");
    const reqB_Id = "req_B_" + Date.now();
    await db.collection('shared_ride_requests').doc(reqB_Id).set({
        id: reqB_Id,
        passengerId: passengerB_Id,
        passengerName: "Passenger B (Sim)",
        cityKey: "rawson",
        origin: originB,
        destination: destB,
        status: 'proposed',
        individualFareReference: 2400,
        paymentMethod: 'cash',
        sharedRideNoticeAccepted: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("   Esperando 5 segundos para que el trigger realice el matching...");
    await new Promise(r => setTimeout(r, 5000));

    // RESULTADOS FINALES
    const reqBSnap = await db.collection('shared_ride_requests').doc(reqB_Id).get();
    const groupBSnap = await db.collection('shared_ride_groups').doc(groupId).get();

    const dataB = reqBSnap.data();
    const dataGroup = groupBSnap.data();

    console.log("\n--- RESULTADOS ---");
    console.log(`Solicitud B GroupId: ${dataB?.groupId}`);
    console.log(`Grupo Status: ${dataGroup?.status}`);
    console.log(`Grupo PassengerIds: ${JSON.stringify(dataGroup?.passengerIds)}`);
    console.log(`Grupo OccupiedSeats: ${dataGroup?.occupiedSeats}/4`);

    if (dataB?.groupId === groupId && dataGroup?.occupiedSeats === 2) {
        console.log("\n🏆 MATCH EXITOSO: El trigger consolidó el grupo correctamente.");
    } else {
        console.log("\n❌ FALLO DE MATCH: Los pasajeros no terminaron en el mismo grupo.");
        if (dataB?.groupId !== groupId) {
            console.log(`B creó su propio grupo: ${dataB?.groupId}`);
        }
    }
}

simulateCaseA().catch(console.error);
