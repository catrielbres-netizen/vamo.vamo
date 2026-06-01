
import { Place, SharedRideRequest, Ride } from "../types";

/**
 * VamO Compartido V1 - Route Compatibility Logic
 */

export interface CompatibilityResult {
    compatible: boolean;
    reason?: string;
    baseDistanceMeters: number;
    combinedDistanceMeters: number;
    extraDistanceMeters: number;
    extraDistancePercent: number;
    baseDurationSeconds: number;
    combinedDurationSeconds: number;
    extraDurationSeconds: number;
    pickupStops: Place[];
    dropoffStops: Place[];
    orderedStops: Array<{
        type: 'pickup' | 'dropoff';
        requestId: string;
        location: Place;
    }>;
    originCompatibilityMeters: number;
    destinationCompatibilityBlocks: number;
    destinationReferencePoint: Place;
}

function toRad(value: number): number {
    return (value * Math.PI) / 180;
}

/**
 * Haversine distance in meters
 */
export function getDistanceM(p1: Place, p2: Place): number {
    const R = 6371e3; // Earth radius in meters
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Evalúa si un grupo de solicitudes son compatibles para un viaje compartido.
 * Reglas Fase 2B:
 * - Desvío máximo: 25% sobre la ruta base.
 * - Tiempo adicional máximo: 12 minutos (720s).
 * - Alineación de dirección: Los vectores de viaje no deben ser opuestos.
 */
export function evaluateSharedRouteCompatibility(
    requests: SharedRideRequest[],
    maxOriginRadiusM: number = 1000,
    maxDestinationRadiusM: number = 3000
): CompatibilityResult {
    if (requests.length < 1) {
        return { 
            compatible: false, reason: 'NO_REQUESTS', 
            baseDistanceMeters: 0, combinedDistanceMeters: 0, extraDistanceMeters: 0, extraDistancePercent: 0,
            baseDurationSeconds: 0, combinedDurationSeconds: 0, extraDurationSeconds: 0,
            pickupStops: [], dropoffStops: [], orderedStops: [],
            originCompatibilityMeters: 0, destinationCompatibilityBlocks: 0,
            destinationReferencePoint: { address: '', lat: 0, lng: 0 }
        };
    }

    // 1. Validar cercanía de orígenes y destinos
    const baseOrigin = requests[0].origin;
    const baseDestination = requests[0].destination;
    
    let maxOriginDist = 0;
    let maxDestDist = 0;
    for (let i = 1; i < requests.length; i++) {
        const originDist = getDistanceM(baseOrigin, requests[i].origin);
        if (originDist > maxOriginDist) maxOriginDist = originDist;
        
        if (originDist > maxOriginRadiusM) {
            return {
                compatible: false,
                reason: `ORIGIN_TOO_FAR: Pasajero ${i+1} está a ${Math.round(originDist)}m (máximo ${maxOriginRadiusM}m)`,
                baseDistanceMeters: 0, combinedDistanceMeters: 0, extraDistanceMeters: 0, extraDistancePercent: 0,
                baseDurationSeconds: 0, combinedDurationSeconds: 0, extraDurationSeconds: 0,
                pickupStops: [], dropoffStops: [], orderedStops: [],
                originCompatibilityMeters: originDist, destinationCompatibilityBlocks: 0,
                destinationReferencePoint: baseDestination
            };
        }

        const destDist = getDistanceM(baseDestination, requests[i].destination);
        if (destDist > maxDestDist) maxDestDist = destDist;
        
        if (destDist > maxDestinationRadiusM) {
            return {
                compatible: false,
                reason: `DESTINATION_TOO_FAR: El destino del Pasajero ${i+1} está a ${Math.round(destDist)}m del destino base (máximo ${maxDestinationRadiusM}m)`,
                baseDistanceMeters: 0, combinedDistanceMeters: 0, extraDistanceMeters: 0, extraDistancePercent: 0,
                baseDurationSeconds: 0, combinedDurationSeconds: 0, extraDurationSeconds: 0,
                pickupStops: [], dropoffStops: [], orderedStops: [],
                originCompatibilityMeters: originDist, destinationCompatibilityBlocks: destDist / 100,
                destinationReferencePoint: baseDestination
            };
        }
    }

    // 2. Validar Alineación de Dirección (Evitar viajes opuestos)
    // Usamos el vector (lat2-lat1, lng2-lng1) de la primera solicitud como referencia
    const ref = requests[0];
    const vRef = { lat: ref.destination.lat - ref.origin.lat, lng: ref.destination.lng - ref.origin.lng };
    
    for (let i = 1; i < requests.length; i++) {
        const req = requests[i];
        const vReq = { lat: req.destination.lat - req.origin.lat, lng: req.destination.lng - req.origin.lng };
        
        // Producto punto para ver si van en la misma dirección general
        const dotProduct = (vRef.lat * vReq.lat) + (vRef.lng * vReq.lng);
        const magRef = Math.sqrt(vRef.lat * vRef.lat + vRef.lng * vRef.lng);
        const magReq = Math.sqrt(vReq.lat * vReq.lat + vReq.lng * vReq.lng);
        
        if (magRef > 0 && magReq > 0) {
            const cosTheta = dotProduct / (magRef * magReq);
            if (cosTheta < 0.5) { // Menos de 60 grados de coincidencia aproximada
                return {
                    compatible: false,
                    reason: `OPPOSITE_DIRECTIONS: El pasajero ${i+1} va en una dirección incompatible`,
                    baseDistanceMeters: 0, combinedDistanceMeters: 0, extraDistanceMeters: 0, extraDistancePercent: 0,
                    baseDurationSeconds: 0, combinedDurationSeconds: 0, extraDurationSeconds: 0,
                    pickupStops: [], dropoffStops: [], orderedStops: [],
                    originCompatibilityMeters: maxOriginDist, destinationCompatibilityBlocks: maxDestDist / 100,
                    destinationReferencePoint: baseDestination
                };
            }
        }
    }

    // 3. Cálculo conservador de ruta (Secuencia: todos los pickups -> todos los dropoffs)
    const pickupStops = requests.map(r => r.origin);
    const dropoffStops = requests.map(r => r.destination);
    
    const orderedStops: CompatibilityResult['orderedStops'] = [];
    requests.forEach(r => orderedStops.push({ type: 'pickup', requestId: r.id, location: r.origin }));
    requests.forEach(r => orderedStops.push({ type: 'dropoff', requestId: r.id, location: r.destination }));

    // Calcular distancia combinada
    let combinedDistanceMeters = 0;
    for (let i = 0; i < orderedStops.length - 1; i++) {
        combinedDistanceMeters += getDistanceM(orderedStops[i].location, orderedStops[i+1].location);
    }

    // Distancia base: El viaje más largo individualmente
    let baseDistanceMeters = 0;
    requests.forEach(r => {
        const d = getDistanceM(r.origin, r.destination);
        if (d > baseDistanceMeters) baseDistanceMeters = d;
    });

    const extraDistanceMeters = Math.max(0, combinedDistanceMeters - baseDistanceMeters);
    const extraDistancePercent = baseDistanceMeters > 0 ? (extraDistanceMeters / baseDistanceMeters) : 0;

    // Tiempo estimado (v=30km/h => 8.33m/s + 120s por parada adicional)
    const AVG_SPEED_MS = 8.33;
    const SECONDS_PER_STOP = 120;
    
    const baseDurationSeconds = (baseDistanceMeters / AVG_SPEED_MS);
    const combinedDurationSeconds = (combinedDistanceMeters / AVG_SPEED_MS) + ((requests.length - 1) * SECONDS_PER_STOP);
    const extraDurationSeconds = Math.max(0, combinedDurationSeconds - baseDurationSeconds);

    // Validar límites más flexibles para destinos
    const isCompatible = extraDistancePercent <= 0.65 && extraDurationSeconds <= 900;

    return {
        compatible: isCompatible,
        reason: isCompatible ? undefined : `DETOUR_TOO_LONG: Desvío ${Math.round(extraDistancePercent * 100)}% / Tiempo extra ${Math.round(extraDurationSeconds/60)} min`,
        baseDistanceMeters,
        combinedDistanceMeters,
        extraDistanceMeters,
        extraDistancePercent,
        baseDurationSeconds,
        combinedDurationSeconds,
        extraDurationSeconds,
        pickupStops,
        dropoffStops,
        orderedStops,
        originCompatibilityMeters: maxOriginDist,
        destinationCompatibilityBlocks: maxDestDist / 100,
        destinationReferencePoint: baseDestination
    };
}

/**
 * [VamO PRO] Recalcula la ruta óptima iniciando desde la posición del conductor.
 * Regla de negocio: El primer pickup DEBE ser el más cercano al conductor.
 */
export function optimizeSharedRouteWithDriver(
    driverLocation: { lat: number; lng: number },
    requests: SharedRideRequest[]
): Array<{
    type: 'pickup' | 'dropoff';
    requestId: string;
    location: Place;
}> {
    if (requests.length === 0) return [];
    
    const driverPlace: Place = { address: 'Driver Location', ...driverLocation };
    
    // 1. Encontrar el primer pickup (el más cercano al conductor)
    let closestPickupIndex = 0;
    let minDistance = Infinity;
    
    requests.forEach((req, idx) => {
        const d = getDistanceM(driverPlace, req.origin);
        if (d < minDistance) {
            minDistance = d;
            closestPickupIndex = idx;
        }
    });

    const firstRequest = requests[closestPickupIndex];
    const otherRequests = requests.filter((_, idx) => idx !== closestPickupIndex);

    // 2. Construir secuencia: Primer Pickup -> Otros Pickups -> Todos los Dropoffs
    // Nota: Por ahora mantenemos la regla de "Todos los Pickups antes que los Dropoffs" 
    // para evitar que un pasajero espere en el auto mientras se busca a otro.
    const orderedStops: any[] = [];
    
    // Primer Pickup
    orderedStops.push({ type: 'pickup', requestId: firstRequest.id, location: firstRequest.origin });
    
    // Otros Pickups (en orden de cercanía al anterior si hay más de 2)
    let lastLocation = firstRequest.origin;
    const remainingPickups = [...otherRequests];
    while (remainingPickups.length > 0) {
        let nextIdx = 0;
        let nextDist = Infinity;
        remainingPickups.forEach((r, idx) => {
            const d = getDistanceM(lastLocation, r.origin);
            if (d < nextDist) {
                nextDist = d;
                nextIdx = idx;
            }
        });
        const next = remainingPickups.splice(nextIdx, 1)[0];
        orderedStops.push({ type: 'pickup', requestId: next.id, location: next.origin });
        lastLocation = next.origin;
    }

    // Dropoffs (en orden de cercanía al último pickup)
    const remainingDropoffs = [...requests];
    while (remainingDropoffs.length > 0) {
        let nextIdx = 0;
        let nextDist = Infinity;
        remainingDropoffs.forEach((r, idx) => {
            const d = getDistanceM(lastLocation, r.destination);
            if (d < nextDist) {
                nextDist = d;
                nextIdx = idx;
            }
        });
        const next = remainingDropoffs.splice(nextIdx, 1)[0];
        orderedStops.push({ type: 'dropoff', requestId: next.id, location: next.destination });
        lastLocation = next.destination;
    }

    return orderedStops;
}
