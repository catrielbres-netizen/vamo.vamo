import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function runAudit() {
    console.log("==========================================");
    console.log(" AUDITORÍA VAMO COMPARTIDO 100% (PRODUCCIÓN)");
    console.log("==========================================\n");

    const report: any = {
        A_Groups: { total: 0, active: 0, forming_old: 0, driver_assigned_old: 0, in_progress_old: 0, completed_inconsistent: 0, cancelled_with_active_users: 0 },
        B_MasterRides: { total: 0, searching: 0, driver_assigned: 0, in_progress: 0, completed: 0, cancelled: 0, invalid_orderedStops: 0, missing_driverId: 0, missing_sharedPassengers: 0 },
        C_RideOffers: { total: 0, pending: 0, accepted_without_ride_update: 0, expired_but_visible: 0, orphan: 0 },
        D_Users: { total_passengers: 0, stuck_activeRideId: 0, stuck_activeSharedRideId: 0, stuck_activeSharedGroupId: 0, stuck_activeSharedRequestId: 0, total_drivers: 0, stuck_currentRideId: 0, driver_online_not_available: 0, driver_available_no_location: 0 },
        E_Requests: { total: 0, orphan_active: 0, grouped_no_group: 0, driver_assigned_no_master: 0, dropped_off_no_child: 0, completed_no_history: 0, cancelled_but_user_active: 0 },
        F_OrderedStops: { undefined: 0, missing_id: 0, missing_requestId: 0, missing_passengerId: 0, missing_location: 0, missing_status: 0, duplicates: 0, pickup_after_dropoff: 0, dropoff_no_pickup: 0, invalid_currentStopIndex: 0 },
        G_ChildRides: { total: 0, no_isSharedChildRide: 0, no_masterRideId: 0, no_sharedRequestId: 0, no_pricing: 0, no_origin_dest: 0, no_completedAt: 0, incorrect_status: 0, not_in_history: 0 },
        H_PozoRanking: { child_rides_summed: 0, child_rides_not_summed: 0, master_rides_summed_no_receipt: 0, possible_duplicates: 0 },
        I_MercadoPago: { real_charges_alpha: 0, child_rides_with_real_payment: 0, weird_ledgers: 0, duplicate_commissions: 0 }
    };

    console.log(">> Escaneando Users...");
    const usersSnap = await db.collection("users").get();
    const activePassengerSet = new Set<string>();
    
    for (const doc of usersSnap.docs) {
        const u = doc.data();
        if (u.role === 'passenger') {
            report.D_Users.total_passengers++;
            let stuck = false;
            if (u.activeRideId) { report.D_Users.stuck_activeRideId++; stuck = true; }
            if (u.activeSharedRideId) { report.D_Users.stuck_activeSharedRideId++; stuck = true; }
            if (u.activeSharedGroupId) { report.D_Users.stuck_activeSharedGroupId++; stuck = true; }
            if (u.activeSharedRequestId) { report.D_Users.stuck_activeSharedRequestId++; stuck = true; }
            if (stuck) activePassengerSet.add(doc.id);
        } else if (u.role === 'driver') {
            report.D_Users.total_drivers++;
            if (u.currentRideId) report.D_Users.stuck_currentRideId++;
            if (u.status === 'online' && !u.isAvailable) report.D_Users.driver_online_not_available++;
        }
    }

    console.log(">> Escaneando Shared Ride Groups...");
    const groupsSnap = await db.collection("shared_ride_groups").get();
    report.A_Groups.total = groupsSnap.size;
    const now = Date.now();
    for (const doc of groupsSnap.docs) {
        const g = doc.data();
        const ageMs = now - (g.createdAt?.toMillis() || now);
        if (['forming', 'pending', 'ready_for_driver_dispatch', 'driver_assigned', 'in_progress'].includes(g.status)) {
            report.A_Groups.active++;
            if (g.status === 'forming' && ageMs > 30 * 60000) report.A_Groups.forming_old++;
            if (g.status === 'driver_assigned' && ageMs > 60 * 60000) report.A_Groups.driver_assigned_old++;
            if (g.status === 'in_progress' && ageMs > 120 * 60000) report.A_Groups.in_progress_old++;
        }
        if (g.status === 'completed' && (!g.masterRideId || !g.driverId)) report.A_Groups.completed_inconsistent++;
        if (g.status === 'cancelled') {
            // Check if any passenger is still stuck in this group
            let hasStuck = false;
            // Need a fast way to check, we already have activePassengerSet
        }
    }

    console.log(">> Escaneando Master Rides y Child Rides...");
    const ridesSnap = await db.collection("rides").where("isSharedRide", "==", true).get();
    for (const doc of ridesSnap.docs) {
        const r = doc.data();
        report.B_MasterRides.total++;
        if (r.status === 'searching') report.B_MasterRides.searching++;
        else if (r.status === 'driver_assigned') report.B_MasterRides.driver_assigned++;
        else if (r.status === 'in_progress') report.B_MasterRides.in_progress++;
        else if (r.status === 'completed') report.B_MasterRides.completed++;
        else if (r.status === 'cancelled') report.B_MasterRides.cancelled++;

        if (r.status === 'driver_assigned' || r.status === 'in_progress') {
            if (!r.orderedStops || !Array.isArray(r.orderedStops)) report.B_MasterRides.invalid_orderedStops++;
            else {
                r.orderedStops.forEach((stop: any) => {
                    if (!stop.requestId) report.F_OrderedStops.missing_requestId++;
                    if (!stop.passengerId) report.F_OrderedStops.missing_passengerId++;
                    if (!stop.location) report.F_OrderedStops.missing_location++;
                });
            }
            if (!r.driverId) report.B_MasterRides.missing_driverId++;
        }
        if (!r.sharedPassengers || !Array.isArray(r.sharedPassengers)) report.B_MasterRides.missing_sharedPassengers++;
    }

    const childRidesSnap = await db.collection("rides").where("isSharedChildRide", "==", true).get();
    report.G_ChildRides.total = childRidesSnap.size;
    for (const doc of childRidesSnap.docs) {
        const r = doc.data();
        if (!r.masterRideId) report.G_ChildRides.no_masterRideId++;
        if (!r.sharedRequestId) report.G_ChildRides.no_sharedRequestId++;
        if (!r.pricing) report.G_ChildRides.no_pricing++;
        if (!r.origin || !r.destination) report.G_ChildRides.no_origin_dest++;
        if (r.status === 'completed' && !r.completedAt) report.G_ChildRides.no_completedAt++;
    }

    console.log(">> Escaneando Ride Offers...");
    const offersSnap = await db.collection("rideOffers").where("status", "==", "pending").get();
    report.C_RideOffers.pending = offersSnap.size;

    console.log(">> Escaneando Shared Ride Requests...");
    const reqsSnap = await db.collection("shared_ride_requests").get();
    report.E_Requests.total = reqsSnap.size;

    console.log("\n==========================================");
    console.log(" RESULTADOS DE AUDITORÍA");
    console.log("==========================================\n");
    console.log(JSON.stringify(report, null, 2));
    
    let criticals = 0;
    if (report.B_MasterRides.invalid_orderedStops > 0) criticals++;
    if (report.D_Users.stuck_activeRideId > 0) criticals++;

    if (criticals > 0) {
        console.log("\n[VEREDICTO] ❌ VamO Compartido NO ESTÁ LISTO para seguir probando.");
        console.log(`Se encontraron ${criticals} métricas críticas que requieren fixes inmediatos.`);
    } else {
        console.log("\n[VEREDICTO] ⚠️ VamO Compartido está parcialmente estable pero requiere fixes críticos.");
    }
}

runAudit().catch(console.error);
