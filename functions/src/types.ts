

// src/functions/src/types.ts
// This file is intended for Cloud Functions and uses the admin SDK types.

import * as admin from 'firebase-admin';

export type FirestoreTimestamp = admin.firestore.Timestamp;
export type FirestoreFieldValue = admin.firestore.FieldValue;

export type ServiceType = "premium" | "express" | "normal";
export type VehicleType = "taxi" | "remis";

export type Role = "admin" | "driver" | "passenger" | "admin_municipal";

export type RideStatus =
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

export type DriverStatus = "offline" | "inactive" | "online" | "in_ride";
export type DriverLevel = "bronce" | "plata" | "oro";

export interface Place {
    address: string;
    lat: number;
    lng: number;
    city?: string;
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
    fapFee?: number;
    pointsAwarded?: number;
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

    status: RideStatus;
    serviceType: ServiceType;
    city?: string;
    country?: string;

    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    driverAssignedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    arrivedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    startedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
    completedAt?: FirestoreTimestamp | FirestoreFieldValue | null;

    origin: Place;
    destination: Place;

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
    driverPhotoUrl?: string | null;

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
    };
    chatSummary?: RideChatSummary;
    totalIgnores?: number;
}

export interface DriverStats {
    ridesCompleted: number;
    acceptanceRate: number;
    cancellationRate: number;
}

export interface UserProfile {
    id?: any;
    uid: string; // Atomic UID
    name: string;
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

    activeRideId?: string | null;

    driverStatus?: DriverStatus;
    approved?: boolean;
    currentBalance?: number;
    nonWithdrawableBalance?: number;
    lastRideCompletedAt?: FirestoreTimestamp | null;

    vehicleType?: VehicleType | null;
    vehicleModel?: string | null;
    vehicleColor?: string | null;
    plateNumber?: string | null;
    carModelYear?: number | null;
    licenseNumber?: string;
    licenseVerified?: boolean;
    vehicleVerificationStatus?: VerificationStatus;

    driverSubtype?: 'premium' | 'express';
    municipalStatus?: string;

    servicesOffered?: {
        express: boolean;
        premium: boolean;
        normal: boolean;
    };

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

    stats?: DriverStats;

    rewardPoints?: number;
    weeklyPoints?: number;
    driverLevel?: DriverLevel;
    vamoPoints?: number;

    promoCreditGranted?: boolean;
    fcmToken?: string | null;
    fcmUpdatedAt?: any;

    weeklyCancellations?: number;
    lastCancellationAt?: FirestoreTimestamp | null;
    blockedUntil?: FirestoreTimestamp | null;

    operatingAreaId?: string;
    passengerProgress?: {
        monthlyRides: number;
        currentMonth: string;
    };

    legalAcceptanceLog?: {
        termsVersion: string;
        acceptedAt: FirestoreTimestamp;
        userAgent: string;
        ip: string;
    }[];
}

export type FapType = "accident" | "vandalism" | "robbery" | "medical" | "other";

export interface FapClaim {
    id: string;
    caseId: string;
    rideId: string;
    passengerId: string;
    driverId: string;
    cityKey: string;
    status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'paid' | 'cancelled';
    type: FapType;
    description: string;
    evidenceUrls: string[];
    requestedAmount: number;
    approvedAmount?: number;
    adminNotes?: string;
    rejectionReason?: string;
    resolvedBy?: string;
    rideSnapshot: {
        origin: string;
        destination: string;
        totalFare: number;
        completedAt: any;
        driverSubtype: string;
        city: string | null | undefined;
        cityKey?: string;
        serviceType?: string;
    };
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    resolvedAt?: FirestoreTimestamp | FirestoreFieldValue;
    paidAt?: FirestoreTimestamp | FirestoreFieldValue;
    paymentTxId?: string;
}

export interface FapCounter {
    year: number;
    lastNumber: number;
}

export interface Promotion {
    id: string;
    name: string;
    enabled: boolean;
    status: 'active' | 'inactive' | 'scheduled';
    target: 'passenger' | 'driver';
    context: 'topup' | 'ride' | 'registration';
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

export type PromotionContext = 'topup' | 'ride' | 'registration';

export interface SystemConfig {
    matchingEnabled: boolean;
    expressEnabled: boolean;
    globalMaintenance: boolean;
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
    status: 'pending' | 'completed' | 'expired';
    rewardAmount: number;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface UserReward {
    id: string;
    userId: string;
    type: string;
    amount: number;
    status: 'available' | 'used';
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
    totalPoints: number;
    updatedAt: FirestoreTimestamp;
    lastResetAt?: FirestoreTimestamp | FirestoreFieldValue;
}

export interface RewardsConfig {
    weeklyPoolAmount: number;
    minPointsToQualify: number;
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

    // Express / Promo metadata (VamO PRO)
    isDiscountApplied?: boolean;
    compensationAmount?: number;
    passengerPaysTotal?: number;
    driverReceivesTotal?: number;
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

export type WithId<T> = T & { id: string };
