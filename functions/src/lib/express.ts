
import { UserProfile, ExpressConfig, ExpressBudget } from "../types";

export interface ExpressDiscountResult {
  allowed: boolean;
  unlockLevel: number;
  isDiscountApplied: boolean;
  
  // Pricing breakdown (PRO)
  originalTotal: number;
  discountAmount: number;
  discountPercent: number;
  passengerPaysTotal: number;
  driverReceivesTotal: number;
  compensationAmount: number;
  
  discountType: 'bonus10' | 'bonus20' | 'welcome' | null;
  discountFundedBy: 'vamo' | null;
  reason?: string;
}

/**
 * Calculates Express eligibility and discount amounts for a passenger ride.
 * This is the source of truth for Express pricing in the backend.
 */
export function calculateExpressDiscount(
  passengerProfile: UserProfile,
  estimatedTotal: number,
  config: ExpressConfig,
  budget: ExpressBudget
): ExpressDiscountResult {
  const unlockLevel = passengerProfile.expressAccess?.unlockLevel || 0;
  
  const result: ExpressDiscountResult = {
    allowed: false,
    unlockLevel,
    isDiscountApplied: false,
    originalTotal: estimatedTotal,
    discountAmount: 0,
    discountPercent: 0,
    passengerPaysTotal: estimatedTotal,
    driverReceivesTotal: estimatedTotal,
    compensationAmount: 0,
    discountType: null,
    discountFundedBy: null
  };

  // 1. Global Feature Flag
  if (!config.isExpressUnlockEnabled) {
    result.reason = "El servicio Express está temporalmente desactivado.";
    return result;
  }

  // 2. Level Eligibility (PRO Rules)
  // Level 1: > $15,000 only.
  // Level 2 & 3: All rides.
  let isEligibleForExpress = false;
  if (unlockLevel === 1) {
    if (estimatedTotal >= config.level1MinFare) {
      isEligibleForExpress = true;
    } else {
      result.reason = `Nivel 1 requiere un viaje mínimo de $${config.level1MinFare.toLocaleString()} para usar Express.`;
    }
  } else if (unlockLevel >= 2) {
    isEligibleForExpress = true;
  } else {
    result.reason = "No tenés el nivel necesario para viajes Express.";
  }

  if (!isEligibleForExpress) return result;

  result.allowed = true;

  // 3. Discount Application (Bonus)
  if (!config.isExpressBonusEnabled) return result;

  // 4. Budget Check (Strict)
  const isDailyBudgetExceeded = budget.dailyUsed >= config.dailyBudgetCap;
  const isWeeklyBudgetExceeded = budget.weeklyUsed >= config.weeklyBudgetCap;

  if (isDailyBudgetExceeded || isWeeklyBudgetExceeded) {
    result.reason = "Presupuesto de descuentos agotado por hoy.";
    return result; // Allowed for Express but NO discount
  }

  const access = passengerProfile.expressAccess;
  if (!access) return result;

  let appliedPercent = 0;
  let appliedCap = 0;
  let type: 'bonus10' | 'bonus20' | null = null;

  // Check bonuses by level priority
  if (unlockLevel >= 3 && access.bonus20Available > 0) {
    appliedPercent = config.bonus20Percent;
    appliedCap = config.bonus20Cap;
    type = 'bonus20';
  } else if (unlockLevel >= 2 && access.bonus10Available > 0) {
    appliedPercent = config.bonus10Percent;
    appliedCap = config.bonus10Cap;
    type = 'bonus10';
  }

  if (appliedPercent > 0) {
    const rawDiscount = (estimatedTotal * appliedPercent) / 100;
    const finalDiscount = Math.floor(Math.min(rawDiscount, appliedCap));

    if (finalDiscount > 0) {
      result.isDiscountApplied = true;
      result.discountAmount = finalDiscount;
      result.discountPercent = appliedPercent;
      result.discountType = type;
      result.discountFundedBy = 'vamo';
      result.compensationAmount = finalDiscount;
      result.passengerPaysTotal = estimatedTotal - finalDiscount;
      // Driver receives total is already estimatedTotal
    }
  }

  return result;
}
