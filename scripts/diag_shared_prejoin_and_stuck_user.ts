import admin from "firebase-admin";

if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// Helper para calcular distancia
function getDistanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

async function run() {
    console.log(`Starting diag_shared_prejoin_and_stuck_user script.\n`);

    console.log("--- 1. USUARIO BLOQUEADO ---");
    const blockedUsernames = ["maria", "VamO Pasajero Compartido Test 2"];
    let blockedFound = 0;

    const usersSnapshot = await db.collection("users").get();
    const activeRequestsSnapshot = await db.collection("shared_ride_requests").get();

    for (const doc of usersSnapshot.docs) {
        const u = doc.data();
        if (blockedUsernames.includes(u.name)) {
            console.log(`\nUser: ${u.name} (uid: ${doc.id})`);
            console.log(` - activeRideId: ${u.activeRideId}`);
            console.log(` - activeSharedRideId: ${u.activeSharedRideId}`);
            console.log(` - activeSharedGroupId: ${u.activeSharedGroupId}`);
            console.log(` - activeSharedRequestId: ${u.activeSharedRequestId}`);
            
            let stuckReason = "None";
            if (u.activeSharedRequestId) {
                const reqDoc = await db.collection("shared_ride_requests").doc(u.activeSharedRequestId).get();
                if (reqDoc.exists) {
                    const rData = reqDoc.data()!;
                    stuckReason = `Blocked by old request ${u.activeSharedRequestId} (status: ${rData.status})`;
                } else {
                    stuckReason = `Blocked by non-existent request ${u.activeSharedRequestId}`;
                }
            } else if (u.activeSharedGroupId || u.activeSharedRideId) {
                stuckReason = "Blocked by old group/ride fields";
            }
            console.log(` -> Motivo de bloqueo: ${stuckReason}`);
            blockedFound++;
        }
    }

    console.log("\n--- 2. GRUPOS COMPATIBLES ACTUALES ---");
    const now = Date.now();
    const groupsSnap = await db.collection("shared_ride_groups")
        .where("status", "in", ["forming", "pending_passenger_confirmation"])
        .where("isPubliclyJoinable", "==", true)
        .get();

    console.log(`Found ${groupsSnap.docs.length} publicly joinable groups in forming/pending_passenger_confirmation.`);

    groupsSnap.docs.forEach(doc => {
        const g = doc.data();
        const expiresAt = g.expiresAt?.toDate ? g.expiresAt.toDate() : null;
        const isExpired = expiresAt && expiresAt.getTime() < now;
        console.log(`\nGroup: ${doc.id}`);
        console.log(` - passengerCount: ${g.occupiedSeats}/${g.maxSeats}`);
        console.log(` - status: ${g.status}`);
        console.log(` - expiresAt: ${expiresAt} (isExpired: ${isExpired})`);
        console.log(` - cityKey: ${g.cityKey}`);
        
        if (isExpired) {
            console.log(` -> Por qué NO aparece: Expirado.`);
        } else if (g.occupiedSeats >= g.maxSeats) {
            console.log(` -> Por qué NO aparece: Lleno.`);
        } else {
            console.log(` -> Aparecería como sugerencia si la distancia y compatibilidad de ruta coinciden.`);
        }
    });

    console.log("\n--- 3. RESULTADO DEL DIAGNÓSTICO ---");
    const issues = [];
    if (blockedFound > 0) issues.push("JOIN_BLOCKED_BY_OLD_REQUEST");
    
    // We analyzed the codebase and found handlePreRequestRide DOES run,
    // but the error message is unhandled gracefully in UI.
    issues.push("UNHANDLED_UX_ON_ALREADY_EXISTS");

    console.log(issues.join(", "));
}

run().catch(console.error);
