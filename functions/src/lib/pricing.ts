import { PricingConfig, ServiceType } from '../types';

export interface PricingInput {
  distanceKm: number;
  durationMin: number;
  waitingSeconds?: number;
  serviceType: ServiceType;
  isNight: boolean;
  isUrgent?: boolean;
}

export interface PricingBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  waitingFare: number;
  subtotal: number;
  serviceMultiplier: number;
  urgentCharge: number;
  assistanceFee: number;
  minimumFareApplied: boolean;
  total: number;
}

export function calculateRidePrice(
  input: PricingInput,
  config: PricingConfig
): { total: number, breakdown: PricingBreakdown } {

  const baseFare = input.isNight ? config.NIGHT_BASE_FARE : config.DAY_BASE_FARE;
  const factor = (config as any)._pricePerKmFactor ?? 10;
  const pricePerKm = (input.isNight ? config.NIGHT_PRICE_PER_100M : config.DAY_PRICE_PER_100M) * factor;
  const waitingPerMin = input.isNight ? config.NIGHT_WAITING_PER_MIN : config.DAY_WAITING_PER_MIN;

  // Use dynamically from config if defined, else 0
  const timePerMin = (config as any).DAY_PRICE_PER_MIN
    ? (input.isNight ? (config as any).NIGHT_PRICE_PER_MIN : (config as any).DAY_PRICE_PER_MIN)
    : 0;

  const minFare = (config as any).MINIMUM_FARE || 0;

  const distanceFare = input.distanceKm * pricePerKm;
  const timeFare = input.durationMin * timePerMin;

  // --- Wait Logic (Bloque 3) ---
  const FREE_WAIT_SECONDS = 300;
  const totalWaitSeconds = input.waitingSeconds || 0;
  const billableWaitSeconds = Math.max(0, totalWaitSeconds - FREE_WAIT_SECONDS);
  const billableWaitMinutes = Math.ceil(billableWaitSeconds / 60);
  const waitingFare = billableWaitMinutes * waitingPerMin;

  const subtotal = baseFare + distanceFare + timeFare + waitingFare;

  let serviceMultiplier = 1.0;
  if (input.serviceType === 'express') {
    serviceMultiplier = 0.90; // 10% discount
  } else if (input.serviceType === 'premium') {
    serviceMultiplier = 1.0;
  }

  const urgentCharge = input.isUrgent ? 500 : 0;

  // [Vamo PRO v1.3] El aporte al fondo ahora es interno a la comisión. 
  // No se suma como cargo extra al pasajero para evitar fricción visual.
  const assistanceFee = 0;

  let totalExact = (subtotal * serviceMultiplier) + urgentCharge;

  let minimumFareApplied = false;
  if (totalExact < minFare) {
    totalExact = minFare;
    minimumFareApplied = true;
  }

  // Redondear a lo múltiplo de 50 más cercano (o simplemente redondear entero si se prefiere)
  const totalFare = Math.round(totalExact);

  return {
    total: totalFare,
    breakdown: {
      baseFare: Math.round(baseFare),
      distanceFare: Math.round(distanceFare),
      timeFare: Math.round(timeFare),
      waitingFare: Math.round(waitingFare),
      subtotal: Math.round(subtotal),
      serviceMultiplier,
      urgentCharge,
      assistanceFee,
      minimumFareApplied,
      total: totalFare
    }
  };
}
