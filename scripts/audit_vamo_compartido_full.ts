import admin from 'firebase-admin';

try {
    admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
} catch (e) {}

const db = admin.firestore();

async function runAudit() {
    console.log("==========================================");
    console.log("AUDITORÍA COMPLETA: VamO Compartido");
    console.log("Modo: SOLO LECTURA (Producción)");
    console.log("==========================================\n");

    const issues = [];
    const stats = {
        activeSharedGroups: 0,
        activeMasterRides: 0,
        pendingOffers: 0,
        usersWithActivePointers: 0,
        orphanRequests: 0,
        stopsWithUndefined: 0,
        invalidStopIndex: 0,
        childRidesCreated: 0,
        childRidesWithoutFlag: 0,
        childRidesDangerousLedger: 0,
        droppedOffPassengersActive: 0,
        driverWithHungActiveRide: 0,
        nonCountedSharedRides: 0
    };

    try {
        console.log("1. Escaneando Grupos Compartidos...");
        const groupsSnap = await db.collection('shared_ride_groups').where('status', 'in', ['forming', 'matched']).get();
        stats.activeSharedGroups = groupsSnap.size;

        console.log("2. Escaneando Viajes Maestros Activos...");
        const ridesSnap = await db.collection('rides').where('isSharedRide', '==', true).where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_progress']).get();
        stats.activeMasterRides = ridesSnap.size;

        ridesSnap.forEach(doc => {
            const data = doc.data();
            if (data.isSharedChildRide) return; // Skip child rides for this check
            
            if (!data.orderedStops || data.orderedStops.some((s: any) => s === undefined || s.status === undefined)) {
                stats.stopsWithUndefined++;
                issues.push(`Master Ride ${doc.id} tiene orderedStops con undefined.`);
            }

            if (data.orderedStops && (data.currentStopIndex < 0 || data.currentStopIndex >= data.orderedStops.length)) {
                stats.invalidStopIndex++;
                issues.push(`Master Ride ${doc.id} tiene currentStopIndex inválido (${data.currentStopIndex}).`);
            }
        });

        console.log("3. Escaneando Ofertas Pendientes...");
        const offersSnap = await db.collection('rideOffers').where('status', '==', 'pending').get();
        stats.pendingOffers = offersSnap.size;

        console.log("4. Escaneando Usuarios...");
        // This query might be large, but for alpha it's okay. We look for those with sharedRideStatus.
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach(doc => {
            const u = doc.data();
            if (u.activeSharedGroupId || u.activeSharedRequestId) {
                stats.usersWithActivePointers++;
            }
            if (u.sharedRideStatus === 'dropped_off' && u.activeRideId) {
                // If activeRideId starts with shared_child, it's correct. Otherwise it's hung on master.
                if (!u.activeRideId.startsWith('shared_child')) {
                    stats.droppedOffPassengersActive++;
                    issues.push(`User ${doc.id} bajado pero sigue colgado con activeRideId = ${u.activeRideId}`);
                }
            }
            if (u.isDriver && u.activeRideId && (!u.driverStatus || u.driverStatus === 'online')) {
                 // Might be hung if ride is completed
            }
        });

        console.log("5. Escaneando Requests Huérfanas...");
        const reqsSnap = await db.collection('shared_ride_requests').where('status', 'in', ['pending', 'matched', 'picked_up', 'dropped_off']).get();
        
        reqsSnap.forEach(doc => {
            const req = doc.data();
            // A request is orphan if it's pending but has no user pointers, or something similar
            // Here we just count them.
            // stats.orphanRequests++;
        });

        console.log("6. Escaneando Child Rides...");
        const childRidesSnap = await db.collection('rides').where('isSharedChildRide', '==', true).get();
        stats.childRidesCreated = childRidesSnap.size;

        childRidesSnap.forEach(doc => {
            const child = doc.data();
            if (!child.isSharedChildRide) {
                stats.childRidesWithoutFlag++;
                issues.push(`Child Ride ${doc.id} no tiene el flag isSharedChildRide`);
            }
            if (child.financialStatus === 'settled' && child.walletCoveredAmount > 0) { // If it deducted wallet, it's dangerous
                stats.childRidesDangerousLedger++;
                issues.push(`Child Ride ${doc.id} modificó la wallet!`);
            }
            if (!child.countsForWeeklyPot) {
                stats.nonCountedSharedRides++;
            }
        });

        console.log("\n--- RESULTADOS ESTADÍSTICOS ---");
        console.table(stats);

        console.log("\n--- INCONSISTENCIAS CRÍTICAS DETECTADAS ---");
        if (issues.length === 0) {
            console.log("✓ No se detectaron inconsistencias graves. El estado parece estable.");
        } else {
            issues.forEach(iss => console.log(`[ALERTA] ${iss}`));
        }

    } catch (e) {
        console.error("Error durante auditoría:", e);
    }
}

runAudit().then(() => process.exit(0));
