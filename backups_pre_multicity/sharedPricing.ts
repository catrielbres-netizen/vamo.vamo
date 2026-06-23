
/**
 * VamO Compartido V1 - Pricing Logic
 *
 * Reglas de asientos V2:
 * ─────────────────────────────────────────────────────────────
 *  El precio base compartido depende del total de asientos ocupados en el grupo.
 *  El segundo asiento del MISMO usuario (acompañante) cuesta solo +10% extra
 *  sobre ese precio base — nunca se multiplica por 2.
 *
 *  Ejemplos con tarifa individual = $10.000:
 *    totalOccupiedSeats=2, requestSeatCount=1 → $10.000 × 0.60         = $6.000
 *    totalOccupiedSeats=2, requestSeatCount=2 → $10.000 × 0.60 × 1.10  = $6.600
 *    totalOccupiedSeats=4, requestSeatCount=1 → $10.000 × 0.50         = $5.000
 *    totalOccupiedSeats=4, requestSeatCount=2 → $10.000 × 0.50 × 1.10  = $5.500
 *
 *  Así el pasajero siempre ahorra (< tarifa individual) y el conductor gana más.
 * ─────────────────────────────────────────────────────────────
 */

export interface SharedPricingInput {
    individualFareReference: number;
    totalOccupiedSeats: number;
    requestSeatCount: number;
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
 * Calcula la tarifa compartida para un usuario dado el total de asientos ocupados
 * en el grupo y la cantidad de asientos que pide ese usuario.
 */
export function calculateSharedPricing(input: SharedPricingInput): SharedPricingResult {
    const { individualFareReference, totalOccupiedSeats, requestSeatCount = 1 } = input;

    // ── Caso especial: grupo aún sin segundo pasajero (formando) ──────────────
    if (totalOccupiedSeats < 2) {
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

    // ── Factor de descuento base según asientos totales del grupo ─────────────
    let sharedPaymentPercent = 1.0;
    if (totalOccupiedSeats === 2)      sharedPaymentPercent = 0.60;
    else if (totalOccupiedSeats === 3) sharedPaymentPercent = 0.55;
    else if (totalOccupiedSeats >= 4)  sharedPaymentPercent = 0.50;

    // ── Precio base para 1 asiento ────────────────────────────────────────────
    const baseFareOneSeat = individualFareReference * sharedPaymentPercent;

    // ── Multiplicador por asientos del usuario ────────────────────────────────
    // 1 asiento → ×1.00   (precio compartido estándar)
    // 2 asientos → ×1.10  (acompañante: +10% sobre el precio compartido base)
    // Nunca × 2 para evitar que salga más caro que el viaje individual.
    const seatMultiplier = requestSeatCount >= 2 ? 1.10 : 1.00;

    const rawSharedFare = baseFareOneSeat * seatMultiplier;

    // Redondear a múltiplos de $100 para mostrar precios limpios
    const sharedFarePerPassenger = Math.round(rawSharedFare / 100) * 100;

    // ── Guardia: nunca debe superar la tarifa individual ──────────────────────
    if (sharedFarePerPassenger >= individualFareReference && individualFareReference > 0) {
        // Fallback seguro: 99% del individual
        const fallback = Math.max(0, individualFareReference - 100);
        return {
            sharedFarePerPassenger: fallback,
            rawSharedFare: fallback,
            sharedPaymentPercent,
            totalSharedFare: fallback,
            passengerSavingAmount: individualFareReference - fallback,
            passengerSavingPercent: Math.round((1 - sharedPaymentPercent) * 100),
            driverBenefitAmount: fallback - individualFareReference,
            driverBenefitPercent: 0
        };
    }

    const passengerSavingAmount  = individualFareReference - sharedFarePerPassenger;
    const passengerSavingPercent = Math.round((passengerSavingAmount / individualFareReference) * 100);
    const driverBenefitAmount    = sharedFarePerPassenger - individualFareReference;
    const driverBenefitPercent   = individualFareReference > 0 ? driverBenefitAmount / individualFareReference : 0;

    return {
        sharedFarePerPassenger,
        rawSharedFare,
        sharedPaymentPercent,
        totalSharedFare: sharedFarePerPassenger,
        passengerSavingAmount,
        passengerSavingPercent,
        driverBenefitAmount,
        driverBenefitPercent
    };
}
