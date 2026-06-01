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

async function runDryRun() {
    console.log("==========================================");
    console.log("        DRY RUN: OPERATIONAL CLEANUP      ");
    console.log("==========================================");

    // 1. IDENTIFY THE 22 OLD SIMULATION/STRESS RIDES IN STATUS "searching"
    console.log("\n--- 1. VIAJES DE SIMULACIÓN/ESTRÉS EN STATUS 'searching' ---");
    const ridesSnap = await db.collection('rides')
        .where('status', '==', 'searching')
        .get();

    const ridesToClean: any[] = [];
    const passengersToCleanActiveRide: any[] = [];

    for (const doc of ridesSnap.docs) {
        const ride = doc.data();
        const rideId = doc.id;
        const passengerId = ride.passengerId;
        const createdAt = ride.createdAt?.toDate?.()?.toISOString() || 'unknown';
        const matchingAttempts = ride.matchingAttempts ?? 0;
        
        const isSimulation = ride.isSimulation === true || 
                             rideId.startsWith('sim_ride_') || 
                             rideId.startsWith('stress_ride_') ||
                             passengerId?.startsWith('test_pass_sim_') ||
                             passengerId?.startsWith('stress_pass_');

        // Check passenger profile activeRideId
        let passengerActiveRideId = 'none';
        if (passengerId) {
            const passSnap = await db.collection('users').doc(passengerId).get();
            if (passSnap.exists) {
                passengerActiveRideId = passSnap.data()?.activeRideId || 'none';
            }
        }

        const rideInfo = {
            rideId,
            createdAt,
            passengerId,
            cityKey: ride.cityKey || 'unknown',
            status: ride.status,
            matchingAttempts,
            isSimulation,
            passengerActiveRideId
        };

        ridesToClean.push(rideInfo);
        
        if (passengerActiveRideId === rideId) {
            passengersToCleanActiveRide.push({
                passengerId,
                activeRideId: passengerActiveRideId
            });
        }
    }

    // Sort by createdAt descending
    ridesToClean.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    console.log(`Total viajes 'searching' detectados: ${ridesToClean.length}`);
    ridesToClean.forEach(r => {
        console.log(`\nRide ID: ${r.rideId}`);
        console.log(`  - Creado: ${r.createdAt}`);
        console.log(`  - Pasajero ID: ${r.passengerId}`);
        console.log(`  - Ciudad: ${r.cityKey}`);
        console.log(`  - Status: ${r.status}`);
        console.log(`  - Intentos Matching: ${r.matchingAttempts}`);
        console.log(`  - Simulación: ${r.isSimulation}`);
        console.log(`  - ActiveRideId del Pasajero: ${r.passengerActiveRideId}`);
    });

    // 2. IDENTIFY GHOST OR INVALID DRIVERS
    console.log("\n--- 2. CONDUCTORES FANTASMA, STALE O INVÁLIDOS ---");
    const locSnap = await db.collection('drivers_locations').get();
    
    console.log(`Total de registros en drivers_locations: ${locSnap.size}`);

    const ghostDrivers: any[] = [];
    const staleDrivers: any[] = [];
    const suspendedRealDrivers: any[] = [];
    const simulationDrivers: any[] = [];

    const now = Date.now();
    const fifteenMinutesMs = 15 * 60 * 1000;

    for (const doc of locSnap.docs) {
        const loc = doc.data();
        const driverId = doc.id;
        const isOnline = loc.driverStatus === 'online';

        // Check if simulation
        const isSimulation = driverId.startsWith('stress_driver_') || 
                             driverId.startsWith('test_driver_') || 
                             driverId.startsWith('sim_driver_') ||
                             driverId.startsWith('driver_chaos_v2_') ||
                             loc.isTestDriver === true;

        if (isSimulation) {
            simulationDrivers.push({
                id: driverId,
                driverName: loc.driverName || 'Simulación',
                driverStatus: loc.driverStatus
            });
            continue;
        }

        // Verify users/{uid} profile doc
        const userSnap = await db.collection('users').doc(driverId).get();
        const userDocExists = userSnap.exists;
        const userData = userSnap.data();

        // Verify drivers/{uid} doc
        const driverSnap = await db.collection('drivers').doc(driverId).get();
        const driverDocExists = driverSnap.exists;

        // Verify municipal_profiles/{uid} doc
        const muniSnap = await db.collection('municipal_profiles').doc(driverId).get();
        const muniDocExists = muniSnap.exists;

        // Resolve suspension
        const isSuspended = userData?.isSuspended === true || 
                            userData?.adminSuspended === true || 
                            userData?.municipalSuspended === true || 
                            userData?.trafficSuspended === true ||
                            userData?.municipalStatus === 'suspended_expired_itv' ||
                            userData?.municipalStatus === 'suspended_expired_license' ||
                            userData?.municipalStatus === 'suspended_expired_insurance';

        // Resolve stale location
        const lastSeenSeconds = loc.lastSeenAt?._seconds || loc.lastUpdateAt?._seconds || 0;
        const lastSeenMs = lastSeenSeconds * 1000;
        const isStale = loc.isStale === true || (isOnline && (now - lastSeenMs > fifteenMinutesMs));
        const lastSeenIso = lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : 'never';

        const driverInfo = {
            id: driverId,
            driverName: loc.driverName || userData?.name || 'Desconocido',
            userDocExists,
            driverDocExists,
            muniDocExists,
            isOnline,
            isSuspended,
            isStale,
            lastSeen: lastSeenIso,
            cityKey: loc.cityKey || userData?.cityKey || 'unknown'
        };

        // Categorize
        if (!userDocExists || !driverDocExists) {
            ghostDrivers.push(driverInfo);
        } else if (isSuspended) {
            suspendedRealDrivers.push(driverInfo);
        } else if (isOnline && isStale) {
            staleDrivers.push(driverInfo);
        }
    }

    console.log(`\n➔ Conductores Fantasma (Sin doc en users o drivers): ${ghostDrivers.length}`);
    ghostDrivers.forEach(d => {
        console.log(`  * ID: ${d.id} | Nombre: ${d.driverName} | UserDoc: ${d.userDocExists} | DriverDoc: ${d.driverDocExists} | Ciudad: ${d.cityKey}`);
    });

    console.log(`\n➔ Conductores Reales Suspendidos: ${suspendedRealDrivers.length}`);
    suspendedRealDrivers.forEach(d => {
        console.log(`  * ID: ${d.id} | Nombre: ${d.driverName} | Ciudad: ${d.cityKey} | Last Seen: ${d.lastSeen}`);
    });

    console.log(`\n➔ Conductores con Ubicación Stale (Online pero inactivos >15m): ${staleDrivers.length}`);
    staleDrivers.forEach(d => {
        console.log(`  * ID: ${d.id} | Nombre: ${d.driverName} | Ciudad: ${d.cityKey} | Last Seen: ${d.lastSeen}`);
    });

    console.log(`\n➔ Conductores de Simulación/Stress Registrados: ${simulationDrivers.length}`);

    // Summary of action plans
    console.log("\n==========================================");
    console.log("       PROPUESTA DE LIMPIEZA OPERATIVA     ");
    console.log("==========================================");
    console.log(`1. Viajes a cancelar: ${ridesToClean.length} documentos de la colección 'rides'.`);
    console.log(`2. Pasajeros a limpiar activeRideId: ${passengersToCleanActiveRide.length} documentos.`);
    console.log(`3. Conductores fantasma a inactivar en drivers_locations: ${ghostDrivers.length} documentos.`);
    console.log(`4. Ubicaciones stale reales a marcar como offline: ${staleDrivers.length} documentos.`);
    console.log(`5. Conductores de simulación a inactivar en drivers_locations: ${simulationDrivers.filter(s => s.driverStatus === 'online').length} online.`);

    process.exit(0);
}

runDryRun().catch(err => {
    console.error("Dry run script failed:", err);
    process.exit(1);
});
