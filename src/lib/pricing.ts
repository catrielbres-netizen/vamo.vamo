
// lib/pricing.ts

export type ServiceType = "premium" | "privado" | "express";

// --- Tarifas Diurnas (basadas en Premium) ---
const DAY_BASE_FARE = 1400; // Bajada de bandera para Premium
const DAY_PRICE_PER_100M = 152;
const DAY_WAITING_PER_MIN = 220;

// --- Tarifas Nocturnas (basadas en Premium) ---
// Se mantiene la proporción para la tarifa nocturna
const NIGHT_BASE_FARE = 1652; 
const NIGHT_PRICE_PER_100M = 189;
const NIGHT_WAITING_PER_MIN = 277;

export function calculateFare({
  distanceMeters,
  waitingMinutes = 0,
  service,
  isNight = false,
}: {
  distanceMeters: number;
  waitingMinutes?: number;
  service: ServiceType;
  isNight?: boolean;
}) {
  // Selecciona las tarifas base según si es de noche o no
  const baseFare = isNight ? NIGHT_BASE_FARE : DAY_BASE_FARE;
  const pricePer100m = isNight ? NIGHT_PRICE_PER_100M : DAY_PRICE_PER_100M;
  const waitingPerMin = isNight ? NIGHT_WAITING_PER_MIN : DAY_WAITING_PER_MIN;

  // Calcula el costo por distancia y espera para la tarifa Premium
  const distanceCost = Math.ceil(distanceMeters / 100) * pricePer100m;
  const waitCost = waitingMinutes * waitingPerMin;

  // El total para un viaje premium es la suma de la bajada de bandera, distancia y espera
  let totalPremium = baseFare + distanceCost + waitCost;

  let finalTotal;

  // Aplica los descuentos para otros servicios
  switch (service) {
    case "privado":
      finalTotal = totalPremium * 0.90; // 10% de descuento
      break;
    case "express":
      finalTotal = totalPremium * 0.75; // 25% de descuento
      break;
    case "premium":
    default:
      finalTotal = totalPremium;
      break;
  }

  return Math.round(finalTotal);
}

// Devuelve la tasa de comisión basada en la cantidad de viajes completados
export const getCommissionRate = (rideCount: number): number => {
    if (rideCount < 30) return 0.08; // 8%
    if (rideCount < 50) return 0.06; // 6%
    return 0.04; // 4%
};


// Exportamos las constantes de espera para usarlas en otros componentes si es necesario
export const WAITING_PER_MIN_DAY = DAY_WAITING_PER_MIN;
export const WAITING_PER_MIN_NIGHT = NIGHT_WAITING_PER_MIN;
export const WAITING_PER_MIN = DAY_WAITING_PER_MIN; // Mantenemos una exportación genérica para compatibilidad
