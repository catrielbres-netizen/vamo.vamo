import admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

// CONFIGURACIÓN ESTRICTA V2
const RUN_ID = `chaos_v2_${Date.now()}`;
const DRIVERS_COUNT = 10;
const RIDES_COUNT = 20; // Empezamos con 20 para validar el flujo completo antes de 100
const CITY_KEY = 'rawson';

console.log(`🚀 INICIANDO CHAOS ENGINE V2 | RUN_ID: ${RUN_ID}`);

async function setupDrivers() {
    console.log(`🚗 Preparando ${DRIVERS_COUNT} conductores...`);
    const batch = db.batch();
    for (let i = 1; i <= DRIVERS_COUNT; i++) {
        const uid = `driver_${RUN_ID}_${i}`;
        const driverRef = db.collection('users').doc(uid);
        const locRef = db.collection('drivers_locations').doc(uid);

        batch.set(driverRef, {
            uid,
            runId: RUN_ID,
            role: 'driver',
            driverStatus: 'online',
            approved: true,
            cityKey: CITY_KEY,
            isSimulation: true,
            updatedAt: FieldValue.serverTimestamp()
        });

        batch.set(locRef, {
            driverStatus: 'online',
            currentLocation: { lat: -43.3, lng: -65.0 },
            lastSeenAt: FieldValue.serverTimestamp(),
            isSimulation: true,
            runId: RUN_ID,
            cityKey: CITY_KEY
        });
    }
    await batch.commit();
}

async function runSimulation() {
    await setupDrivers();

    for (let i = 0; i < RIDES_COUNT; i++) {
        const passengerId = `pass_${RUN_ID}_${i}`;
        const rideId = `ride_${RUN_ID}_${i}`;
        
        console.log(`[${i}] 🆕 Creando Viaje: ${rideId}`);
        
        // Simulación de createRideV1 (Escritura inicial)
        await db.collection('rides').doc(rideId).set({
            rideId,
            passengerId,
            runId: RUN_ID,
            status: 'searching',
            cityKey: CITY_KEY,
            origin: { lat: -43.3001, lng: -65.0501, address: 'Chaos V2 Origin' },
            destination: { lat: -43.2950, lng: -65.0450, address: 'Chaos V2 Dest' },
            pricing: { 
                estimatedTotal: 3000,
                estimatedDistanceMeters: 1500
            },
            isSimulation: true,
            createdAt: FieldValue.serverTimestamp()
        });

        // ESPERAR al Matching Engine (onRideCreatedV1)
        // Esto debería generar documentos en 'rideOffers'
        console.log(`[${i}] ⏳ Esperando matching (3s)...`);
        await new Promise(r => setTimeout(r, 3000));

        // AUDITAR OFFERS
        const offersSnap = await db.collection('rideOffers')
            .where('rideId', '==', rideId)
            .get();
        
        if (offersSnap.empty) {
            console.error(`[${i}] ❌ ERROR: No se generaron OFFERS para el viaje ${rideId}. Matching Engine falló o está lento.`);
            continue;
        }

        console.log(`[${i}] 📡 Detectadas ${offersSnap.size} ofertas. Intentando aceptación doble...`);
        
        // SIMULAR COLISIÓN: Dos conductores intentan aceptar la misma oferta
        const offers = offersSnap.docs;
        const offerId = offers[0].id;
        const driver1 = offers[0].data().driverId;
        const driver2 = offers.length > 1 ? offers[1].data().driverId : driver1;

        console.log(`[${i}] ⚔️ Conflict: Driver ${driver1} vs Driver ${driver2}`);

        const results = await Promise.allSettled([
            acceptOfferSim(rideId, offerId, driver1),
            acceptOfferSim(rideId, offerId, driver2)
        ]);

        results.forEach((res, idx) => {
            if (res.status === 'fulfilled' && res.value) {
                console.log(`[${i}] ✅ Winner ${idx === 0 ? driver1 : driver2}`);
            } else if (res.status === 'rejected') {
                console.log(`[${i}] 🛡️ Blocked ${idx === 0 ? driver1 : driver2}: ${res.reason}`);
            }
        });

        // COMPLETAR Y SETTLEMENT
        await new Promise(r => setTimeout(r, 1000));
        await db.collection('rides').doc(rideId).update({
            status: 'completed',
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`[${i}] 🏁 Completado. Triggering onRideSettlementV6...`);
    }

    console.log(`\n📊 SIMULACIÓN FINALIZADA. Esperando 10s para persistencia de settlement...`);
    await new Promise(r => setTimeout(r, 10000));
}

// Lógica de aceptación simulando la Cloud Function acceptRideOfferV1
async function acceptOfferSim(rideId: string, offerId: string, driverId: string) {
    const rideRef = db.collection('rides').doc(rideId);
    const offerRef = db.collection('rideOffers').doc(offerId);

    return db.runTransaction(async (tx) => {
        const rideSnap = await tx.get(rideRef);
        const ride = rideSnap.data();

        if (ride?.status !== 'searching') {
            throw `RIDE_TAKEN_BY_OTHER (Status: ${ride?.status})`;
        }

        tx.update(rideRef, {
            status: 'accepted',
            driverId: driverId,
            acceptedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        tx.update(offerRef, {
            status: 'accepted',
            acceptedAt: FieldValue.serverTimestamp()
        });

        return true;
    });
}

runSimulation().catch(console.error);
