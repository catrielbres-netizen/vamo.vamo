import admin from 'firebase-admin';

try {
    admin.initializeApp({ projectId: "studio-6697160840-7c67f" });
} catch (e) {}

const db = admin.firestore();

async function runDiagnostic() {
    console.log("=====================================================");
    console.log("🔍 DIAGNÓSTICO DE PRESENCIA: Conductor Eduardo");
    console.log("UID: VNhou0ag4wXXPr6IXa3foO6SI8B3");
    console.log("=====================================================\n");

    const uid = 'VNhou0ag4wXXPr6IXa3foO6SI8B3';

    // 1. Estado en users
    console.log("=== 1. ESTADO EN COLECCIÓN 'users' ===");
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();

    if (!user) {
        console.log(`[ERROR] Usuario ${uid} no existe en la colección 'users'.`);
    } else {
        console.log(`- name: ${user.firstName || user.name || 'N/A'} ${user.lastName || ''}`);
        console.log(`- role: ${user.role}`);
        console.log(`- cityKey: ${user.cityKey}`);
        console.log(`- status: ${user.status}`);
        console.log(`- driverStatus: ${user.driverStatus}`);
        console.log(`- isOnline: ${user.isOnline}`);
        console.log(`- isAvailable: ${user.isAvailable}`);
        console.log(`- approved: ${user.approved}`);
        console.log(`- enabled: ${user.enabled}`);
        console.log(`- activeRideId: ${user.activeRideId}`);
        console.log(`- currentRideId: ${user.currentRideId}`);
        console.log(`- activeSharedRideId: ${user.activeSharedRideId}`);
        console.log(`- activeSharedGroupId: ${user.activeSharedGroupId}`);
        console.log(`- location: ${user.location ? `lat: ${user.location.lat}, lng: ${user.location.lng}` : 'N/A'}`);
        console.log(`- lastLocationUpdate: ${user.lastLocationUpdate ? user.lastLocationUpdate.toDate().toISOString() : 'N/A'}`);
        console.log(`- updatedAt: ${user.updatedAt ? user.updatedAt.toDate().toISOString() : 'N/A'}`);
        console.log(`- vehicleCapacity: ${user.vehicleCapacity}`);
        console.log(`- serviceType: ${user.serviceType}`);
        console.log(`- driverType: ${user.driverType}`);
        console.log(`- subtype: ${user.subtype}`);
    }

    // 2. Estado en drivers_locations
    console.log("\n=== 2. ESTADO EN COLECCIÓN 'drivers_locations' ===");
    const locSnap = await db.collection('drivers_locations').doc(uid).get();
    const loc = locSnap.data();

    if (!loc) {
        console.log(`[ALERTA] El documento del conductor no existe en 'drivers_locations'.`);
    } else {
        console.log(`- existe: SÍ`);
        console.log(`- lat/lng: lat: ${loc.lat}, lng: ${loc.lng}`);
        console.log(`- cityKey: ${loc.cityKey}`);
        console.log(`- online: ${loc.online}`);
        console.log(`- isAvailable: ${loc.isAvailable}`);
        console.log(`- driverStatus: ${loc.driverStatus}`);
        console.log(`- heading: ${loc.heading}`);
        console.log(`- updatedAt: ${loc.updatedAt ? (loc.updatedAt.toDate ? loc.updatedAt.toDate().toISOString() : new Date(loc.updatedAt).toISOString()) : 'N/A'}`);
        console.log(`- lastSeen: ${loc.lastSeen ? (loc.lastSeen.toDate ? loc.lastSeen.toDate().toISOString() : new Date(loc.lastSeen).toISOString()) : 'N/A'}`);
        console.log(`- geohash: ${loc.geohash || 'N/A'}`);
    }

    // 3. Query del Mapa de VamoMuni
    console.log("\n=== 3. QUERY DEL MAPA VAMOMUNI ===");
    // users where role='driver' AND cityKey=cityKey
    let appearsInMuniUsers = false;
    if (user && user.role === 'driver' && user.cityKey) {
        appearsInMuniUsers = true;
    }
    
    // Y luego el frontend une con drivers_locations.
    let appearsInMuniMap = false;
    let mapDiscardReason = [];
    if (!appearsInMuniUsers) mapDiscardReason.push("Falta role='driver' o cityKey en users.");
    if (!loc) mapDiscardReason.push("Falta documento en drivers_locations.");
    // buildMapDriverViewModel in frontend checks locStatus or userStatus.
    
    if (appearsInMuniUsers && loc) {
        appearsInMuniMap = true;
        console.log(`[OK] Aparece en la query base del mapa VamoMuni.`);
    } else {
        console.log(`[FALLO] No aparecerá bien en el mapa. Motivos: ${mapDiscardReason.join(' | ')}`);
    }


    // 4. Query de Matching Backend
    console.log("\n=== 4. QUERY DE MATCHING ===");
    // findNextDriverAndCreateOffer usa:
    // query = usersRef.where('role', '==', 'driver').where('driverStatus', '==', 'online').where('cityKey', '==', cityKey);
    let appearsInMatching = true;
    const matchingReasons = [];
    if (!user || user.role !== 'driver') { appearsInMatching = false; matchingReasons.push("role != 'driver'"); }
    if (!user || user.driverStatus !== 'online') { appearsInMatching = false; matchingReasons.push("driverStatus != 'online'"); }
    if (!user || user.cityKey !== 'rawson') { appearsInMatching = false; matchingReasons.push("cityKey != 'rawson' (o la cityKey de la request)"); }
    if (user && user.activeRideId) { appearsInMatching = false; matchingReasons.push(`Tiene activeRideId: ${user.activeRideId}`); }
    
    if (appearsInMatching) {
        console.log(`[OK] Aparece en la query de matching.`);
    } else {
        console.log(`[FALLO] Ignorado por matching. Motivos: ${matchingReasons.join(' | ')}`);
    }

    // 5. Diagnóstico Final
    console.log("\n=== 5. DIAGNÓSTICO ESPERADO ===");
    if (user && user.activeRideId) {
        console.log(`DIAGNÓSTICO EXACTO: DRIVER_HAS_ACTIVE_RIDE`);
    } else if (user && user.driverStatus !== 'online') {
        console.log(`DIAGNÓSTICO EXACTO: DRIVER_STATUS_NOT_AVAILABLE`);
    } else if (!loc) {
        console.log(`DIAGNÓSTICO EXACTO: DRIVER_LOCATION_MISSING`);
    } else {
        console.log(`DIAGNÓSTICO EXACTO: UNKNOWN`);
    }

    console.log("\nEjecución finalizada.");
}

runDiagnostic().then(() => process.exit(0));
