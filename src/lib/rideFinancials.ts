/**
 * [VamO PRO] RIDE FINANCIALS — Single Source of Truth
 * 
 * This helper ensures that all frontend components (driver and passenger)
 * consume financial data exactly the same way, preventing the "total-as-cash" bug.
 */

export type RideFinancialSnapshot = {
  totalFare: number;
  originalTotal: number;
  discountAmount: number;
  vamoSubsidyAmount: number;
  discountReason?: string;
  passengerFinalTotal: number;
  driverRecognizedTotal: number;
  driverNetEarnings: number;
  driverWalletCredit: number;
  commissionAmount: number;
  vamoAmount: number;
  municipalAmount: number;
  taxiAssociationAmount: number;
  remisAssociationAmount: number;
  totalAssociationsAmount: number;
  walletCoveredAmount: number;
  cashToCollect: number;
  dynamicApplied: boolean;
  municipalBaseFare: number;
  dynamicDiscountAmount: number;
  source: 'completedRide' | 'offerBreakdown' | 'none';
  hasBreakdown: boolean;
};

export function getRideFinancialSnapshot(ride: any): RideFinancialSnapshot {
  if (!ride) {
    return {
      totalFare: 0,
      originalTotal: 0,
      discountAmount: 0,
      vamoSubsidyAmount: 0,
      passengerFinalTotal: 0,
      driverRecognizedTotal: 0,
      driverNetEarnings: 0,
      driverWalletCredit: 0,
      commissionAmount: 0,
      vamoAmount: 0,
      municipalAmount: 0,
      taxiAssociationAmount: 0,
      remisAssociationAmount: 0,
      totalAssociationsAmount: 0,
      walletCoveredAmount: 0,
      cashToCollect: 0,
      dynamicApplied: false,
      municipalBaseFare: 0,
      dynamicDiscountAmount: 0,
      source: 'none',
      hasBreakdown: false,
    };
  }

  // [SOURCE OF TRUTH] Prefer completedRide (Final) > pricing (Estimated)
  const completed = ride.completedRide;
  const pricing = ride.pricing;
  
  // totalFare is the gross amount the driver should receive before commissions.
  const totalFare = Number(completed?.totalFare ?? pricing?.total ?? pricing?.estimatedTotal ?? ride.estimatedTotal ?? 0);

  // originalTotal is totalFare + any discount applied
  const discountAmount = Number(completed?.discountAmount ?? pricing?.expressDiscountAmount ?? ride.discountAmount ?? 0);
  const originalTotal = Number(completed?.originalTotal ?? (totalFare + discountAmount));

  const vamoSubsidyAmount = Number(completed?.vamoSubsidyAmount ?? pricing?.vamoSubsidyAmount ?? ride.vamoSubsidyAmount ?? 0);
  const discountReason = completed?.discountReason ?? pricing?.discountReason ?? (pricing?.hasPassengerExpressBenefit ? 'Beneficio VamO' : '');
  
  const walletCoveredAmount = Number(completed?.walletCoveredAmount ?? pricing?.walletCoveredAmount ?? ride.walletCoveredAmount ?? 0);
  const cashToCollect = Number(completed?.cashToCollect ?? pricing?.cashToCollect ?? ride.cashToCollect ?? 0);
  
  const dynamic = pricing?.dynamic || ride.dynamic || null;
  const dynamicApplied = dynamic?.applied ?? false;
  const municipalBaseFare = Number(dynamic?.municipalBaseFare ?? 0);
  const dynamicDiscountAmount = Number(dynamic?.appliedDiscountAmount ?? 0);

  const commissionAmount = Number(completed?.commissionAmount ?? pricing?.commissionAmount ?? ride.commissionAmount ?? 0);
  const vamoAmount = Number(completed?.vamoAmount ?? pricing?.vamoAmount ?? ride.vamoAmount ?? 0);
  const municipalAmount = Number(completed?.municipalAmount ?? pricing?.municipalAmount ?? ride.municipalAmount ?? 0);
  const taxiAssociationAmount = Number(completed?.taxiAssociationAmount ?? pricing?.taxiAssociationAmount ?? ride.taxiAssociationAmount ?? 0);
  const remisAssociationAmount = Number(completed?.remisAssociationAmount ?? pricing?.remisAssociationAmount ?? ride.remisAssociationAmount ?? 0);
  const totalAssociationsAmount = Number(completed?.totalAssociationsAmount ?? pricing?.totalAssociationsAmount ?? ride.totalAssociationsAmount ?? 0);

  const passengerFinalTotal = Number(completed?.passengerPaysTotal ?? (totalFare - discountAmount));
  const driverRecognizedTotal = totalFare;
  const driverNetEarnings = Number(completed?.driverNetAmount ?? (totalFare - commissionAmount));
  
  // driverWalletCredit is what actually hits the digital wallet (Wallet paid by passenger + VamO subsidies - Commissions)
  const driverWalletCredit = Number(completed?.driverWalletCredit ?? (walletCoveredAmount + vamoSubsidyAmount - commissionAmount));

  return {
    totalFare,
    originalTotal,
    discountAmount,
    vamoSubsidyAmount,
    discountReason,
    passengerFinalTotal,
    driverRecognizedTotal,
    driverNetEarnings,
    driverWalletCredit,
    commissionAmount,
    vamoAmount,
    municipalAmount,
    taxiAssociationAmount,
    remisAssociationAmount,
    totalAssociationsAmount,
    walletCoveredAmount,
    cashToCollect,
    dynamicApplied,
    municipalBaseFare,
    dynamicDiscountAmount,
    source: completed ? 'completedRide' : 'none',
    hasBreakdown: !!(completed || pricing),
  };
}

/**
 * Validates if the snapshot is complete for accounting purposes.
 * Returns false if cash and wallet are both zero but totalFare exists.
 */
export function isAccountingComplete(snapshot: RideFinancialSnapshot): boolean {
    const passengerOwes = snapshot.totalFare - snapshot.discountAmount;
    if (passengerOwes > 0 && snapshot.cashToCollect === 0 && snapshot.walletCoveredAmount === 0) {
        return false;
    }
    return snapshot.hasBreakdown;
}
/**
 * [VamO PRO] DRIVER PRICING DISPLAY MASK
 * Muestra al conductor su ganancia neta pero preserva el total a cobrar.
 */
export function getDriverDisplayFinancials(snapshot: RideFinancialSnapshot): RideFinancialSnapshot {
    return snapshot; // Identity function, UI will handle the explicit display
}
