
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

async function simulateNormalizationV2() {
    console.log("🧪 --- SIMULACIÓN: NORMALIZACIÓN Y MAPEADO REGIONAL ---");

    const passengerA_Id = "sim_reg_A_" + Date.now();
    const passengerB_Id = "sim_reg_B_" + Date.now();

    // Rawson Center -> Playa Unión
    const originA = { lat: -43.3001, lng: -65.1001, address: "Rawson Center" };
    const destA = { lat: -43.3300, lng: -65.0300, address: "Playa Unión Coast" };

    console.log("1. Creando solicitud Pasajero A con cityKey 'rawson'...");
    const reqA_Id = "req_reg_A_" + Date.now();
    await db.collection('shared_ride_requests').doc(reqA_Id).set({
        id: reqA_Id,
        passengerId: passengerA_Id,
        passengerName: "Passenger A (rawson)",
        cityKey: "rawson",
        origin: originA,
        destination: destA,
        status: 'proposed',
        individualFareReference: 2500,
        paymentMethod: 'cash',
        sharedRideNoticeAccepted: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("   Esperando 3 segundos para que el trigger normalice y cree grupo...");
    await new Promise(r => setTimeout(r, 4000));

    const reqASnap = await db.collection('shared_ride_requests').doc(reqA_Id).get();
    const groupId = reqASnap.data()?.groupId;
    if (!groupId) {
        console.error("❌ Error: Pasajero A no tiene groupId.");
        return;
    }

    console.log("2. Creando solicitud Pasajero B con cityKey 'PLAYA_UNION' (Debe mapear a 'rawson')...");
    const reqB_Id = "req_reg_B_" + Date.now();
    await db.collection('shared_ride_requests').doc(reqB_Id).set({
        id: reqB_Id,
        passengerId: passengerB_Id,
        passengerName: "Passenger B (PLAYA_UNION)",
        cityKey: "PLAYA_UNION", 
        origin: originA, 
        destination: destA,
        status: 'proposed',
        individualFareReference: 2500,
        paymentMethod: 'cash',
        sharedRideNoticeAccepted: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("   Esperando 6 segundos para matching...");
    await new Promise(r => setTimeout(r, 6000));

    const reqBSnap = await db.collection('shared_ride_requests').doc(reqB_Id).get();
    const groupBSnap = await db.collection('shared_ride_groups').doc(groupId).get();

    const dataB = reqBSnap.data();
    const dataGroup = groupBSnap.data();

    console.log("\n--- RESULTADOS ---");
    console.log(`Solicitud A cityKey Actualizada: ${reqASnap.data()?.cityKey}`);
    console.log(`Solicitud B cityKey Actualizada: ${dataB?.cityKey}`);
    console.log(`Solicitud B GroupId: ${dataB?.groupId}`);
    console.log(`Matching Exitoso: ${dataB?.groupId === groupId}`);
    console.log(`Grupo OccupiedSeats: ${dataGroup?.occupiedSeats}/4`);

    if (dataB?.groupId === groupId && dataGroup?.occupiedSeats === 2 && dataB?.cityKey === 'rawson') {
        console.log("\n🏆 ÉXITO TOTAL: Mapeo regional y matching unificados.");
    } else {
        console.log("\n❌ FALLO: Revisa los logs de las funciones.");
    }
}

simulateNormalizationV2().catch(console.error);
