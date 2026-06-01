import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const serviceAccountPath = join(process.cwd(), 'firebase-adminsdk.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Command line configuration
const isApplyMode = process.argv.includes('--apply');

async function main() {
    console.log("==================================================");
    console.log(` OPERATIONAL CLEANUP - MODE: ${isApplyMode ? '★ APPLY ★' : '☆ DRY RUN ☆'}`);
    console.log("==================================================");

    // 1. COLLECT STUCK RIDES IN STATUS "searching"
    console.log("\n--- 1. ANALIZANDO VIAJES EN STATUS 'searching' ---");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'searching')
        .get();

    const ridesToCancel: string[] = [];
    const passengersToReset: string[] = [];

    for (const doc of ridesSnap.docs) {
        const ride = doc.data();
        const rideId = doc.id;
        const passengerId = ride.passengerId;

        const isSimulation = ride.isSimulation === true || 
                             rideId.startsWith('sim_ride_') || 
                             rideId.startsWith('stress_ride_') ||
                             passengerId?.startsWith('test_pass_sim_') ||
                             passengerId?.startsWith('stress_pass_');

        if (isSimulation) {
            ridesToCancel.push(rideId);
            
            // Check if passenger has activeRideId pointing to this ride
            if (passengerId) {
                const passSnap = await db.collection('users').doc(passengerId).get();
                if (passSnap.exists && passSnap.data()?.activeRideId === rideId) {
                    passengersToReset.push(passengerId);
                }
            }
        }
    }

    console.log(`Encontrados ${ridesToCancel.length} viajes obsoletos para cancelar.`);
    console.log(`Encontrados ${passengersToReset.length} pasajeros con activeRideId desincronizado.`);

    if (isApplyMode) {
        const batch = db.batch();
        
        // Cancel rides
        ridesToCancel.forEach(rideId => {
            const ref = db.collection('rides').doc(rideId);
            batch.update(ref, {
                status: 'cancelled',
                cancelReason: 'simulation_cleanup',
                cancellationReason: 'simulation_cleanup',
                cleanupAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // Reset passenger activeRideId
        passengersToReset.forEach(passId => {
            const ref = db.collection('users').doc(passId);
            batch.update(ref, {
                activeRideId: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        if (ridesToCancel.length > 0 || passengersToReset.length > 0) {
            await batch.commit();
            console.log(`✔ [APPLY] Se cancelaron los viajes y se limpiaron los activeRideId en Firebase.`);
        } else {
            console.log("No hay operaciones de viaje/pasajero para aplicar.");
        }
    } else {
        ridesToCancel.forEach(id => console.log(`  [DRY RUN] Viaje a cancelar: rides/${id}`));
        passengersToReset.forEach(id => console.log(`  [DRY RUN] Pasajero a limpiar activeRideId: users/${id}`));
    }

    // 2. COLLECT GHOST AND SIMULATION DRIVER LOCATIONS
    console.log("\n--- 2. ANALIZANDO UBICACIONES FANTASMAS Y DE SIMULACIÓN ---");
    const locSnap = await db.collection('drivers_locations').get();
    
    const ghostDriverLocations: string[] = [];
    const simulationDriverLocations: string[] = [];

    for (const doc of locSnap.docs) {
        const loc = doc.data();
        const driverId = doc.id;

        const isSimulation = driverId.startsWith('stress_driver_') || 
                             driverId.startsWith('test_driver_') || 
                             driverId.startsWith('sim_driver_') ||
                             driverId.startsWith('driver_chaos_v2_') ||
                             loc.isTestDriver === true;

        if (isSimulation) {
            if (loc.driverStatus === 'online') {
                simulationDriverLocations.push(driverId);
            }
            continue;
        }

        // Verify users/{uid} profile doc
        const userSnap = await db.collection('users').doc(driverId).get();
        if (!userSnap.exists) {
            ghostDriverLocations.push(driverId);
        }
    }

    console.log(`Encontradas ${ghostDriverLocations.length} ubicaciones fantasmas (sin perfil en users/).`);
    console.log(`Encontradas ${simulationDriverLocations.length} ubicaciones de simulación marcadas como 'online'.`);

    if (isApplyMode) {
        const batch = db.batch();

        // Remove ghost driver locations from index (set offline)
        ghostDriverLocations.forEach(driverId => {
            const ref = db.collection('drivers_locations').doc(driverId);
            batch.update(ref, {
                driverStatus: 'offline',
                isOnline: false,
                isStale: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // Set simulation driver locations to offline
        simulationDriverLocations.forEach(driverId => {
            const ref = db.collection('drivers_locations').doc(driverId);
            batch.update(ref, {
                driverStatus: 'offline',
                isOnline: false,
                isStale: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        if (ghostDriverLocations.length > 0 || simulationDriverLocations.length > 0) {
            await batch.commit();
            console.log(`✔ [APPLY] Se marcaron offline las ubicaciones fantasmas y de simulación.`);
        } else {
            console.log("No hay operaciones de ubicación para aplicar.");
        }
    } else {
        ghostDriverLocations.forEach(id => console.log(`  [DRY RUN] Ubicación fantasma a marcar offline: drivers_locations/${id}`));
        simulationDriverLocations.forEach(id => console.log(`  [DRY RUN] Ubicación de simulación online a marcar offline: drivers_locations/${id}`));
    }

    console.log("\n==========================================");
    console.log("         FIN DE LA OPERACIÓN              ");
    console.log("==========================================");
    process.exit(0);
}

main().catch(err => {
    console.error("Cleanup script failed:", err);
    process.exit(1);
});
