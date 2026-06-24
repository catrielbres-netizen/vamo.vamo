
import { PricingConfig, ServiceType, DynamicPricingConfig, DynamicPricingSnapshot } from '../types';
import { Timestamp } from "firebase-admin/firestore";
import { featureFlags } from '../config/features';

export interface PricingInput {
  distanceKm: number;
  durationMin: number;
  waitingSeconds?: number;
  serviceType: ServiceType;
  isNight: boolean;
  isUrgent?: boolean;
  isSpecialVerified?: boolean;
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
  expressDiscountAmount?: number;
  expressDiscountPercent?: number;
}

export function calculateRidePrice(
  input: PricingInput,
  config: PricingConfig,
  dynamicConfig?: DynamicPricingConfig,
  cityKey?: string,
  planBPricingConfig?: any
): { total: number, breakdown: PricingBreakdown, dynamicSnapshot?: DynamicPricingSnapshot } {

  if (featureFlags.vamoParticularModeEnabled && featureFlags.simpleGlobalFareEnabled && input.serviceType !== 'professional') {
    const PLAN_B_BASE_FARE = planBPricingConfig?.baseFare ?? 1000;
    const PLAN_B_PRICE_PER_100M = planBPricingConfig?.pricePer100m ?? 100;
    const PLAN_B_WAITING_PER_MIN = planBPricingConfig?.pricePerMinute ?? 150; // default for Plan B
    const PLAN_B_MINIMUM_FARE = planBPricingConfig?.minimumFare ?? 1200;

    const distanceMeters = input.distanceKm * 1000;
    const distanceUnits = Math.ceil(distanceMeters / 100);
    const distanceFare = distanceUnits * PLAN_B_PRICE_PER_100M;

    const FREE_WAIT_SECONDS = 300;
    const totalWaitSeconds = input.waitingSeconds || 0;
    const billableWaitSeconds = Math.max(0, totalWaitSeconds - FREE_WAIT_SECONDS);
    const billableWaitMinutes = Math.ceil(billableWaitSeconds / 60);
    const waitingFare = billableWaitMinutes * PLAN_B_WAITING_PER_MIN;

    const subtotal = PLAN_B_BASE_FARE + distanceFare + waitingFare;
    let finalFare = Math.round(subtotal);
    
    let minimumFareApplied = false;
    if (finalFare < PLAN_B_MINIMUM_FARE) {
      finalFare = PLAN_B_MINIMUM_FARE;
      minimumFareApplied = true;
    }

    return {
      total: finalFare,
      breakdown: {
        baseFare: PLAN_B_BASE_FARE,
        distanceFare,
        timeFare: 0,
        waitingFare,
        subtotal: subtotal,
        serviceMultiplier: 1.0,
        urgentCharge: 0,
        assistanceFee: 0,
        minimumFareApplied: minimumFareApplied,
        total: finalFare
      }
    };
  }

  const baseFare = input.isNight ? config.NIGHT_BASE_FARE : config.DAY_BASE_FARE;
  const pricePer100m = input.isNight ? config.NIGHT_PRICE_PER_100M : config.DAY_PRICE_PER_100M;
  const waitingPerMin = input.isNight ? config.NIGHT_WAITING_PER_MIN : config.DAY_WAITING_PER_MIN;

  // 1. Distance Fare: Math.ceil(meters / 100) * pricePer100m
  const distanceMeters = input.distanceKm * 1000;
  const distanceUnits = Math.ceil(distanceMeters / 100);
  const distanceFare = distanceUnits * pricePer100m;

  // 2. Waiting Fare: Math.ceil(seconds / 60) * waitingPerMin
  const FREE_WAIT_SECONDS = 300;
  const totalWaitSeconds = input.waitingSeconds || 0;
  const billableWaitSeconds = Math.max(0, totalWaitSeconds - FREE_WAIT_SECONDS);
  const billableWaitMinutes = Math.ceil(billableWaitSeconds / 60);
  const waitingFare = billableWaitMinutes * waitingPerMin;

  // 3. Subtotal Municipal (Top Official Fare)
  const subtotalMunicipal = (baseFare || 0) + (distanceFare || 0) + (waitingFare || 0);
  
  // VamO Standard Rounding: Exact integer value
  const municipalTotal = Math.round(subtotalMunicipal);

  // 4. Dynamic Pricing Discount (VamO PRO)
  let finalPassengerFare = municipalTotal;
  let dynamicSnapshot: DynamicPricingSnapshot | undefined = undefined;

  if (dynamicConfig?.enabled && input.serviceType !== 'shared' && municipalTotal > 10000) {
    // CLAMP rules (0-30%)
    const maxAllowed = Math.min(30, dynamicConfig.maxDiscountPercent || 30);
    const rawDiscountPercent = dynamicConfig.currentDiscountPercent || 0;
    const effectiveDiscountPercent = Math.min(maxAllowed, Math.max(0, rawDiscountPercent));

    if (effectiveDiscountPercent > 0) {
      const rawDiscountAmount = (municipalTotal * effectiveDiscountPercent) / 100;
      const fareAfterRawDiscount = municipalTotal - rawDiscountAmount;
      
      // Subtract discount and round AGAIN to keep UX consistent
      finalPassengerFare = Math.round(fareAfterRawDiscount);
      
      // Ensure we never EXCEED municipal fare and ensure we never go below 70% of municipal fare
      const minPossibleFare = Math.round(municipalTotal * 0.70);
      finalPassengerFare = Math.min(municipalTotal, Math.max(minPossibleFare, finalPassengerFare));

      const appliedDiscountAmount = municipalTotal - finalPassengerFare;
      const appliedDiscountPercent = municipalTotal > 0 ? (appliedDiscountAmount / municipalTotal) * 100 : 0;

      dynamicSnapshot = {
        applied: true,
        municipalBaseFare: municipalTotal,
        configuredDiscountPercent: effectiveDiscountPercent,
        rawDiscountAmount: rawDiscountAmount,
        fareAfterRawDiscount: fareAfterRawDiscount,
        finalPassengerFare: finalPassengerFare,
        appliedDiscountAmount: appliedDiscountAmount,
        appliedDiscountPercent: parseFloat(appliedDiscountPercent.toFixed(2)),
        maxDiscountPercent: maxAllowed,
        reasonCodes: dynamicConfig.reasonCodes || [],
        algorithmMode: dynamicConfig.algorithmMode || 'manual',
        calculatedAt: Timestamp.now(),
        cityKey: cityKey || 'unknown',
        source: 'backend'
      };
    } else {
        // Even if enabled, if percent is 0, we don't apply it
        dynamicSnapshot = {
            applied: false,
            municipalBaseFare: municipalTotal,
            configuredDiscountPercent: effectiveDiscountPercent,
            rawDiscountAmount: 0,
            fareAfterRawDiscount: municipalTotal,
            finalPassengerFare: municipalTotal,
            appliedDiscountAmount: 0,
            appliedDiscountPercent: 0,
            maxDiscountPercent: maxAllowed,
            reasonCodes: dynamicConfig.reasonCodes || [],
            algorithmMode: dynamicConfig.algorithmMode || 'manual',
            calculatedAt: Timestamp.now(),
            cityKey: cityKey || 'unknown',
            source: 'backend'
        };
    }
  }

  // [VamO PRO] Special Verification Discount (Retired/Disabled - 10%)
  if (input.isSpecialVerified && input.serviceType !== 'shared') {
    const specialDiscountAmount = finalPassengerFare * 0.10;
    finalPassengerFare = Math.round(finalPassengerFare - specialDiscountAmount);
    
    if (dynamicSnapshot) {
        dynamicSnapshot.isSpecialVerifiedDiscountApplied = true;
        dynamicSnapshot.specialDiscountAmount = specialDiscountAmount;
    }
  }

  // [AUDIT] Minimum Fare Guard (Applied to final fare)
  const minFare = (config as any).MINIMUM_FARE || 0;
  let minimumFareApplied = false;

  if (finalPassengerFare < minFare) {
    finalPassengerFare = minFare;
    minimumFareApplied = true;
  }

  return {
    total: finalPassengerFare,
    breakdown: {
      baseFare,
      distanceFare,
      timeFare: 0, 
      waitingFare,
      subtotal: municipalTotal, // Original municipal subtotal
      serviceMultiplier: 1.0,
      urgentCharge: 0,
      assistanceFee: 0,
      minimumFareApplied,
      total: finalPassengerFare
    },
    dynamicSnapshot
  };
}
