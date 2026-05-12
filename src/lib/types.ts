/**
 * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * This file is synchronized from functions/src/types.ts
 * Last Sync: 2026-04-27T01:33:04.714Z
 */

export type FirestoreTimestamp = any;
export type FirestoreFieldValue = any;

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

/**
 * Centrally defines which ride states allow triggering a Panic Alert.
 * Rule: Visible during active transit or when driver is assigned.
 */
export const isPanicButtonVisible = (status: RideStatus): boolean => {
    return ['driver_assigned', 'driver_arrived', 'in_progress', 'paused'].includes(status);
};

/**
 * Convierte un nombre de ciudad a su clave normalizada.
 */
export function normalizeCityKey(city: string): string {
    return city
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Genera un código municipal estandarizado (Ej: RW-00123).
 */
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
    originalTotal?: number;
    discountAmount?: number;
    discountReason?: string;
    passengerFinalTotal?: number;
    vamoSubsidyAmount?: number;
    driverRecognizedTotal?: number;
    driverNetEarnings?: number;
    driverWalletCredit?: number;
    baseCommissionRate: number;
    finalCommissionRate: number;
    commissionAmount: number;
    municipalFee?: number;
    municipalRate?: number;
    fapFee?: number;
    pointsAwarded?: number;
    walletCoveredAmount?: number;
    cashToCollect?: number;
    commissionRate?: number;
    extrasFare?: number;
    driverNetAmount?: number;
    trackingStats: TrackingStats;
    calculatedAt: FirestoreTimestamp;
    fapEligible?: boolean;
    driverSubtype?: string;
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
    vehicleOwnerId?: string; // [VamO PRO] Financial beneficiary
    activeDriverId?: string; // [VamO PRO] Driver operating the vehicle

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

    // --- MATCHING ---
    currentOfferedDriverId?: string | null;
    matchingExpiresAt?: FirestoreTimestamp | null;
    notifiedDrivers?: string[];
    matchingScoreBoost?: number;
    cityKey: string; // [Vamo PRO] Multi-city isolation key
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
    driverVehiclePhotoFrontUrl?: string | null;
    driverPhotoUrl?: string | null;
    driverVehicleBrand?: string | null;
    driverVehicleModel?: string | null;
    driverVehicleYear?: number | null;
    driverVehicleColor?: string | null;

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
        // Express / Promo metadata (VamO PRO)
        hasPassengerExpressBenefit?: boolean;
        passengerDiscountPercent?: number;
        passengerDiscountAmount?: number;
        vamoSubsidyAmount?: number;
        cashToCollect?: number;
        pricingSnapshot?: PricingSnapshot;
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

    // --- WEEKLY POOL (VamO PRO) ---
    weeklyPoolCounted?: boolean;
    weeklyPoolWeekId?: string;
    weeklyPoolCountedAt?: any;

    recordingStatus?: {
        isRecordingByPassenger?: boolean;
        isRecordingByDriver?: boolean;
        passengerRecordingType?: RecordingType;
        driverRecordingType?: RecordingType;
        lastUpdateAt: FirestoreTimestamp;
    };
    paymentSnapshot?: PaymentSnapshot;
}

export type RecordingType = 'audio' | 'video' | 'audio_video' | 'none';

export interface RideRecording {
    id: string;
    rideId: string;
    userId: string;
    role: 'passenger' | 'driver';
    type: RecordingType;
    status: 'uploading' | 'completed' | 'failed';
    url?: string;
    createdAt: any;
}

export type EnrichedRideOffer = WithId<RideOffer> & { 
  passengerName?: string | null;
  origin: Place;
  destination: Place;
  pricing?: Ride['pricing'];
};

export interface DriverStats {
    ridesCompleted: number;
    acceptanceRate: number;
    cancellationRate: number;
}

export interface UserProfile {
    id?: any;
    uid: string; // Atomic UID
    name: string;
    surname?: string;
    displayName?: string;
    welcomeBonus?: {
        available: boolean;
        used: boolean;
    };
    email: string;
    phone?: string | null;
    role: Role;
    profileCompleted: boolean;
    photoURL?: string | null;

    city?: string;
    cityKey?: string;
    country?: string;
    gender?: string;

    createdAt: any;
    updatedAt?: any;

    isSuspended?: boolean;
    averageRating?: number | null;
    ratingCount?: number;

    activeRideId?: string | null;
    isOnline?: boolean;
    lastActiveAt?: any;
    lastSeenAt?: any;

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
    carModelYear?: number | null;
    vehicleBrand?: string | null;
    vehicleFrontPhotoURL?: string | null;
    vehiclePhotoFrontUrl?: string | null;
    vehicle?: {
        brand: string;
        model: string;
        plate: string;
        color: string;
        year?: number;
    } | null;
    cuit?: string;
    municipalTaxId?: string; // VeDi ID for Córdoba
    sexualCriminalRecordVerified?: boolean;
    licenseNumber?: string;
    licenseVerified?: boolean;
    vehicleVerificationStatus?: VerificationStatus;

    municipalCode?: string;
    municipalStatus?: string;
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
        weekIdentifier: string; // e.g., "2024-W15"
        currentLevel: 'none' | 'unlocked_10' | 'unlocked_15';
    };

    // --- OWNER / AUTHORIZED DRIVER SYSTEM ---
    vehicleOwnerId?: string;       // UID del dueño del vehículo / cuenta principal
    authorizedDriverIds?: string[]; // UIDs de choferes autorizados por este dueño
    activeDriverId?: string;      // UID del chofer que está operando el vehículo actualmente
    isVehicleOwner?: boolean;     // Indica si el usuario es el dueño legal del vehículo
    
    // --- FINANCIAL CONTEXT ---
    totalEarnings?: number;       // Solo visible para el dueño
    settlementAccount?: string;   // CBU/Alias del dueño

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
        relationship?: string; // Made optional if some users don't have it, but added to interface
    }[];
    passengerStats?: {
        totalRides: number;
        completedRides: number;
        cancelledRides: number;
        rating: number;
    };
    // --- Driver Specific (Legacy/Professional) ---
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
    fcmToken?: string | null; // @deprecated use fcmTokens
    fcmTokens?: string[]; // [VamO PRO] Multi-device support
    fcmUpdatedAt?: any;

    weeklyCancellations?: number;
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
        onlineSeconds: number;
        kilometersDaily: number;
        earningsDaily: number;
        todayCash?: number;
        todayDigital?: number;
        lastResetDate: string; // ISO date YYYY-MM-DD
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
}

export type FapType = "accident" | "vandalism" | "robbery" | "medical" | "behavior" | "overcharge" | "lost_item" | "other";

export interface FapTimelineEvent {
    id: string;
    action: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    timestamp: FirestoreTimestamp | FirestoreFieldValue;
    note?: string;
    metadata?: any;
}

export type FapStatus = 'draft' | 'pending_info' | 'pending' | 'reviewing' | 'approved' | 'rejected' | 'paid' | 'cancelled' | 'escalated' | 'closed';
export type FapLevel = 1 | 2 | 3;

export interface FapClaim {
    id: string;
    caseId: string; // Case number FAP-2026-000001
    rideId: string;
    cityKey: string;
    passengerId: string;
    passengerNameSnapshot: string;
    driverId: string;
    driverNameSnapshot: string;
    driverSubtypeSnapshot: string;
    status: FapStatus;
    adminViewedAt?: any;
    type: FapType;
    level: FapLevel;
    description: string;
    evidenceUrls: string[];
    evidenceIsPrivate?: boolean;
    requestedAmount: number;
    approvedAmount?: number;
    adminNotes?: string;
    rejectionReason?: string;
    resolvedBy?: string;
    resolvedByName?: string;
    resolutionType?: 'economic' | 'credit' | 'operational' | 'rejection' | 'escalation';
    fraudFlags?: string[];
    validationScore?: number;
    compliance?: {
        requirementsMet: boolean;
        missingRequirements: string[];
        submittedAt?: FirestoreTimestamp | null;
    };
    deviceInfo?: {
        userAgent?: string;
        ip?: string;
        platform?: string;
        appVersion?: string;
    };
    timeline: FapTimelineEvent[];
    rideSnapshot: {
        origin: string;
        destination: string;
        totalFare: number;
        completedAt: any;
        driverSubtype: string;
        city: string | null | undefined;
        cityKey?: string;
        serviceType?: string;
        fareEstimate?: number;
        distanceMeters?: number;
        durationSeconds?: number;
    };
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    resolvedAt?: FirestoreTimestamp | FirestoreFieldValue;
    paidAt?: FirestoreTimestamp | FirestoreFieldValue;
    paymentTxId?: string;
    systemVersion?: string;
}

export interface FapCounter {
    year: number;
    lastNumber: number;
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
    subsidyResetDate: string; // YYYY-MM-DD
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
    // [VamO PRO] Consolidated matching settings
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
    id?: string; // the cityKey
    cityKey: string;
    name: string;
    province: string;
    country: string;

    status: CityStatus;

    invitedBy: string; // UID or cityKey of the inviter
    invitedAt: FirestoreTimestamp | FirestoreFieldValue;

    adminEmail?: string;
    adminUserId?: string;

    config: {
        pricingModel?: string;
        fapEnabled: boolean;
        broadcastEnabled: boolean;
        pricing?: PricingConfig;
        rewardsConfig?: RewardsConfig;
    };

    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt?: FirestoreTimestamp | FirestoreFieldValue;
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
    maxUsagePercent: number; // e.g. 30
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
    lockedCash: number;  // Funds frozen for an active ride
    lockedPromo: number; // Funds frozen for an active ride
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
    | 'adjustment';

export interface WalletTransaction {
    id: string;
    userId: string;
    rideId?: string;
    orderId?: string;
    amount: number; // Combined net change for ledger clarity
    cashAmount: number;
    promoAmount: number;
    type: WalletTransactionType; // Strictly controlled types
    balanceAfterCash: number;
    balanceAfterPromo: number;
    note?: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PlatformTransaction {
    id?: string;
    driverId: string;
    amount: number; // Positive for credit, negative for debit
    type: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    source: string;
    referenceId?: string;
    note?: string;
    reason?: string;
    createdBy?: string;
    cityKey: string; // [Vamo PRO] Multi-city isolation key
    status?: 'pending' | 'completed' | 'rejected' | 'credited' | 'failed';
    updatedAt?: FirestoreTimestamp | FirestoreFieldValue;
    systemVersion?: string;
}

export interface DriverPoints {
    weeklyPoints: number;
    weeklyTripsCount?: number;
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

    // Denormalized data
    origin: Place;
    destination: Place;
    serviceType: ServiceType;
    estimatedTotal: number;
    passengerName: string;
    cityKey: string; // [Vamo PRO] Multi-city isolation key
    isVip?: boolean; // [VamO PRO] Add VIP status
    vmiScore?: number; // [VamO PRO] VMI Quality Score
    isScheduled?: boolean; // [VamO PRO] Indicates this offer comes from a scheduled ride
    scheduledAt?: FirestoreTimestamp | null; // [VamO PRO] Original scheduled time

    offerBreakdown?: {
        totalFare: number;
        cashToCollect: number;
        walletCoveredAmount: number;
    } | null;

    // Express / Promo metadata (VamO PRO)
    isDiscountApplied?: boolean;
    compensationAmount?: number;
    passengerPaysTotal?: number;
    driverReceivesTotal?: number;
    pricing?: any; // To allow financial snapshot computation directly from the offer
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
    DISTANCE_FRACTION_METERS?: number; // Ej: 110m para Córdoba
    WAITING_FRACTION_SECONDS?: number; // Ej: 60s
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
    algorithmMode: "manual" | "auto";
    currentDiscountPercent: number;
    maxDiscountPercent: number;
    minDiscountPercent: number;
    reasonCodes: string[];
    updatedAt: any;
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
    algorithmMode: "manual" | "auto";
    reasonCodes: string[];
    calculatedAt: any;
    cityKey: string;
    source: "backend";
}

export interface PricingSnapshot {
    commission_particular: number;
    commission_taxi_remis: number;
    municipal_percentage: number;
    cityKey: string;
    timestamp: any;
}

export interface WithdrawalRequest {
    id?: string;
    driverId: string;
    driverName: string;
    amount: number;
    status: 'pending' | 'approved' | 'rejected';
    cityKey?: string; // Multi-city isolation key
    bankInfo: {
        accountHolder: string;
        cbuOrAlias: string;
    };
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    processedAt?: FirestoreTimestamp | FirestoreFieldValue;
    processedBy?: string; // Admin UID
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
    parentCityKey?: string | null; // Future multi-city cabecera
    networkMode?: 'standalone' | 'node' | 'master'; // Future-proofing
}

export interface MunicipalWithdrawRequest {
    id?: string;
    cityKey: string;
    requestedAmount: number;
    requestedBy: string; // User UID
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
