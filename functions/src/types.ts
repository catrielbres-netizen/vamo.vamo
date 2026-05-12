import { FieldValue, Timestamp } from "firebase-admin/firestore";

// src/functions/src/types.ts
// This file is intended for Cloud Functions and uses the admin SDK types.

import * as admin from 'firebase-admin';

export type FirestoreTimestamp = Timestamp;
export type FirestoreFieldValue = FieldValue;

export type ServiceType = "professional" | "express";
export type VehicleType = "taxi" | "remis";

export type Role = "admin" | "driver" | "passenger" | "admin_municipal" | "operator_municipal" | "treasury_municipal" | "auditor_municipal" | "traffic_municipal";

export type RideStatus =
    | "scheduled"
    | "searching"
    | "driver_assigned"
    | "driver_arrived"
    | "in_progress"
    | "paused"
    | "completed"
    | "cancelled";

export type VerificationStatus = "unverified" | "pending_review" | "approved" | "rejected";
export type DocumentStatus = "valid" | "expired" | "pending_review" | "rejected";
export type MunicipalStatus = "active" | "approved" | "suspended" | "expired" | "pending_review" | "municipal_approved" | "municipal_observed" | "pending_municipal_review";

export type CityStatus = "invited" | "onboarding" | "active" | "suspended";
export type RegistrationStatus = 'creating' | 'pending_profile' | 'active' | 'corrupted';

export type AuditLogAction =
  | "driver_approved"
  | "driver_rejected"
  | "ride_cancelled_by_admin"
  | "ride_marked_as_audited"
  | "ride_flagged_by_ai"
  | "platform_credit_adjusted"
  | "driver_suspended"
  | "driver_unsuspended"
  | "municipal_driver_status_change";

export const isPanicButtonVisible = (status: RideStatus): boolean => {
    return status === 'in_progress' || status === 'paused';
};

export function normalizeCityKey(city: string): string {
    return city
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function buildMunicipalCode(cityKey: string, sequence: number): string {
    const prefix = cityKey.substring(0, 2).toUpperCase();
    const seq = sequence.toString().padStart(5, '0');
    return `${prefix}-${seq}`;
}

export type DriverStatus = "offline" | "inactive" | "online" | "in_ride";
export type DriverLevel = "bronce" | "plata" | "oro";
export type DriverSubtype = 'professional' | 'express';

export type MunicipalExpressStatus = 
  | 'pending_municipal_review'
  | 'municipal_observed'
  | 'municipal_approved'
  | 'active'
  | 'renewal_under_review'
  | 'suspended_expired_license'
  | 'suspended_expired_insurance'
  | 'suspended_expired_itv'
  | 'suspended_unpaid_canon'
  | 'suspended_by_municipality'
  | 'rejected_by_municipality';

export type MunicipalChecklistKey = 
  | 'dniFront'
  | 'dniBack'
  | 'driverLicense'
  | 'vehicleInsurance'
  | 'vehicleRegistrationCard'
  | 'criminalRecord'
  | 'municipalCanon'
  | 'disinfectionReceipt'
  | 'passengerCoverageInsurance';

export type DocItemStatus = 'pending' | 'submitted' | 'approved' | 'observed';
export type CanonStatus = 'paid' | 'overdue' | 'pending';

export type MunicipalDocItem = {
    status: DocItemStatus;
    submittedAt?: any;
    reviewedAt?: any;
    reviewedBy?: string | null;
    observation?: string | null;
    storageUrl?: string | null;
    documentExpiryDate?: any;
};

export type MunicipalChecklist = Record<MunicipalChecklistKey, MunicipalDocItem>;

export interface MunicipalProfile {
    driverId: string;
    driverName: string;
    driverPhone?: string;
    driverEmail?: string;
    municipalCode: string;
    municipalStatus: MunicipalExpressStatus;
    municipalObservation?: string;
    cityKey: string;
    city?: string;
    checklist: MunicipalChecklist;
    canonStatus?: CanonStatus;
    canonExpiry?: any;
    canonPaidAt?: any;
    canonPaidBy?: string;
    licenseExpiry?: any;
    insuranceExpiry?: any;
    itvExpiry?: any;
    backgroundCheckExpiry?: any;
    createdAt: any;
    updatedAt: any;
    municipalNotes?: string;
    vehiclePhotos?: {
      front?: string;
      back?: string;
      interior?: string;
    };
    enabledAt?: any;
    enabledBy?: string;
    observationGraceUntil?: any;
    lastTrafficRequest?: {
        documentType: MunicipalChecklistKey;
        requestedAt: any;
        requestedByName?: string;
        reason?: string;
        status: 'requested' | 'submitted' | 'resolved';
    };
    driverSubtype?: DriverSubtype;
    driverPreferences?: {
        acceptsExpress: boolean;
        acceptsDiscountedRides: boolean;
        acceptsPets: boolean;
    };
}

export interface MunicipalDocSubmission {
    driverId: string;
    municipalCode: string;
    cityKey: string;
    docType: MunicipalChecklistKey;
    storageUrl: string;
    uploadedAt: any;
    status: 'pending_review' | 'approved' | 'rejected';
    documentExpiryDate?: any;
    reviewedAt?: any;
    reviewedBy?: string;
    observation?: string;
}

export type MunicipalAuditAction = 
    | 'checklist_item_approved' 
    | 'checklist_item_observed' 
    | 'canon_marked_paid' 
    | 'canon_marked_overdue'
    | 'license_expiry_set'
    | 'insurance_expiry_set'
    | 'itv_expiry_set'
    | 'background_check_expiry_set'
    | 'canon_expiry_set'
    | 'observation_added'
    | 'driver_enabled'
    | 'driver_suspended_by_municipality'
    | 'driver_rejected'
    | 'renewal_approved'
    | 'renewal_rejected';

export interface Benefit {
    id: string;
    name: string;
    merchantName: string;
    description: string;
    type: 'combustible' | 'taller' | 'lavadero' | 'repuestos' | 'otros' | 'otro' | 'gastronomia';
    discountPercent: number;
    minLevel: DriverLevel;
    isActive: boolean;
    city?: string;
    address?: string;
    conditions?: string;
    limitDescription?: string;
    applicationMethod?: string;
    logoUrl?: string;
}

export interface PanicAlert {
    id: string;
    rideId: string;
    driverId: string;
    passengerId: string;
    location: {
        lat: number;
        lng: number;
    };
    triggeredByRole: 'passenger' | 'driver';
    triggeredByUserId?: string;
    rideStatus: string;
    resolved: boolean;
    resolvedAt?: any;
    resolvedBy?: string;
    cityKey?: string;
    createdAt: any;
}

export interface Place {
    address: string;
    lat: number;
    lng: number;
    city?: string;
    zoneName?: string;
}

export interface PaymentSnapshot {
  selectedPaymentMethod: "cash" | "wallet" | "automatic" | "vamo_pay" | "mixed";
  useWallet: boolean;
  finalPassengerFare: number;
  walletCoveredAmount: number;
  cashAmount: number;
  source: "backend";
  timestamp?: any;
}

export interface TrackingStats {
    totalPoints: number;
    validSegments: number;
    discardedSegments: number;
    maxSpeedDetected: number;
    distanceSource: string;
}

export interface CompletedRide {
    pricingVersion: number;
    calculationSource: string;
    distanceMeters: number;
    durationSeconds: number;
    waitingSeconds: number;
    baseFare: number;
    distanceFare: number;
    waitingFare: number;
    totalFare: number;
    baseCommissionRate: number;
    finalCommissionRate: number;
    commissionAmount: number;
    originalTotal?: number;
    discountAmount?: number;
    discountReason?: string;
    passengerFinalTotal?: number;
    vamoSubsidyAmount?: number;
    driverRecognizedTotal?: number;
    municipalFee?: number;
    municipalRate?: number;
    fapFee?: number;
    commissionRate?: number;
    walletCoveredAmount?: number;
    cashToCollect?: number;
    driverNetAmount?: number;
    trackingStats?: TrackingStats;
    extrasFare?: number;
    pointsAwarded?: number;
    calculatedAt?: any;
    fapEligible?: boolean;
    driverSubtype?: string;
    expressDiscountAmount?: number;
    creditCoveredAmount?: number;
    platformSubsidyAmount?: number;
    passengerPaysTotal?: number;
    vamoCommissionRate?: number;
    driverSubtypeSnapshot?: string;
    totalAmount?: number;
    municipalAmount?: number;
    vamoAmount?: number;
    driverEarnings?: number;
}

export interface RideChatMessage {
    id: string;
    rideId: string;
    senderId: string;
    senderRole: 'passenger' | 'driver' | 'admin';
    text: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    type: 'text' | 'system' | 'image';
    status: 'sent' | 'read' | 'failed';
}

export interface RideChatSummary {
    unreadCountPassenger: number;
    unreadCountDriver: number;
    lastMessageText?: string;
    lastMessageAt?: FirestoreTimestamp | FirestoreFieldValue;
    lastMessageSenderId?: string;
    chatAuditEligible?: boolean;
    chatEnabled: boolean;
}

export interface Ride {
    id?: string;
    passengerId: string;
    driverId?: string | null;
    vehicleOwnerId?: string;
    activeDriverId?: string;
    status: RideStatus;
    serviceType: ServiceType;
    city?: string;
    country?: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    scheduledAt?: FirestoreTimestamp | null;
    isScheduled?: boolean;
    scheduledMatchThresholdMinutes?: number;
    preNotified?: boolean;
    isEscalated?: boolean;
    failureAlertSent?: boolean;
    activatedAt?: FirestoreTimestamp | null;
    interestedDriverIds?: string[];
    interestedDriversCount?: number;
    lastInterestAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    driverAssignedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    arrivedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    startedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    completedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    origin: Place;
    destination: Place;
    paymentMethod?: 'cash' | 'wallet' | 'automatic';
    currentOfferedDriverId?: string | null;
    matchingExpiresAt?: FirestoreTimestamp | null;
    notifiedDrivers?: string[];
    matchingScoreBoost?: number;
    cityKey: string;
    matchingLog?: {
        attempt: number;
        timestamp: FirestoreTimestamp;
        driverId: string;
    }[];
    matchingAttempts?: number;
    operatingAreaId?: string;
    preferredDriverGender?: string;
    driverLocationAtAccept?: {
        lat: number;
        lng: number;
        timestamp: FirestoreTimestamp;
    } | null;
    passengerName?: string | null;
    driverName?: string | null;
    driverRating?: number | null;
    driverVehicle?: string | null;
    driverPlate?: string | null;
    driverVehiclePhoto?: string | null;
    driverPhotoUrl?: string | null;
    driverVehicleBrand?: string | null;
    driverVehicleModel?: string | null;
    driverVehicleYear?: number | null;
    driverVehicleColor?: string | null;
    driverSubtypeSnapshot?: string;
    commissionRateSnapshot?: number;
    municipalRateSnapshot?: number;
    pricing?: {
        estimatedTotal: number;
        finalTotal?: number | null;
        estimatedDistanceMeters: number;
        estimatedDurationSeconds?: number;
        surgeMultiplier?: number;
        discountAmount?: number | null;
        estimated?: {
            total: number;
            breakdown: any;
            configSnapshot: any;
            calculatedAt: any;
        };
        hasPassengerExpressBenefit?: boolean;
        passengerDiscountPercent?: number;
        passengerDiscountAmount?: number;
        vamoSubsidyAmount?: number;
        expressDiscountAmount?: number;
        creditCoveredAmount?: number;
        creditsApplied?: boolean;
        walletCoveredAmount?: number;
        cashToCollect?: number;
        pricingSnapshot?: PricingSnapshot;
        totalAmount?: number;
        commissionAmount?: number;
        commissionRate?: number;
        dynamic?: DynamicPricingSnapshot;
    };
    pricingVersion?: string;
    pauseStartedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    pauseHistory?: { duration: number, reason: 'initial_wait' | 'driver_pause' }[];
    completedRide?: CompletedRide | null;
    settledAt?: FirestoreTimestamp | null;
    driverRatingByPassenger?: number | null;
    passengerRatingByDriver?: number | null;
    driverComments?: string | null;
    passengerComments?: string | null;
    vamoPointsAwarded?: number | null;
    cancelledBy?: 'passenger' | 'driver' | 'system' | null;
    cancelReason?: string | null;
    cancelledAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    legalAcceptance?: {
        termsVersion: string;
        acceptedAt: FirestoreTimestamp;
        userAgent: string;
        ip: string;
    }[];
    chatSummary?: RideChatSummary;
    passengerPhotoUrl?: string;
    municipalStatus?: string;
    totalIgnores?: number;
    weeklyPoolCounted?: boolean;
    weeklyPoolWeekId?: string;
    weeklyPoolCountedAt?: any;
    expansionCounted?: boolean;
    isSimulation?: boolean;
    isSimulationResult?: boolean;
    simulationProcessedAt?: FirestoreTimestamp | null;
    distanceKm?: number;
    durationMinutes?: number;
    cumulativeWaitSeconds?: number;
    paymentSnapshot?: PaymentSnapshot;
}

export interface DriverStats {
    ridesCompleted: number;
    acceptanceRate: number;
    cancellationRate: number;
}

export interface UserProfile {
    id?: any;
    uid: string;
    name: string;
    surname?: string;
    lastName?: string;
    displayName?: string;
    welcomeBonus?: {
        available: boolean;
        used: boolean;
    };
    email: string;
    emailLower?: string;
    phone?: string | null;
    phoneNormalized?: string | null;
    role: Role;
    profileCompleted: boolean;
    photoURL?: string | null;
    city?: string;
    cityKey?: string;
    country?: string;
    gender?: string;
    registrationStatus?: RegistrationStatus;
    onboardingIncomplete?: boolean;
    createdAt: any;
    updatedAt?: any;
    isSuspended?: boolean;
    averageRating?: number | null;
    ratingCount?: number;
    activeRideId?: string | null;
    driverStatus?: DriverStatus;
    approved?: boolean;
    currentBalance?: number;
    nonWithdrawableBalance?: number;
    hasBalance?: boolean;
    lastRideCompletedAt?: FirestoreTimestamp | null;
    vehicleType?: VehicleType | null;
    vehicleModel?: string | null;
    vehicleColor?: string | null;
    plateNumber?: string | null;
    vehicleBrand?: string | null;
    carModelYear?: number | string;
    vehicleFrontPhotoURL?: string | null;
    vehicle?: {
        brand?: string;
        model: string;
        plate: string;
        color: string;
        year?: number;
    } | null;
    cuit?: string;
    municipalTaxId?: string; 
    sexualCriminalRecordVerified?: boolean;
    licenseNumber?: string;
    licenseVerified?: boolean;
    vehicleVerificationStatus?: VerificationStatus;
    municipalCode?: string;
    municipalStatus?: MunicipalExpressStatus | string;
    licenseExpiry?: any;
    insuranceExpiry?: any;
    itvExpiry?: any;
    canonExpiry?: any;
    canonStatus?: CanonStatus;
    driverSubtype?: DriverSubtype;
    servicesOffered?: {
        express: boolean;
        professional: boolean;
    };
    passengerExpressBenefitActive?: boolean;
    passengerExpressDiscountPercent?: 10 | 15;
    passengerProgress?: {
        ridesThisWeek: number;
        weekIdentifier: string; 
        currentLevel: 'none' | 'unlocked_10' | 'unlocked_15';
    };
    vehicleOwnerId?: string;       
    authorizedDriverIds?: string[]; 
    activeDriverId?: string;      
    isVehicleOwner?: boolean;     
    totalEarnings?: number;       
    settlementAccount?: string;   
    driverPreferences?: {
        acceptsExpress: boolean;
        acceptsDiscountedRides: boolean;
        acceptsPets: boolean;
    };
    expressAccess?: {
        unlockLevel: number;
        bonus20Available: number;
        bonus10Available: number;
    };
    termsAccepted?: boolean;
    acceptedDriverTerms?: boolean;
    termsAcceptedAt?: any;
    termsVersion?: string;
    emailVerified?: boolean;
    emergencyContacts?: {
        name: string;
        phone: string;
        relationship?: string; 
    }[];
    passengerStats?: {
        totalRides: number;
        completedRides: number;
        cancelledRides: number;
        rating: number;
    };
    manualReviewStatus?: 'pending' | 'docs_submitted' | 'approved' | 'rejected';
    requiresManualReview?: boolean;
    onboardingCompleted?: boolean;
    adminReviewNote?: string;
    documentsRequested?: string[];
    documentsSubmitted?: Record<string, {
        url: string;
        uploadedAt: any;
    }>;
    referralCode?: string;
    referredBy?: string;
    referredByCode?: string;
    matchingScore?: number;
    serviceTier?: 'regular' | 'premium';
    stats?: DriverStats;
    rewardPoints?: number;
    weeklyPoints?: number;
    weeklyTripsCount?: number;
    driverLevel?: DriverLevel;
    vamoPoints?: number;
    promoCreditGranted?: boolean;
    fcmToken?: string | null; 
    fcmTokens?: string[]; 
    fcmUpdatedAt?: any;
    weeklyCancellations?: number;
    weeklyCancellationsResetAt?: FirestoreTimestamp | null;
    passengerCancellationBlockedUntil?: FirestoreTimestamp | null;
    passengerStatus?: "active" | "limited" | "blocked";
    lastCancellationAt?: FirestoreTimestamp | null;
    blockedUntil?: FirestoreTimestamp | null;
    operatingAreaId?: string;
    legalAcceptanceLog?: {
        termsVersion: string;
        acceptedAt: FirestoreTimestamp;
        userAgent: string;
        ip: string;
    }[];
    dailyStats?: {
        ridesCount: number;
        earningsDaily: number;
        todayCash?: number;
        todayDigital?: number;
        kilometersDaily: number;
        onlineSeconds: number;
        lastResetDate: string;
        lastUpdated: any;
        earnings?: number; 
        lastStatusChangedAt?: FirestoreTimestamp | null;
        missionsCompleted?: string[];
    };
    financialStats?: {
        weeklyEarnings: number;
        monthlyEarnings: number;
        totalHistoricalEarnings: number;
        lastWeekId: string;
        lastMonthId: string;
    };
    identityStatus?: 'unverified' | 'pending' | 'approved' | 'rejected';
    identityDocuments?: {
        dniFront?: string;
        dniBack?: string;
        selfie?: string;
    };
    identityNote?: string;
    identitySubmittedAt?: any;
    observationGraceUntil?: any;
    claimsVersion?: number;
    driverRiskScore?: number; 
    driverRiskLevel?: "low" | "medium" | "high" | "blocked";
    riskReasons?: string[];
    cancellationCount?: number;
    ignoredOffersCount?: number;
    watchdogReleaseCount?: number;
    openPanicClaims?: number;
    securityClaimsCount?: number;
}

export interface CityLedger {
    cityKey: string;
    totalRides: number;
    totalVolume: number;
    totalCommissions: number;
    totalVamoNet: number;
    totalMuniRevenue: number;
    totalSubsidies: number;
    lastReportAt: any;
}

export interface GlobalAppConfig {
    maxWeeklySubsidyPerUser: number;
    maxDailySubsidyGlobal: number;
    currentDailySubsidySpent: number;
    subsidyResetDate: string;
}

export type PromotionStatus = 'active' | 'inactive' | 'scheduled' | 'paused' | 'draft' | 'expired';
export type PromotionTarget = 'passenger' | 'driver';

export interface Promotion {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    status: PromotionStatus;
    target: PromotionTarget;
    context: PromotionContext;
    reward: {
        type: 'fixed' | 'percentage';
        value: number;
        cap?: number;
    };
    limits: {
        maxRedemptionsPerUser: number;
        maxTotalRedemptions?: number;
    };
    conditions: {
        minAmount?: number;
        maxAmount?: number;
        city?: string;
        isFirstAction?: boolean;
        daysInactive?: number;
        userLevels?: DriverLevel[];
    };
    city: 'global' | string;
    priority: number;
    stackable?: boolean;
    startsAt?: FirestoreTimestamp;
    endsAt?: FirestoreTimestamp;
}

export interface PromotionRedemption {
    id: string;
    promotionId: string;
    userId: string;
    role: Role;
    redeemedAt: FirestoreTimestamp | FirestoreFieldValue;
    rewardApplied: number;
    status: 'applied' | 'reserved' | 'failed';
    transactionId?: string;
    rideId?: string;
}

export type PromotionContext = 'topup' | 'ride' | 'registration' | 'general' | 'signup' | 'reactivation';

export interface SystemConfig {
    matchingEnabled: boolean;
    expressEnabled: boolean;
    globalMaintenance: boolean;
    maxMatchingAttempts?: number;
    offerDurationSeconds?: number;
    rawsonBroadcastEnabled?: boolean;
    playaUnionBroadcastEnabled?: boolean;
    trelewBroadcastEnabled?: boolean;
    schemaVersion?: number;
    updatedBy?: string;
    updatedAt?: any;
}

export interface City {
    id?: string;
    cityKey: string;
    name: string;
    province: string;
    country: string;
    status: CityStatus;
    invitedBy: string;
    invitedAt: any;
    adminEmail?: string;
    adminUserId?: string;
    config: {
        pricing?: PricingConfig;
        rewardsConfig?: RewardsConfig;
    };
    createdAt: any;
    updatedAt?: any;
}

export interface CityConfig {
    pricing?: PricingConfig;
    enabled: boolean;
}

export interface ExpressConfig {
    isExpressUnlockEnabled: boolean;
    isExpressBonusEnabled: boolean;
    level1MinFare: number;
    dailyBudgetCap: number;
    weeklyBudgetCap: number;
    bonus10Percent: number;
    bonus10Cap: number;
    bonus20Percent: number;
    bonus20Cap: number;
    pricing: any;
    unlockLevel: number;
}

export interface ExpressBudget {
    dailyPool: number;
    spentToday: number;
    dailyUsed: number;
    weeklyUsed: number;
}

export interface Referral {
    id: string;
    referrerId: string;
    referredId: string;
    status: 'pending' | 'completed' | 'expired' | 'rejected';
    rewardAmountReferrer: number;
    rewardAmountReferred: number;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    completedAt?: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PassengerCredit {
    id: string;
    userId: string;
    amount: number;
    initialAmount: number;
    source: 'cashback' | 'first_ride' | 'referral' | 'manual';
    rideId?: string;
    status: 'active' | 'used' | 'expired' | 'cancelled' | 'locked';
    maxUsagePercent: number;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    expiresAt: FirestoreTimestamp;
}

export interface UserReward {
    id: string;
    userId: string;
    type: string;
    amount: number;
    status: 'available' | 'used';
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface Wallet {
    userId: string;
    cashBalance: number;
    promoBalance: number;
    lockedCash: number;
    lockedPromo: number;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

export type WalletTransactionType = 
    | 'welcome_bonus' 
    | 'topup_cash' 
    | 'topup_bonus' 
    | 'ride_wallet_lock' 
    | 'ride_wallet_release' 
    | 'ride_wallet_consume' 
    | 'cashback_reward'
    | 'fap_compensation'
    | 'ride_earning'
    | 'cash_collected'
    | 'adjustment';

export interface WalletTransaction {
    id: string;
    userId: string;
    rideId?: string;
    orderId?: string;
    amount: number;
    cashAmount: number;
    promoAmount: number;
    type: WalletTransactionType;
    balanceAfterCash: number;
    balanceAfterPromo: number;
    note?: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface WalletMovement {
    id: string;
    userId: string;
    rideId: string;
    amount: number;
    type: 'ride_earning' | 'cash_collected' | 'adjustment';
    cityKey: string;
    note?: string;
    balanceBefore?: number;
    balanceAfter?: number;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PlatformTransaction {
    id?: string;
    driverId: string;
    amount: number;
    type: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    source: string;
    referenceId?: string;
    note?: string;
    reason?: string;
    createdBy?: string;
    cityKey: string;
    status?: 'pending' | 'completed' | 'rejected' | 'credited' | 'failed';
    updatedAt?: FirestoreTimestamp | FirestoreFieldValue;
    systemVersion?: string;
}

export interface DriverPoints {
    weeklyPoints: number;
    totalPoints: number;
    updatedAt: FirestoreTimestamp;
    lastResetAt?: FirestoreTimestamp | FirestoreFieldValue;
}

export interface RewardsConfig {
    weeklyPoolAmount: number;
    minPointsToQualify: number;
    totalWeeklyPoints?: number;
    qualifiedDriversCount?: number;
}

export interface RideOffer {
    id?: string;
    rideId: string;
    driverId: string;
    passengerId: string;
    status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
    sentAt: FirestoreTimestamp | FirestoreFieldValue;
    expiresAt: FirestoreTimestamp;
    finalizedAt?: FirestoreTimestamp | FirestoreFieldValue;
    score?: number;
    distanceMeters?: number;
    round: number;
    origin: Place;
    destination: Place;
    serviceType: ServiceType;
    estimatedTotal: number;
    passengerName: string;
    cityKey: string;
    isVip?: boolean;
    vmiScore?: number;
    isScheduled?: boolean;
    scheduledAt?: FirestoreTimestamp | null;
    offerBreakdown?: {
        totalFare: number;
        cashToCollect: number;
        walletCoveredAmount: number;
    } | null;
    isDiscountApplied?: boolean;
    compensationAmount?: number;
    passengerPaysTotal?: number;
    driverReceivesTotal?: number;
    cashToCollect?: number;
    walletCoveredAmount?: number;
    paymentMethod?: string;
    distanceKm?: number;
    durationMinutes?: number;
    pricing?: any;
    acknowledgedAt?: FirestoreTimestamp | FirestoreFieldValue;
    acknowledgedBy?: string;
    updatedAt?: FirestoreTimestamp | FirestoreFieldValue;
    passengerRiskSummary?: PassengerRiskSummary;
}

export interface RideRequest {
    id?: string;
    passengerId: string;
    origin: Place;
    destination: Place;
    serviceType: ServiceType;
    status: 'pending' | 'searching' | 'fulfilled' | 'failed';
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    rideId?: string | null;
}

export interface DriverLocation {
    geohash: string | null;
    currentLocation: { lat: number; lng: number; } | null;
    lastSeenAt: FirestoreTimestamp | FirestoreFieldValue;
    driverStatus: DriverStatus;
    approved: boolean;
    isSuspended?: boolean;
    pendingOffers: number;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PricingConfig {
    version: number;
    DAY_BASE_FARE: number;
    DAY_PRICE_PER_100M: number;
    DAY_WAITING_PER_MIN: number;
    NIGHT_BASE_FARE: number;
    NIGHT_PRICE_PER_100M: number;
    NIGHT_WAITING_PER_MIN: number;
    DISTANCE_FRACTION_METERS?: number; 
    WAITING_FRACTION_SECONDS?: number; 
    MINIMUM_FARE: number;
    PLATFORM_COMMISSION_RATE: number;
    commission_particular: number;
    commission_taxi_remis: number;
    municipal_percentage: number;
    ASSISTANCE_FEE: number;
    assistanceEnabled: boolean;
    dynamicPricing?: DynamicPricingConfig;
    createdAt?: any;
    updatedAt?: any;
}

export interface DynamicPricingConfig {
    enabled: boolean;
    algorithmMode: 'manual' | 'automatic';
    currentDiscountPercent: number;
    maxDiscountPercent: number;
    minDiscountPercent: number;
    reasonCodes: string[];
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedBy?: string;
}

export interface DynamicPricingSnapshot {
    applied: boolean;
    municipalBaseFare: number;
    configuredDiscountPercent: number;
    rawDiscountAmount: number;
    fareAfterRawDiscount: number;
    finalPassengerFare: number;
    appliedDiscountAmount: number;
    appliedDiscountPercent: number;
    maxDiscountPercent: number;
    reasonCodes: string[];
    algorithmMode: 'manual' | 'automatic';
    calculatedAt: FirestoreTimestamp | FirestoreFieldValue;
    cityKey: string;
    source: 'backend';
}

export interface PricingSnapshot {
    commission_particular: number;
    commission_taxi_remis: number;
    municipal_percentage: number;
    cityKey: string;
    timestamp: any;
}

export interface ExpansionIncentive {
    id: string;
    province: string;
    founderCityKey: string;
    totalTargetTrips: number;
    currentTripsOutsideFounder: number;
    progress: number;
    config: {
      municipalShare: { start: number; target: number };
      taxiRemisCommission: { start: number; target: number };
      particularCommission: { start: number; target: number };
    };
    currentRates: {
      municipalRate: number;
      taxiRemisCommission: number;
      particularCommission: number;
    };
    enabled: boolean;
    updatedAt: any;
}

export interface ChubutExpansionStats {
    totalTripsOutsideRawson: number;
    lastUpdated: any;
}

export interface WithdrawalRequest {
    id?: string;
    driverId: string;
    driverName: string;
    amount: number;
    status: 'pending' | 'approved' | 'rejected';
    cityKey?: string;
    bankInfo: {
        accountHolder: string;
        cbuOrAlias: string;
    };
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    processedAt?: FirestoreTimestamp | FirestoreFieldValue;
    processedBy?: string;
}

export interface MunicipalAccount {
    cityKey: string;
    currentBalance: number;
    totalAccumulated: number;
    totalWithdrawn: number;
    pendingWithdrawalAmount: number;
    status: 'active' | 'suspended';
    lastMovementAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    parentCityKey?: string | null;
    networkMode?: 'standalone' | 'node' | 'master';
}

export interface MunicipalWithdrawRequest {
    id?: string;
    cityKey: string;
    requestedAmount: number;
    requestedBy: string;
    requestedByName: string;
    requestedByRole: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'cancelled';
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    approvals?: {
        userId: string;
        userName: string;
        userRole: string;
        at: FirestoreTimestamp;
    }[];
    reviewedBy?: string;
    reviewedAt?: FirestoreTimestamp | FirestoreFieldValue;
    executedBy?: string;
    executedAt?: FirestoreTimestamp | FirestoreFieldValue;
    linkedTransactionId?: string;
    rejectionReason?: string;
    availableBalanceSnapshot?: number;
}

export type WithId<T> = T & { id: string };

export interface WeeklyPool {
    cityKey: string;
    weekId: string;
    status: 'active' | 'closed';
    baseAmount: number;
    currentAmount: number;
    maxAmount: number;
    growthRate: number;
    totalCompletedTrips: number;
    createdAt: any;
    updatedAt: any;
}

export interface WeeklyPoolDriver {
    driverId: string;
    completedTrips: number;
    multiplier: number;
    rank: number;
    estimatedPayout: number;
}

export interface WeeklyPoolClosure {
    finalPoolAmount: number;
    payouts: {
        driverId: string;
        amount: number;
        trips: number;
        multiplier: number;
    }[];
    closedAt: any;
}

export type AntifraudMode = "monitor" | "enforce";
export type AntifraudAlertSeverity = "low" | "medium" | "high" | "critical";
export type AntifraudAlertStatus = "open" | "reviewed" | "dismissed" | "confirmed";

export interface AntifraudConfig {
    enabled: boolean;
    mode: AntifraudMode;
    blockSuspiciousRides: boolean;
    blockSuspiciousClaims: boolean;
    blockSuspiciousUsers: boolean;
    requireManualReviewAboveScore: number;
    autoBlockAboveScore: number;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedBy: string;
}

export interface FraudAlert {
    id: string;
    type: string;
    severity: AntifraudAlertSeverity;
    rideId?: string;
    passengerId?: string;
    driverId?: string;
    cityKey: string;
    score: number;
    reason: string;
    evidence: any;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    status: AntifraudAlertStatus;
    reviewedBy?: string;
    reviewedAt?: FirestoreTimestamp | FirestoreFieldValue;
}

export interface AuditLog {
    id: string;
    actorId: string;
    actorRole: Role;
    action: string;
    collection: string;
    documentId: string;
    before?: any;
    after?: any;
    changedFields?: string[];
    ip?: string;
    device?: string;
    riskScore: number;
    source: "client" | "function" | "admin";
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export type LedgerEventType = 
    | "user_created" | "driver_registered" | "driver_doc_uploaded"
    | "muni_approved" | "muni_rejected" | "driver_online" | "driver_offline"
    | "offer_received" | "offer_ignored" | "ride_accepted" | "ride_cancelled"
    | "ride_started" | "ride_completed" | "settlement_generated"
    | "wallet_debit" | "wallet_credit" | "pool_impact" | "points_added"
    | "claim_created" | "claim_resolved" | "fraud_alert_created"
    | "user_suspended" | "user_reactivated" | "passenger_marked_by_driver"
    | "ride_tracking_started" | "ride_tracking_point_saved" | "ride_tracking_analyzed"
    | "fraud_action_generated" | "fraud_user_flagged" | "fraud_user_review_required";

export interface RideTrackingPoint {
    rideId: string;
    driverId: string;
    passengerId: string;
    cityKey: string;
    lat: number;
    lng: number;
    timestamp: FirestoreTimestamp | FirestoreFieldValue;
    actor: 'driver' | 'passenger';
    source: 'app' | 'background' | 'system';
    accuracy?: number;
    speed?: number;
    heading?: number;
}

export interface LedgerEvent {
    id: string;
    eventType: LedgerEventType;
    actorId: string;
    actorRole: Role;
    targetId?: string;
    rideId?: string;
    passengerId?: string;
    driverId?: string;
    cityKey?: string;
    amount?: number;
    metadata?: any;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    dayKey: string;
    weekKey: string;
    monthKey: string;
}

export interface UserLifecycle {
    id: string;
    role: "driver" | "passenger";
    cityKey: string;
    registeredAt: FirestoreTimestamp;
    subtype?: DriverSubtype;
    muniStatus?: string;
    totalOnlineSeconds?: number;
    ridesOfferedCount?: number;
    ridesAcceptedCount?: number;
    ridesIgnoredCount?: number;
    ridesCancelledCount?: number;
    ridesCompletedCount?: number;
    claimsReceivedCount?: number;
    claimsMadeCount?: number;
    fraudAlertsCount?: number;
    ridesRequestedCount?: number;
    ridesCompletedPassengerCount?: number;
    ridesCancelledPassengerCount?: number;
    trustScore?: number;
    lastActivityAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PassengerDriverMark {
    id: string;
    passengerId: string;
    driverId: string;
    rideId: string;
    cityKey: string;
    type: "no_show" | "aggressive_behavior" | "unsafe_behavior" | "payment_problem" | "wrong_location" | "repeated_cancellation" | "other";
    reason: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    status: "active" | "dismissed" | "under_review";
    reviewedBy?: string;
    reviewedAt?: FirestoreTimestamp | FirestoreFieldValue;
    source: 'driver_app';
    riskWeight: number;
}

export interface PassengerLifecycle {
    passengerId: string;
    totalDriverMarks: number;
    lastDriverMarkAt?: FirestoreTimestamp | FirestoreFieldValue;
    lastDriverMarkType?: string;
    trustScore: number;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PassengerRiskSummary {
    totalMarks: number;
    lastMarkType?: string;
    trustScore: number;
    warningText?: string;
}

export type FapType = 
  | 'accident' 
  | 'robbery' 
  | 'medical' 
  | 'overcharge' 
  | 'vandalism' 
  | 'lost_item' 
  | 'harassment' 
  | 'other';

export interface FapTimelineEvent {
    id: string;
    action: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    timestamp: any;
    note: string;
    metadata?: any;
}

export interface FapClaim {
    id: string;
    caseId: string;
    rideId: string;
    passengerId: string;
    passengerNameSnapshot: string;
    driverId: string;
    driverNameSnapshot: string;
    driverSubtypeSnapshot: string;
    cityKey: string;
    status: 'pending' | 'pending_info' | 'reviewing' | 'escalated' | 'approved' | 'paid' | 'rejected' | 'cancelled';
    level: 1 | 2 | 3;
    type: FapType;
    description: string;
    evidenceUrls: string[];
    evidenceIsPrivate: boolean;
    requestedAmount: number;
    approvedAmount?: number;
    fraudFlags: string[];
    validationScore: number;
    compliance: {
        requirementsMet: boolean;
        missingRequirements: string[];
        submittedAt: any;
    };
    deviceInfo: {
        userAgent: string;
        ip: string;
        platform: string;
    };
    timeline: FapTimelineEvent[];
    rideSnapshot: any;
    adminNotes?: string;
    rejectionReason?: string;
    resolutionType?: string;
    resolvedAt?: any;
    resolvedBy?: string;
    resolvedByName?: string;
    paymentTxId?: string;
    paidAt?: any;
    createdAt: any;
    updatedAt: any;
}

export interface FapCounter {
    year: number;
    lastNumber: number;
}
