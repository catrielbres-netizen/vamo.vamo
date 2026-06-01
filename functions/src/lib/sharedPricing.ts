
/**
 * VamO Compartido V1 - Pricing Logic
 */

export interface SharedPricingInput {
    individualFareReference: number;
    confirmedPassengerCount: number;
    cityKey: string;
}

export interface SharedPricingResult {
    sharedFarePerPassenger: number;
    rawSharedFare: number;
    sharedPaymentPercent: number;
    totalSharedFare: number;
    passengerSavingAmount: number;
    passengerSavingPercent: number;
    driverBenefitAmount: number;
    driverBenefitPercent: number;
}

/**
 * Calcula la tarifa compartida por pasajero y el beneficio total para el conductor.
 * Reglas V1:
 * - 2 pasajeros: 0.68x
 * - 3 pasajeros: 0.60x
 * - 4 pasajeros: 0.55x
 */
export function calculateSharedPricing(input: SharedPricingInput): SharedPricingResult {
    const { individualFareReference, confirmedPassengerCount } = input;

    if (confirmedPassengerCount < 2) {
        return {
            sharedFarePerPassenger: individualFareReference,
            rawSharedFare: individualFareReference,
            sharedPaymentPercent: 1.0,
            totalSharedFare: individualFareReference,
            passengerSavingAmount: 0,
            passengerSavingPercent: 0,
            driverBenefitAmount: 0,
            driverBenefitPercent: 0
        };
    }

    let sharedPaymentPercent = 1.0;
    if (confirmedPassengerCount === 2) sharedPaymentPercent = 0.60;
    else if (confirmedPassengerCount === 3) sharedPaymentPercent = 0.55;
    else if (confirmedPassengerCount >= 4) sharedPaymentPercent = 0.50;

    const rawSharedFare = individualFareReference * sharedPaymentPercent;
    let sharedFarePerPassenger = Math.round(rawSharedFare);
    
    if (sharedFarePerPassenger >= individualFareReference && individualFareReference > 0) {
        sharedFarePerPassenger = Math.max(0, individualFareReference - 1);
    }
    
    const totalSharedFare = sharedFarePerPassenger * confirmedPassengerCount;

    const passengerSavingAmount = individualFareReference - sharedFarePerPassenger;
    const passengerSavingPercent = Math.round(100 - (sharedPaymentPercent * 100));

    const driverBenefitAmount = totalSharedFare - individualFareReference;
    const driverBenefitPercent = individualFareReference > 0 ? (driverBenefitAmount / individualFareReference) : 0;

    // Validaciones estrictas Fase 2B
    if (sharedFarePerPassenger >= individualFareReference && individualFareReference > 0) {
        throw new Error("SH_PRICING_INVALID: La tarifa compartida debe ser menor a la individual.");
    }
    if (totalSharedFare <= individualFareReference && confirmedPassengerCount >= 2 && individualFareReference > 0) {
        throw new Error("SH_PRICING_INVALID: El total compartido debe ser mayor a la tarifa individual.");
    }

    return {
        sharedFarePerPassenger,
        rawSharedFare,
        sharedPaymentPercent,
        totalSharedFare,
        passengerSavingAmount,
        passengerSavingPercent,
        driverBenefitAmount,
        driverBenefitPercent
    };
}
