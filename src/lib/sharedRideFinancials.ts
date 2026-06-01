import { Ride, SharedRideRequest } from './types';

export type SharedRideFinancialSnapshot = {
    grossCash: number;
    commissionAmount: number;
    municipalAmount: number;
    vamoNetAmount: number;
    driverNetAfterCommission: number;
    netBalanceImpact: number;
    commissionRate: number;
    municipalRate: number;
    passengerBreakdown: any[];
    settledAt: any;
    currency: string;
    totalIndividualFare?: number;
    totalPassengerSavings?: number;
};

export function getSharedDriverFinancialSnapshot(ride: Ride): SharedRideFinancialSnapshot | null {
    const summary = ride.sharedDriverReceiptSummary || ride.sharedFinancialSummary;
    if (!summary) return null;

    return {
        grossCash: summary.grossSharedCash || 0,
        commissionAmount: summary.totalCommissionAmount || 0,
        municipalAmount: summary.municipalAmount || 0,
        vamoNetAmount: summary.vamoNetAmount || 0,
        driverNetAfterCommission: summary.driverNetAfterCommission || 0,
        netBalanceImpact: -(summary.totalCommissionAmount || 0),
        commissionRate: summary.commissionRate || 0,
        municipalRate: summary.municipalRate || 0,
        passengerBreakdown: summary.passengerBreakdown || [],
        settledAt: summary.settledAt,
        currency: summary.currency || "ARS",
        totalIndividualFare: summary.totalIndividualFare || 0,
        totalPassengerSavings: summary.totalPassengerSavings || 0
    };
}

export type SharedPassengerFinancialSnapshot = {
    farePaid: number;
    individualFareReference: number;
    sharedFareRaw?: number;
    sharedPaymentPercent?: number;
    sharedPassengerCount?: number;
    savingsAmount: number;
    savingsPercent: number;
    paymentMethod: string;
    completedAt: any;
    settledAt: any;
    isShared: boolean;
    status: string;
    isFinancialReceipt: boolean;
    reason?: string;
};

export function getSharedPassengerFinancialSnapshot(request: SharedRideRequest): SharedPassengerFinancialSnapshot | null {
    if (!request) return null;

    // Recibo financiero exitoso
    if (request.passengerReceipt) {
        const r = request.passengerReceipt;
        return {
            farePaid: r.farePaid || 0,
            individualFareReference: r.individualFareReference || 0,
            sharedFareRaw: (r as any).sharedFareRaw,
            sharedPaymentPercent: (r as any).sharedPaymentPercent,
            sharedPassengerCount: (r as any).sharedPassengerCount,
            savingsAmount: r.savingsAmount || 0,
            savingsPercent: r.savingsPercent || 0,
            paymentMethod: r.paymentMethod || 'cash',
            completedAt: r.completedAt,
            settledAt: r.settledAt,
            isShared: true,
            status: r.status,
            isFinancialReceipt: true
        };
    }

    // Recibo operativo (no_show, etc)
    if (request.operationalReceipt) {
        const o = request.operationalReceipt;
        return {
            farePaid: 0,
            individualFareReference: request.individualFareReference || 0,
            savingsAmount: 0,
            savingsPercent: 0,
            paymentMethod: 'cash',
            completedAt: null,
            settledAt: null,
            isShared: true,
            status: o.status,
            isFinancialReceipt: false,
            reason: o.reason
        };
    }

    return null;
}
