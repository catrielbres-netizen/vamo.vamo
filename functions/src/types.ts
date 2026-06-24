import { FieldValue, Timestamp } from "firebase-admin/firestore";

// src/functions/src/types.ts
// This file is intended for Cloud Functions and uses the admin SDK types.

export type FirestoreTimestamp = Timestamp;
export type FirestoreFieldValue = FieldValue;

export type ServiceType = "professional" | "express" | "shared";
export type VehicleType = "taxi" | "remis";

export type Role = "admin" | "superadmin" | "driver" | "passenger" | "admin_municipal" | "operator_municipal" | "treasury_municipal" | "auditor_municipal" | "traffic_municipal" | "station_operator" | "municipal_admin" | "traffic_admin" | "traffic_operator" | "traffic";

export interface MunicipalAccountPaymentConfig {
    cityKey: string;
    municipalityName: string;
    paymentProvider: 'mercado_pago' | 'bank_transfer' | 'manual';
    mercadoPagoAccountId?: string;
    mercadoPagoLinked: boolean;
    mercadoPagoEmail?: string;
    bankAlias?: string;
    cbu?: string;
    cuit?: string;
    accountHolderName?: string;
    enabled: boolean;
    createdAt: any;
    updatedAt: any;
    updatedBy: string;
}

export interface MunicipalLedgerEntry {
    id?: string;
    cityKey: string;
    rideId: string;
    paymentMethod: string;
    totalFare: number;
    municipalSharePercent: number;
    municipalShareAmount: number;
    source: 'cash' | 'wallet' | 'mercado_pago' | 'other';
    settlementStatus: 'paid_direct' | 'pending_transfer' | 'transferred' | 'failed';
    municipalityAccountId?: string;
    createdAt: any;
    settledAt?: any;
    transferredAt?: any;
    transferredBy?: string;
    transferReference?: string;
    periodWeekId?: string;
    periodMonthId?: string;
}

export type RideStatus =
    | "scheduled"
    | "pending_driver_assignment"
    | "searching"
    | "driver_assigned"
    | "confirmed"
    | "activating"
    | "driver_arrived"
    | "in_progress"
    | "paused"
    | "completed"
    | "cancelled"
    | "cancelled_by_passenger"
    | "cancelled_by_driver"
    | "expired"
    | "failed_no_driver";

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

export { normalizeCityKey } from "./lib/city";

export function buildMunicipalCode(cityKey: string, sequence: number): string {
    const prefix = cityKey.substring(0, 2).toUpperCase();
    const seq = sequence.toString().padStart(5, '0');
    return `${prefix}-${seq}`;
}

export type DriverStatus = "offline" | "inactive" | "online" | "in_ride";
export type DriverLevel = "bronce" | "plata" | "oro";
export type DriverSubtype = 'professional' | 'express' | 'taxi' | 'remis' | 'fleet_driver' | 'particular';

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
  | 'passengerCoverageInsurance'
  | 'vehicleModelYearProof';

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
  paymentLabel?: string;
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
    baseCommissionRate?: number;
    finalCommissionRate?: number;
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
    vamoExpressCoverageAmount?: number;
    creditCoveredAmount?: number;
    platformSubsidyAmount?: number;
    passengerPaysTotal?: number;
    vamoCommissionRate?: number;
    driverSubtypeSnapshot?: string;
    totalAmount?: number;
    municipalAmount?: number;
    vamoAmount?: number;
    driverEarnings?: number;
    socialSubsidyAmount?: number;
    // New fields for rentability audit
    grossFare?: number;
    passengerPays?: number;
    driverGrossAmount?: number;
    platformCommissionAmount?: number;
    municipalShareAmount?: number;
    netVamoRevenue?: number;
    taxiAssociationAmount?: number;
    remisAssociationAmount?: number;
    totalAssociationsAmount?: number;
    grossReceiptsAmount?: number;
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
    vehicleId?: string | null;
    vehicleOwnerId?: string; // [VamO PRO] Financial beneficiary
    settlementOwnerId?: string; // El UID que asume la deuda/comisión/recaudación del viaje
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
    activationStatus?: string | null;
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
    driverGenderPreference?: 'female' | 'any';
    femaleDriverRequested?: boolean;
    requestedByFemalePassenger?: boolean;
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
        originalTotal?: number;
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
        vamoExpressCoverageAmount?: number;
        creditCoveredAmount?: number;
        creditsApplied?: boolean;
        walletCoveredAmount?: number;
        cashToCollect?: number;
        pricingSnapshot?: PricingSnapshot;
        totalAmount?: number;
        commissionAmount?: number;
        commissionRate?: number;
        dynamic?: DynamicPricingSnapshot;
        tariffMode?: 'day' | 'night' | string;
        // --- Express Benefit Config ---
        expressBenefitApplied?: boolean;
        expressBenefitWeekId?: string;
        expressUsesThisWeek?: number;
        expressMaxUsesPerWeek?: number;
        passengerWeeklyTripsCount?: number;
        passengerExpressUnlockedAt?: any;
        passengerExpressExpiresAt?: any;
        originalFare?: number;
        driverRecognizedFare?: number;
        passengerPaysAmount?: number;
        driverWalletCreditAmount?: number;
        promoFundedBy?: string;
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
    
    // Payment & Commission metadata
    paymentProvider?: string;
    paymentMode?: "single_driver_no_split" | "marketplace_split" | string;
    paymentStatus?: string;
    mpPaymentId?: string;
    mpPaymentStatus?: string;
    mpPaymentStatusDetail?: string;
    mpPreferenceId?: string;
    vamoCommissionPercent?: number;
    vamoCommissionAmount?: number;
    marketplaceFeeApplied?: number;
    commissionCollectionStatus?: "internal_only" | "automatic_marketplace_fee" | string;
    driverGrossAmount?: number;
    splitApplied?: boolean;
    paidAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    
    // VamO Compartido V1
    rideType?: 'standard' | 'shared';
    isSharedRide?: boolean;
    sharedGroupId?: string;
    sharedRequestIds?: string[];
    passengerIds?: string[];
    sharedPassengerCount?: number;
    pickupStops?: Place[];
    dropoffStops?: Place[];
    orderedStops?: Array<{
        type: 'pickup' | 'dropoff';
        requestId: string;
        passengerId: string;
        location: Place;
        status?: 'pending' | 'arrived' | 'completed' | 'skipped';
        fareToCollect?: number;
        passengerName?: string;
        arrivedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
        completedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
        updatedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    }>;
    sharedPassengers?: Array<{
        requestId: string;       // [REQUIRED] Without this, acceptRideV2 cannot update requests
        passengerId: string;
        passengerName: string;
        pickupAddress: string;
        dropoffAddress: string;
        status: string;
        individualQuotedFare?: number;
        sharedFare?: number;
        savingsAmount?: number;
    }>;
    routePlan?: Array<{
        order: number;
        type: 'pickup' | 'dropoff';
        passengerId: string;
        passengerName: string;
        address: string;
        status: string;
    }>;
    sharedFarePerPassenger?: number;
    individualFareReference?: number;
    driverBenefitAmount?: number;
    driverBenefitPercent?: number;
    totalFare?: number;
    cashExpected?: number;
    sharedPricingSnapshot?: any;
    routeCompatibilitySnapshot?: any;
    sharedSettlementStatus?: 'pending_shared_settlement' | 'settling' | 'settled' | 'not_applicable' | 'failed' | 'none';
    sharedFinancialSummary?: any;
    sharedReceiptsGenerated?: boolean | 'not_applicable';
    sharedReceiptsGeneratedAt?: any;

    // Digital Stands (Paradas Digitales)
    stationDispatch?: boolean;
    stationDispatchType?: 'core_radius' | 'support_radius' | null;
    stationSupportPotential?: boolean;
    stationSupportFallback?: boolean;
    stationSupportReason?: string | null;
    stationId?: string | null;
    stationName?: string | null;
    stationDistanceMeters?: number | null;
    stationDispatchStatus?: 'pending_assignment' | 'assigned_to_driver' | 'pending_reassignment' | 'accepted_by_driver' | 'released_to_general_matching' | 'station_priority' | null;
    stationDispatchExpiresAt?: FirestoreTimestamp | null;
    stationAssignedDriverId?: string | null;
    stationReleasedToGeneralMatching?: boolean;
    stationReleasedAt?: FirestoreTimestamp | null;
    stationReleaseReason?: string | null;
}

export interface DriverStats {
    ridesCompleted: number;
    acceptanceRate: number;
    cancellationRate: number;
}

export interface EmailPreferences {
    transactionalEnabled: boolean;
    operationalEnabled: boolean;
    educationEnabled: boolean;
    weeklySummaryEnabled: boolean;
    highDemandEnabled: boolean;
    marketingEnabled: boolean;
}

export interface EmailState {
    sentTemplates: Record<string, string>; // templateName -> ISO timestamp
    lastInactiveReminderAt?: any; // Firestore Timestamp
    lastDriverInactiveReminderAt?: any; // Firestore Timestamp
}

export type DocumentRequestDocType = 
    | 'dni_front'
    | 'dni_back'
    | 'license'
    | 'insurance'
    | 'vehicle_front'
    | 'vehicle_back'
    | 'vehicle_interior'
    | 'cedula'
    | 'technical_inspection'
    | 'other';

export type DocumentRequestStatus = 'pending' | 'uploaded' | 'approved' | 'rejected';

export interface DocumentRequest {
    id: string;
    userId: string;
    docType: DocumentRequestDocType;
    status: DocumentRequestStatus;
    isMandatory: boolean;
    requestedAt: any;
    requestedBy: string;
    uploadedAt?: any;
    approvedAt?: any;
    approvedBy?: string;
    adminNote?: string;
    driverNote?: string;
    uploadedUrl?: string;
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
    reputationScore?: number;
    reputationLevel?: string;
    vamoScore?: number;
    vamoLevel?: string;
    suspensionReason?: string;
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
    emailPreferences?: EmailPreferences;
    emailState?: EmailState;
    legal?: {
        driverTermsAccepted?: boolean;
        driverTermsVersion?: string;
        driverTermsAcceptedAt?: any;
    };
    isSuspended?: boolean;
    lastActiveAt?: any;
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
    criminalRecordExpiry?: any;
    criminalRecordStatus?: string;
    docsStatus?: string;
    driverSubtype?: DriverSubtype;
    servicesOffered?: {
        express: boolean;
        professional: boolean;
    };
    passengerExpressBenefitActive?: boolean;
    passengerExpressDiscountPercent?: number;
    passengerProgress?: {
        ridesThisWeek: number;
        weekIdentifier: string; 
        weeklySubsidySpent?: number;
        currentLevel?: 'none' | 'unlocked_10' | 'unlocked_15';
        expressUsesThisWeek?: number;
    };    // --- OWNER / AUTHORIZED DRIVER SYSTEM ---
    vehicleOwnerId?: string;       // UID del dueño del vehículo / cuenta principal
    fleetApprovalStatus?: 'pending' | 'approved' | 'suspended' | 'unlinked'; // Estado de la vinculación
    authorizedDriverIds?: string[]; // UIDs de choferes autorizados por este dueño
    activeDriverId?: string;      // UID del chofer que está operando el vehículo actualmente
    isVehicleOwner?: boolean;     // Indica si el usuario es el dueño legal del vehículo
    
    // --- FINANCIAL CONTEXT ---   totalEarnings?: number;       
    settlementAccount?: string;   
    driverPreferences?: {
        acceptsExpress: boolean;
        acceptsDiscountedRides: boolean;
        acceptsPets: boolean;
    };
    mpLinked?: boolean;
    mpAccountStatus?: "linked" | "expired" | "revoked" | "error";
    mpLinkedAt?: any;
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
    hasMandatoryPendingDocs?: boolean;
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
    isSpecialVerified?: boolean;
    specialVerifiedType?: 'retired' | 'disabled' | null;
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
        vehicleModelYearProof?: string;
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
    activeSharedRequestId?: string | null; // VamO Compartido V1
    sharedRideAlphaTester?: boolean;
    stationId?: string;
    stationName?: string;
    mustChangePassword?: boolean;
    trafficSuspended?: boolean;
    trafficSuspensionReason?: string | null;
    trafficSuspendedAt?: any;
    trafficSuspendedBy?: string | null;
    trafficSuspensionResolvedAt?: any;
    trafficSuspensionResolvedBy?: string | null;
    municipalSuspended?: boolean;
    municipalSuspensionReason?: string | null;
    municipalSuspendedAt?: any;
    municipalSuspendedBy?: string | null;
    adminSuspended?: boolean;
    adminSuspensionReason?: string | null;
    adminSuspendedAt?: any;
    adminSuspendedBy?: string | null;
    suspensionSource?: 'traffic' | 'municipal' | 'admin' | null;
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
    lockedRideId?: string | null;
    lockedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    grossReceiptsBalance?: number;
    lastGrossReceiptsWithdrawalAt?: FirestoreTimestamp | FirestoreFieldValue | null;
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
    | 'adjustment'
    | 'gross_receipts_withheld'
    | 'gross_receipts_withdrawal';

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
    weeklyPoolContributionPerRide?: number;
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

    // VamO Compartido V1
    rideType?: 'standard' | 'shared';
    isSharedRide?: boolean;
    sharedGroupId?: string;
    sharedPassengerCount?: number;
    sharedFarePerPassenger?: number;
    pickupStopsCount?: number;
    dropoffStopsCount?: number;
    orderedStopsPreview?: Array<{
        type: 'pickup' | 'dropoff';
        location: Place;
    }>;
    sharedPassengers?: Array<{
        passengerId: string;
        passengerName: string;
        pickupAddress: string;
        dropoffAddress: string;
        individualQuotedFare: number;
        sharedFare: number;
        savingsAmount: number;
        status: string;
    }>;
    individualFareReference?: number;
    driverBenefitAmount?: number;
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
    smartPricingEnabled?: boolean;
    /** @deprecated Use global system_config/smart_pricing instead */
    dynamicPricing?: DynamicPricingConfig;
    sharedRideMaxOriginRadiusMeters?: number; // VamO Compartido V1
    nightSurchargeEnabled?: boolean;
    nightStartHour?: number;
    nightEndHour?: number;
    timezone?: string;
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
    isSpecialVerifiedDiscountApplied?: boolean;
    specialDiscountAmount?: number;
}

export interface PricingSnapshot {
    commission_particular: number;
    commission_taxi_remis: number;
    municipal_percentage?: number;
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
    weeklyPoints: number;
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

/** 
 * VamO Compartido V1 
 */
export type SharedRideRequestStatus = 
    | 'proposed' 
    | 'forming' 
    | 'pending_group'
    | 'grouped'
    | 'pending_confirmation' 
    | 'confirmed' 
    | 'assigned' 
    | 'pickup_pending'
    | 'picked_up'
    | 'dropoff_pending'
    | 'dropped_off'
    | 'completed'
    | 'cancelled' 
    | 'expired' 
    | 'no_show' 
    | 'undeclared_companion';

export type SharedRideGroupStatus = 
    | 'forming' 
    | 'pending_passenger_confirmation' 
    | 'searching_driver' 
    | 'driver_assigned' 
    | 'ready_for_driver'
    | 'completed' 
    | 'cancelled' 
    | 'expired';

export interface SharedRideRequest {
    id: string;
    passengerId: string;
    passengerName: string;
    cityKey: string;
    origin: Place;
    destination: Place;
    status: SharedRideRequestStatus;
    roleInGroup?: 'creator' | 'joined';
    individualFareReference: number;
    sharedFareEstimate?: number;
    finalFareCash?: number;
    paymentMethod: 'cash';
    passengerSavingAmount?: number;
    passengerSavingPercent?: number;
    confirmationExpiresAt?: FirestoreTimestamp | null;
    groupId?: string | null;
    finalRideId?: string | null;
    pickupStatus?: 'pending' | 'arrived' | 'picked_up';
    dropoffStatus?: 'pending' | 'dropped_off';
    noShow?: boolean;
    undeclaredCompanion?: boolean;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    passengerReceipt?: any;
    operationalReceipt?: any;
    sharedRideNoticeAccepted?: boolean;
    sharedRideNoticeAcceptedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    expiresAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    manualCreation?: boolean;
    selectedSeats?: Array<'front_passenger' | 'rear_left' | 'rear_center' | 'rear_right'>;
    seatCount?: number;
}
export interface SharedRideFeatureConfig {
    enabled: boolean;
    beta: boolean;
    cities: string[];
    requireAlphaTester: boolean;
    driverSearchEnabled?: boolean;
}

export interface SharedRideGroup {
    id: string;
    cityKey: string;
    status: SharedRideGroupStatus;
    requestIds: string[];
    passengerIds: string[];
    passengers?: Array<{
        passengerId: string;
        passengerName?: string;
        roleInGroup: 'creator' | 'joined';
        joinedAt: FirestoreTimestamp | FirestoreFieldValue;
        status: string;
        pickupAddress: string;
        dropoffAddress: string;
    }>;
    occupiedSeats: number;
    maxSeats: number;
    requestCount?: number;
    maxRequests?: number;
    seatMap?: {
        front_passenger?: { passengerId: string; requestId: string; passengerName: string };
        rear_left?: { passengerId: string; requestId: string; passengerName: string };
        rear_center?: { passengerId: string; requestId: string; passengerName: string };
        rear_right?: { passengerId: string; requestId: string; passengerName: string };
    };
    paymentMethod: 'cash';
    estimatedIndividualFare: number;
    sharedFarePerPassenger: number;
    estimatedSharedTotal: number;
    estimatedDriverTotal: number;
    driverBenefitAmount: number;
    driverBenefitPercent: number;
    passengerSavingAmount: number;
    passengerSavingPercent: number;
    pickupStops: Place[];
    dropoffStops: Place[];
    orderedStops: Array<{
        type: 'pickup' | 'dropoff';
        requestId: string;
        location: Place;
    }>;
    routeCompatibility?: any;
    driverId?: string | null;
    finalRideId?: string | null;
    expiresAt: FirestoreTimestamp;
    confirmationExpiresAt?: FirestoreTimestamp | null;
    driverSearchStartsAt?: FirestoreTimestamp | null;
    driverSearchTriggeredAt?: FirestoreTimestamp | null;
    closingExpiresAt?: FirestoreTimestamp | null;
    isPubliclyJoinable?: boolean;
    launchReason?: 'min_passengers_reached' | 'group_full' | 'ttl_expired' | 'manual' | null;
    minPassengersToLaunch?: number;
    hasMinimumPassengers?: boolean;
    creatorPassengerId?: string;
    createdByPassengerId?: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    driverSearchBlockedForBeta?: boolean;
    driverSearchBlockedReason?: string;
    driverSearchBlockedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
}

export interface MpAccount {
    userId: string;
    mpUserId?: string;
    status: "linked" | "expired" | "revoked" | "error";
    linkedAt: any;
    updatedAt: any;
    expiresAt?: any;
    country?: string;
    scope?: string;
    accessToken?: string;
    refreshToken?: string;
    publicKey?: string;
    lastError?: string;
}

export interface MpOAuthState {
    id: string;
    userId: string;
    createdAt: any;
    expiresAt: any;
    used: boolean;
}

export interface TrafficObservation {
    observationId: string;
    driverId: string;
    cityKey: string;
    createdBy: string;
    createdByRole: 'traffic_municipal' | 'traffic_operator' | 'admin' | string;
    source: 'traffic';
    type: 'document_request' | 'preventive_suspension' | 'field_observation' | 'incident' | 'expired_document' | 'missing_document' | string;
    severity: 'critical' | 'regularizable' | 'informative';
    status: 'open' | 'awaiting_driver_response' | 'pending_traffic_review' | 'approved' | 'rejected' | 'resolved' | 'expired' | 'escalated_to_municipality';
    requestedDocumentType: string;
    requestedDocumentLabel: string;
    reason: string;
    note?: string;
    createdAt: any;
    dueAt: any;
    countdownHours: number;
    driverSubmittedAt?: any;
    reviewedAt?: any;
    reviewedBy?: string;
    resolutionNote?: string;
    resolvedAt?: any;
    resolvedBy?: string;
    relatedDocumentId?: string;
    affectsMatching: boolean;
    autoSuspendAtDueDate: boolean;
}
