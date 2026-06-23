import * as admin from 'firebase-admin';
import * as path from 'path';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), '../service-account.json');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Haversine distance formula in meters
function getDistance(coord1: {latitude: number, longitude: number}, coord2: {latitude: number, longitude: number}) {
    const R = 6371e3; // metres
    const φ1 = coord1.latitude * Math.PI/180; // φ, λ in radians
    const φ2 = coord2.latitude * Math.PI/180;
    const Δφ = (coord2.latitude-coord1.latitude) * Math.PI/180;
    const Δλ = (coord2.longitude-coord1.longitude) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
}

const db = admin.firestore();

async function runDiagnosis() {
    console.log("=== INICIANDO DIAGNÓSTICO LIVE DE SUGERENCIA DE VAMO COMPARTIDO ===");

    // 1. Encontrar el grupo más reciente
    const groupsRef = db.collection('shared_ride_groups');
    const recentGroupsQuery = await groupsRef.orderBy('createdAt', 'desc').limit(20).get();
    
    if (recentGroupsQuery.empty) {
        console.log("No se encontraron grupos recientes.");
        return;
    }

    let groupDoc = null;
    let groupData = null;
    for (const doc of recentGroupsQuery.docs) {
        const data = doc.data();
        if (['forming', 'collecting_passengers', 'pending_passenger_confirmation'].includes(data.status)) {
            groupDoc = doc;
            groupData = data;
            break;
        }
    }

    if (!groupData) {
        console.log("No se encontraron grupos ACTIVOS recientes.");
        return;
    }

    console.log(`\nEncontrados ${recentGroupsQuery.size} grupos recientes. Analizando el activo más reciente...`);

    console.log("\n=== DATOS DEL GRUPO (GRUPO A) ===");
    console.log(JSON.stringify(groupData, null, 2));
    console.log(`- groupId: ${groupData.id}`);
    console.log(`- status: ${groupData.status}`);
    console.log(`- cityKey: ${groupData.cityKey}`);
    console.log(`- occupiedSeats: ${groupData.occupiedSeats}`);
    console.log(`- maxSeats: ${groupData.maxSeats}`);
    console.log(`- createdBy: ${groupData.creatorPassengerId}`);
    console.log(`- expiresAt: ${groupData.expiresAt ? new Date(groupData.expiresAt._seconds * 1000).toISOString() : 'N/A'}`);
    console.log(`- origin: lat=${groupData.pickupStops?.[0]?.lat}, lng=${groupData.pickupStops?.[0]?.lng}`);
    console.log(`- destination: lat=${groupData.dropoffStops?.[0]?.lat}, lng=${groupData.dropoffStops?.[0]?.lng}`);
    
    const groupOrigin = groupData.pickupStops?.[0];
    const groupDestination = groupData.dropoffStops?.[0];

    const hasValidCoordinates = groupOrigin?.lat && groupOrigin?.lng && groupDestination?.lat && groupDestination?.lng;
    console.log(`- tiene coordenadas válidas?: ${!!hasValidCoordinates}`);
    
    let allStopsHaveRequestId = true;
    if (groupData.orderedStops) {
        groupData.orderedStops.forEach((stop: any, index: number) => {
            if (!stop.requestId) allStopsHaveRequestId = false;
        });
    }
    console.log(`- todos los orderedStops tienen requestId?: ${allStopsHaveRequestId}`);

    console.log("\n=== DATOS DEL USUARIO B (BUSCANDO...) ===");
    // Aquí vamos a iterar los usuarios para encontrar otro usuario alpha tester
    const usersQuery = await db.collection('users')
        .where('sharedRideAlphaTester', '==', true)
        .limit(5)
        .get();

    let userBData: any = null;
    let userBId = '';

    for (const doc of usersQuery.docs) {
        if (doc.id !== groupData.creatorPassengerId) {
            userBData = doc.data();
            userBId = doc.id;
            break;
        }
    }

    if (userBData) {
        console.log(`- UID: ${userBId}`);
        console.log(`- role: ${userBData.role}`);
        console.log(`- cityKey: ${userBData.cityKey}`);
        console.log(`- sharedRideAlphaTester: ${userBData.sharedRideAlphaTester}`);
        console.log(`- activeRideId: ${userBData.activeRideId || 'null'}`);
        console.log(`- activeSharedRideId: ${userBData.activeSharedRideId || 'null'}`);
        console.log(`- activeSharedGroupId: ${userBData.activeSharedGroupId || 'null'}`);
        console.log(`- registrationStatus: ${userBData.registrationStatus}`);
    } else {
        console.log("No se encontró usuario B alfa tester distinto de A para la simulación.");
        return;
    }

    if (!hasValidCoordinates) {
        console.log("No se puede simular B porque el grupo no tiene coordenadas.");
        return;
    }

    console.log("\n=== SIMULANDO listNearbySharedRideGroupsV1 PARA USUARIO B ===");
    
    // Simular un origen y destino cerca de A
    const simOrigin = {
        lat: groupOrigin.lat + 0.001, // ~110m 
        lng: groupOrigin.lng + 0.001
    };
    const simDestination = {
        lat: groupDestination.lat + 0.001,
        lng: groupDestination.lng + 0.001
    };

    console.log(`Parámetros B: orig[${simOrigin.lat}, ${simOrigin.lng}] dest[${simDestination.lat}, ${simDestination.lng}] cityKey=${userBData.cityKey || groupData.cityKey}`);

    let discardReason = 'UNKNOWN';
    let isCompatible = true;

    if (!userBData.sharedRideAlphaTester) {
        discardReason = 'NOT_ALPHA';
        isCompatible = false;
    } else if (userBData.activeRideId || userBData.activeSharedRideId || userBData.activeSharedGroupId) {
        discardReason = 'USER_HAS_ACTIVE_RIDE';
        isCompatible = false;
    } else if (!hasValidCoordinates) {
        discardReason = 'MISSING_COORDINATES';
        isCompatible = false;
    } else if (groupData.cityKey && groupData.cityKey !== userBData.cityKey && userBData.cityKey) {
        discardReason = 'CITY_MISMATCH';
        isCompatible = false;
    } else if (!['forming', 'collecting_passengers', 'pending_passenger_confirmation'].includes(groupData.status)) {
        discardReason = 'STATUS_NOT_ALLOWED';
        isCompatible = false;
    } else if (groupData.occupiedSeats >= groupData.maxSeats) {
        discardReason = 'GROUP_FULL';
        isCompatible = false;
    } else if (groupData.expiresAt && (groupData.expiresAt._seconds * 1000) < Date.now()) {
        discardReason = 'EXPIRED';
        isCompatible = false;
    } else if (groupData.passengerIds?.includes(userBId)) {
        discardReason = 'USER_ALREADY_IN_GROUP';
        isCompatible = false;
    } else {
        const originDist = getDistance(
            { latitude: simOrigin.lat, longitude: simOrigin.lng },
            { latitude: groupOrigin.lat, longitude: groupOrigin.lng }
        );
        const MAX_ORIGIN_DISTANCE = 1500;
        if (originDist > MAX_ORIGIN_DISTANCE) {
            discardReason = 'ORIGIN_TOO_FAR';
            isCompatible = false;
        } else {
            const destDist = getDistance(
                { latitude: simDestination.lat, longitude: simDestination.lng },
                { latitude: groupDestination.lat, longitude: groupDestination.lng }
            );
            const MAX_DEST_DISTANCE = 3000;
            if (destDist > MAX_DEST_DISTANCE) {
                discardReason = 'DESTINATION_INCOMPATIBLE';
                isCompatible = false;
            }
        }
    }

    if (isCompatible) {
        console.log(`-> RESULTADO: GRUPO ACEPTADO Y COMPATIBLE. (Aparecería en la lista)`);
    } else {
        console.log(`-> RESULTADO: GRUPO DESCARTADO.`);
        console.log(`-> MOTIVO DE DESCARTE: ${discardReason}`);
    }

    console.log("\n=== FIN DEL DIAGNÓSTICO ===");
}

runDiagnosis().catch(console.error);
