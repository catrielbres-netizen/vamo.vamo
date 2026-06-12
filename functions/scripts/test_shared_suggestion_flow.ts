import admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

const testEnv = require('firebase-functions-test')({
    projectId: "studio-6697160840-7c67f"
}, path.resolve(process.cwd(), '../service-account.json'));

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log("=== INICIANDO TEST DE SUGERENCIA Y JOIN ===");
    
    const { joinSharedRideGroupV1, listNearbySharedRideGroupsV1, requestSharedRideV1 } = require('../lib/sharedRides.js');
    
    const wrappedRequest = testEnv.wrap(requestSharedRideV1);
    const wrappedList = testEnv.wrap(listNearbySharedRideGroupsV1);
    const wrappedJoin = testEnv.wrap(joinSharedRideGroupV1);

    // Test Users
    const runId = Date.now();
    const uids = [
        `test_user_A_${runId}`,
        `test_user_B_${runId}`,
        `test_user_C_${runId}`,
        `test_user_D_${runId}`
    ];

    console.log("Creando usuarios de prueba limpios...");
    for (let i = 0; i < uids.length; i++) {
        await db.doc(`users/${uids[i]}`).set({
            name: `Test Pax ${i}`,
            role: 'passenger',
            cityKey: 'rawson',
            sharedRideAlphaTester: true,
            status: 'active'
        });
    }
    
    // Mocks para Request
    const mockAuth = (uid: string) => ({ uid, token: {} as any });
    
    // Coordenadas RAWSON (Plaza Principal y alrededores)
    const baseOrigin = { lat: -43.3002, lng: -65.1023, address: "Origen Base" };
    const baseDest = { lat: -43.3050, lng: -65.0980, address: "Destino Base" };
    
    // 1. A crea grupo
    console.log("\n1. Pasajero A solicita viaje compartido...");
    let resA: any;
    try {
        resA = await wrappedRequest({
            auth: { uid: uids[0] },
            data: {
                origin: baseOrigin,
                destination: baseDest,
                cityKey: "rawson",
                individualFareReference: 5000,
                sharedRideNoticeAccepted: true,
                manualCreation: true,
                clientRequestId: "reqA_" + Date.now()
            }
        });
        console.log("Resultado A:", resA);
    } catch (e: any) {
        console.error("Error A:", e.message);
        process.exit(1);
    }

    const groupId = resA.groupId;
    
    // 2. B entra en individual y busca sugerencias
    console.log("\n2. Pasajero B busca grupos cercanos...");
    let resNearby: any;
    try {
        const manualGroups = await db.collection('shared_ride_groups').where('cityKey', '==', 'rawson').get();
        console.log(`MANUAL CHECK: found ${manualGroups.docs.length} groups in DB`);
        manualGroups.forEach(d => console.log("- ", d.id, d.data().status, d.data().creatorId, d.data().passengerCount));

        resNearby = await wrappedList({
            auth: { uid: uids[1] },
            data: {
                origin: baseOrigin,
                destination: baseDest,
                cityKey: "rawson"
            }
        });
        console.log("Grupos cercanos encontrados:", resNearby.groups?.length);
        if (resNearby.groups.length === 0) {
            console.error("No se encontró el grupo de A");
            process.exit(1);
        }
    } catch (e: any) {
        console.error("Error listNearby:", e.message);
    }

    // 3. B se une
    console.log("\n3. Pasajero B se une al grupo...");
    try {
        const joinRes = await wrappedJoin({
            auth: { uid: uids[1] },
            data: {
                groupId,
                origin: baseOrigin,
                destination: baseDest,
                cityKey: "rawson",
                individualFareReference: 6000,
                sharedRideNoticeAccepted: true
            }
        });
        console.log("Join B OK:", joinRes.ok);
    } catch (e: any) {
        console.error("Error Join B:", e.message);
        process.exit(1);
    }

    // Verificamos estado del grupo en DB para ver si orderedStops está bien
    let gSnap = await db.doc(`shared_ride_groups/${groupId}`).get();
    let gData = gSnap.data() as any;
    console.log(`\n--- VERIFICACIÓN 2/4 ---`);
    console.log("Occupied Seats:", gData.occupiedSeats);
    console.log("Ordered Stops count:", gData.orderedStops?.length);
    let hasUndefined = gData.orderedStops?.some((s: any) => !s.requestId);
    console.log("Tiene undefined en requestId?:", hasUndefined);
    if (hasUndefined) throw new Error("BUG PRESENTE: undefined en orderedStops");

    // 4. C se une
    console.log("\n4. Pasajero C se une al grupo...");
    try {
        await wrappedJoin({
            auth: { uid: uids[2] },
            data: {
                groupId,
                origin: baseOrigin,
                destination: baseDest,
                cityKey: "rawson",
                individualFareReference: 7000,
                sharedRideNoticeAccepted: true
            }
        });
    } catch (e: any) {
        console.error("Error Join C:", e.message);
        process.exit(1);
    }

    // 5. D se une
    console.log("\n5. Pasajero D se une al grupo...");
    try {
        await wrappedJoin({
            auth: { uid: uids[3] },
            data: {
                groupId,
                origin: baseOrigin,
                destination: baseDest,
                cityKey: "rawson",
                individualFareReference: 4000,
                sharedRideNoticeAccepted: true
            }
        });
    } catch (e: any) {
        console.error("Error Join D:", e.message);
        process.exit(1);
    }

    gSnap = await db.doc(`shared_ride_groups/${groupId}`).get();
    gData = gSnap.data() as any;
    console.log(`\n--- VERIFICACIÓN 4/4 ---`);
    console.log("Occupied Seats:", gData.occupiedSeats);
    console.log("Group Status:", gData.status);
    console.log("Ordered Stops count:", gData.orderedStops?.length);
    console.log("Estimated Shared Total (Group Gross):", gData.estimatedSharedTotal);
    
    // Verificar que cada request mantuvo su tarifa individual base y generó un sharedFare correcto
    console.log("\n--- VERIFICANDO TARIFAS INDIVIDUALES Y SUMATORIA ---");
    let sumSharedFare = 0;
    for (const rid of gData.requestIds) {
        const rSnap = await db.doc(`shared_ride_requests/${rid}`).get();
        const rData = rSnap.data() as any;
        console.log(`Req ${rid} - Base Indiv: $${rData.individualFareReference} -> Paga Compartido: $${rData.sharedFareEstimate}`);
        sumSharedFare += rData.sharedFareEstimate;
    }
    console.log(`Sumatoria de aportes individuales: $${sumSharedFare}`);
    console.log(`Total Bruto en Grupo (groupGrossAmount): $${gData.estimatedSharedTotal}`);
    
    if (sumSharedFare !== gData.estimatedSharedTotal) {
         console.error("ERROR MATEMÁTICO: sumatoria no coincide con estimatedSharedTotal");
    } else {
         console.log("ÉXITO: Matemática perfecta, no hay mitades ni promedios.");
    }

    // 6. E intenta buscar (grupo lleno)
    console.log("\n6. Pasajero E busca grupos (debería no ver el grupo lleno)...");
    try {
        const resE = await wrappedList({
            auth: { uid: "test_user_E_456" },
            data: {
                origin: baseOrigin,
                destination: baseDest,
                cityKey: "rawson"
            }
        });
        const found = resE.groups.find((g: any) => g.groupId === groupId);
        console.log("Encontró el grupo A?:", !!found);
    } catch (e: any) {
        console.error("Error listNearby E:", e.message);
    }

    console.log("\n=== TEST FINALIZADO CON ÉXITO ===");

    // Clean up
    console.log("Limpiando DB de pruebas...");
    await db.doc(`shared_ride_groups/${groupId}`).delete();
    for (const rid of gData.requestIds) {
        await db.doc(`shared_ride_requests/${rid}`).delete();
    }
    console.log("Limpieza terminada.");
    testEnv.cleanup();
    process.exit(0);
}

runTest().catch(console.error);
