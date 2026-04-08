

// src/lib/types.ts

// Utility type to ensure a type has a non-optional `id` field.
export type WithId<T> = T & { id: string };

// Tipos agnósticos para evitar conflictos de build entre client y admin SDK.
export type FirestoreTimestamp = any;
export type FirestoreFieldValue = any;

export type ServiceType = "premium" | "express" | "normal";
export type VehicleType = "taxi" | "remis";

/**
 * Subtipo de conductor. Taxi y remis siguen el flujo VamO clásico.
 * "express" es el conductor particular habilitado por la municipalidad (VamoMuni).
 */
export type DriverSubtype = "taxi" | "remis" | "express";

export type Role = "admin" | "driver" | "passenger" | "admin_municipal";

// ESTADOS UNIFICADOS: La nueva fuente de verdad para toda la app.
export type RideStatus =
  | "searching"
  | "driver_assigned"
  | "driver_arrived"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

/**
 * Centrally defines which ride states allow triggering a Panic Alert.
 * Rule: Only visible during active transit (in_progress, paused).
 */
export const isPanicButtonVisible = (status: RideStatus): boolean => {
    return status === 'in_progress' || status === 'paused';
};

export type VerificationStatus = "unverified" | "pending_review" | "approved" | "rejected";
export type DocumentStatus = "valid" | "expired" | "pending_review" | "rejected";
export type MunicipalStatus = "approved" | "suspended" | "expired" | "pending_review";

export type AssistanceCaseStatus = 
    | "open" 
    | "under_review" 
    | "approved" 
    | "rejected" 
    | "paid" 
    | "cancelled";

export type AssistanceLevel = "T1" | "T2" | "T3" | "T4" | "T5";

export interface AssistanceCase {
    id?: string;
    caseId: string; // FAP-2026-000001
    rideId: string;
    passengerId: string;
    driverId: string;
    city: string;
    
    status: AssistanceCaseStatus;
    level: AssistanceLevel | null;
    
    // Financials
    requestedAmount: number;
    approvedAmount: number;
    currency: "ARS";
    
    // Incident Info
    incidentType: string;
    incidentDescription: string;
    evidence: string[]; // Links or Storage paths
    
    // Timeline
    submittedAt: FirestoreTimestamp | FirestoreFieldValue;
    reviewedAt?: FirestoreTimestamp | FirestoreFieldValue;
    resolvedAt?: FirestoreTimestamp | FirestoreFieldValue;
    paidAt?: FirestoreTimestamp | FirestoreFieldValue;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
    
    // Administration
    adminNotes?: string;
    rejectionReason?: string;
    resolvedBy?: string; // Admin UID
    
    // Inmutable Snapshots (Auditoria)
    rideSnapshot: {
        completedAt: FirestoreTimestamp | FirestoreFieldValue;
        serviceType: ServiceType;
        driverSubtype: string;
        origin: Place;
        destination: Place;
        totalFare: number;
        assistanceFeeApplied: number;
    };
    
    fraudFlags?: string[];
}


export type DriverStatus = "offline" | "inactive" | "online" | "in_ride";
export type DriverLevel = "bronce" | "plata" | "oro";

export type AuditLogAction =
  | "driver_approved"
  | "driver_rejected"
  | "ride_cancelled_by_admin"
  | "ride_marked_as_audited"
  | "ride_flagged_by_ai"
  | "platform_credit_adjusted"
  | "driver_suspended"
  | "driver_unsuspended";

export type PlatformTransactionType =
  | "credit_payment"   // Carga de saldo real (ej. Mercado Pago)
  | "credit_promo"     // Crédito promocional (ej. bono de bienvenida)
  | "debit_adjustment" // Ajuste manual de débito por admin
  | "credit_manual"   // Ajuste manual de crédito por admin
  | "commission_debit" // Nuevo tipo para comisiones de viaje
  | "admin_balance_adjustment" // Ajuste manual por el admin
  | "debit_withdrawal"; // New type for withdrawals

export type PaymentIntentStatus = "pending" | "approved" | "rejected" | "credited";


export interface PaymentIntent {
  id?: string;
  driverId: string;
  amount: number;
  status: PaymentIntentStatus;
  provider: "mercadopago";
  mpPreferenceId?: string;
  mpPaymentId?: string | null;
  note?: string;
  createdAt: FirestoreTimestamp | FirestoreFieldValue;
  updatedAt?: FirestoreTimestamp | FirestoreFieldValue;
}


export interface PlatformTransaction {
  id?: string; // Add id for keying in React components
  driverId: string;
  amount: number; // Positive for credit, negative for debit
  type: PlatformTransactionType;
  createdAt: FirestoreTimestamp | FirestoreFieldValue;
  source: "system" | "admin" | "ride_finish" | "mp_topup"; // Expanded source
  referenceId?: string; // ID of the ride, payment, etc.
  note?: string; // Motivo del ajuste manual, etc.
  reason?: string; // Additional reason field used by admin adjustments
  createdBy?: string; // UID of the admin making the adjustment
  status?: 'pending' | 'completed' | 'rejected' | 'credited' | 'failed'; // Transaction lifecycle status
  updatedAt?: FirestoreTimestamp | FirestoreFieldValue; 
}


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

export interface PricingConfig {
  version: number;
  DAY_BASE_FARE: number;
  DAY_PRICE_PER_100M: number;
  DAY_WAITING_PER_MIN: number;
  NIGHT_BASE_FARE: number;
  NIGHT_PRICE_PER_100M: number;
  NIGHT_WAITING_PER_MIN: number;
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
    pointsAwarded?: number;
    trackingStats: TrackingStats;
    calculatedAt: FirestoreTimestamp;
    driverSubtype: string; // [Vamo PRO v1.4]
    fapEligible: boolean; // [Vamo PRO v1.4]
}

// [VamO PRO v1.0] Internal Chat
export interface RideChatMessage {
    id: string;
    rideId: string;
    senderId: string;
    senderRole: 'passenger' | 'driver' | 'system';
    text: string;
    createdAt: FirestoreTimestamp;
    type: 'text' | 'system';
    status: 'sent' | 'delivered' | 'read';
    metadata?: Record<string, any>;
}

export interface RideChatSummary {
    lastMessageText?: string;
    lastMessageAt?: FirestoreTimestamp;
    lastMessageSenderId?: string;
    unreadCountPassenger: number;
    unreadCountDriver: number;
    chatAuditEligible: boolean;
    chatEnabled: boolean;
    chatClosedAt?: FirestoreTimestamp;
}

export interface Ride {
  id?: string;
  passengerId: string;
  driverId?: string | null;

  // [VamO PRO] Internal Chat v1.0
  chatSummary?: RideChatSummary;

  // --- DATOS OPERATIVOS ---
  status: RideStatus;
  serviceType: ServiceType;
  
  // --- TIMELINE ---
  createdAt: FirestoreTimestamp | FirestoreFieldValue;
  updatedAt: FirestoreTimestamp | FirestoreFieldValue;
  matchingExpiresAt?: FirestoreTimestamp | null;
  driverAssignedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
  arrivedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
  startedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
  completedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
  
  // --- GEOGRAFÍA ---
  origin: Place;
  destination: Place;

  // --- CANCELACIÓN ---
  cancelReason?: string | null;
  cancelledBy?: string | null;

  // --- DATOS DEL MATCHING ---
  isUrgent?: boolean;
  matchingStage?: string;
  matchingVersion?: string;

  // --- NOTIFICATIONS & ETA ---
  etaMinutes?: number | null;
  notifiedNear?: boolean | null;
  notifiedAccepted?: boolean | null;
  notifiedArrived?: boolean | null;
  notifiedPaused?: boolean | null;
  receiptSent?: boolean | null;

  driverLocationAtAccept?: {
    lat: number;
    lng: number;
    timestamp: FirestoreTimestamp;
  } | null;

  // --- SNAPSHOTS (al momento de aceptar) ---
  passengerName?: string | null;
  driverName?: string | null;
  driverRating?: number | null; // Rating del conductor en ese momento
  driverVehicle?: string | null;
  driverPlate?: string | null;
  driverVehiclePhoto?: string | null;
  driverPhotoUrl?: string | null;

  // --- PRICING ---
  pricing?: {
    estimated?: {
      total: number;
      breakdown: any;
      configSnapshot: any;
      calculatedAt: FirestoreTimestamp | FirestoreFieldValue;
    };
    final?: {
      total: number;
      breakdown: any;
      configSnapshot: any;
      calculatedAt: FirestoreTimestamp | FirestoreFieldValue;
    };
    // Sources of truth for money (PRO version)
    originalTotal?: number;
    driverReceivesTotal?: number;
    passengerPaysTotal?: number;
    discountAmount?: number;
    discountPercent?: number;
    compensationAmount?: number;
    discountType?: 'bonus10' | 'bonus20' | 'welcome' | 'referral' | null;
    discountFundedBy?: 'vamo' | null;
  };
  
  // --- EXPRESS & PROMO META ---
  expressMeta?: {
    passengerUnlockLevel: number;
    isExpressEligible: boolean;
    isDiscountApplied: boolean;
    compensationPendingAmount: number;
    compensationCredited: boolean;
    compensationCreditedAt?: FirestoreTimestamp | null;
    compensationTxId?: string;
    isWelcomeBonusApplied?: boolean;
    reason?: string;
  };
  
  // --- DATOS DE MATCHING Y RANKING ---
  currentOfferedDriverId?: string | null;
  matchingAttempts?: number;
  matchingStartedAt?: FirestoreTimestamp | null;
  rideMatchedAt?: FirestoreTimestamp | null;
  lastRadiusKm?: number;
  lastAttemptAt?: FirestoreTimestamp | null; // Added
  matchingScoreBoost?: number; // Added
  matchingLog?: {
    round: number;
    timestamp: any;
    radiusKm: number;
    candidatesFound: number;
    skipReasons: Record<string, number>;
    result: string;
  }[];

  // --- DATOS DE PAUSA Y ESPERA ---
  pauseStartedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
  pauseHistory?: { duration: number; reason: 'initial_wait' | 'driver_pause' }[];
  
  // --- DATOS DE FINALIZACIÓN Y LIQUIDACIÓN ---
  completedRide?: CompletedRide | null;
  settledAt?: FirestoreTimestamp | null;
  settlementError?: string | null;
  settlementTxId?: string | null;

  // --- LEGAL BLINDAJE ---
  legalLog?: {
    termsVersion: string;
    acceptedAt: any; // Firestore Timestamp
    ip?: string;
    userAgent?: string;
  };

  cancellationCompensatedAt?: FirestoreTimestamp | null;
  cancellationCompensationTxId?: string | null;
  
  // --- CALIFICACIONES (post-viaje) ---
  driverRatingByPassenger?: number | null;
  passengerRatingByDriver?: number | null;
  driverComments?: string | null;
  passengerComments?: string | null;
  vamoPointsAwarded?: number | null;
  
  cancelledAt?: FirestoreTimestamp | FirestoreFieldValue | null;
}

export interface DriverStats {
  ridesCompleted: number;
  acceptanceRate: number;
  cancellationRate: number;
}


export interface EmergencyContact {
  name: string;
  phone: string;
}

export type UserProfile = {
    // --- IDENTIDAD ---
    id?: any;
    uid?: string;
    name: string;
    surname?: string;
    displayName?: string;
    email: string;
    emailVerified?: boolean;
    phone?: string | null;
    role: Role;
    profileCompleted: boolean;
    photoURL?: string | null;
    gender?: 'male' | 'female' | null;
    welcomeBonus?: {
        available: boolean;
        used: boolean;
    };
    referredBy?: string | null;
    referredByCode?: string | null;
    referralCode?: string;
    referralRewardTriggered?: boolean;
    benefits?: {
        expressAvailable: boolean;
    };

    // --- UBICACIÓN OPERATIVA ---
    city?: string;
    cityKey?: string;
    country?: string;
    
    // --- TIMESTAMPS ---
    createdAt: any;
    updatedAt?: any;

    // --- ESTADO GENERAL ---
    isSuspended?: boolean;
    averageRating?: number | null;

    // --- PASAJERO ---
    vamoPoints?: number;
    activeBonus?: boolean;
    activeRideId?: string | null; 
    blockedUntil?: FirestoreTimestamp | null;
    emergencyContacts?: EmergencyContact[];
    
    // --- PASAJERO (VamO PRO Unlock System) ---
    passengerProgress?: {
        level: number;
        monthlyRides: number;
        currentMonth: string; // Format: "YYYY-MM"
    };
    
    // --- CONDUCTOR ---
    driverStatus?: DriverStatus;
    approved?: boolean;
    currentBalance?: number;
    nonWithdrawableBalance?: number;

    /**
     * VamoMuni: subtipo de conductor.
     * - "taxi" | "remis" → flujo clásico, sin intervención municipal VamoMuni
     * - "express"        → habilitación municipal obligatoria
     */
    driverSubtype?: DriverSubtype;
    municipalStatus?: MunicipalExpressStatus | null;
    municipalCode?: string | null;

    lastRideCompletedAt?: FirestoreTimestamp | null;

    // --- VEHÍCULO (CONDUCTOR) ---
    vehicleType?: VehicleType | null;
    vehicleModel?: string | null;
    vehicleColor?: string | null;
    plateNumber?: string | null;
    carModelYear?: number | null;
    licenseNumber?: string;
    licenseVerified?: boolean;
    vehicleVerificationStatus?: VerificationStatus;
    vehicleFrontPhotoURL?: string | null;
    serviceTier?: 'premium' | 'express';
    servicesOffered?: {
        normal: boolean;
        express: boolean;
        premium: boolean;
        pets?: boolean;
        scheduled?: boolean;
    };
    driverPreferences?: {
        acceptsExpress: boolean;
        acceptsDiscountedRides: boolean;
        acceptsPets: boolean;
    };

    // --- MÉTRICAS Y RANKING (CONDUCTOR) ---
    stats?: DriverStats;
    matchingScore?: number;
    ignoredCount?: number;
    cancelledCount?: number;
    acceptanceRate?: number;
    cancellationRate?: number;
    consecutiveIgnores?: number;
    weeklyCancellations?: number; // Added
    lastCancellationAt?: FirestoreTimestamp | null;

    // --- RECOMPENSAS (CONDUCTOR) ---
    rewardPoints?: number; // Historical/Accumulated
    weeklyPoints?: number; // Current week only (for levels/pooling)
    driverLevel?: DriverLevel;
    lastNotifiedPoints?: number | null; // Added

    // --- EXPRESS ACCESS (PASAJERO) ---
    expressAccess?: {
      unlockLevel: number;
      unlockedAt?: any;
      bonus10Available: number;
      bonus20Available: number;
      lastBonusUsedAt?: any;
      weeklyDiscountUsedAmount: number;
      totalDiscountUsedAmount: number;
    };
    passengerStats?: {
      completedRides: number;
      cancelledRides: number;
      expressRidesCompleted: number;
    };

    // --- FLAGS INTERNOS ---
    promoCreditGranted?: boolean; 
    fcmToken?: string | null; 
    fcmUpdatedAt?: any;

    // --- LEGAL & T&C (Centralizado) ---
    termsAccepted?: boolean;
    termsAcceptedAt?: any;
    termsVersion?: string;
};

export interface DriverPoints {
  weeklyPoints: number;
  totalPoints: number;
  updatedAt: FirestoreTimestamp;
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
    expiresAt: FirestoreTimestamp | FirestoreFieldValue;
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
  lastSeenAt: FirestoreTimestamp;
  driverStatus: DriverStatus;
  approved: boolean;
  isSuspended?: boolean;
  pendingOffers: number;
  city?: string | null;
  cityNormalized?: string | null;
  updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface WithdrawalRequest {
    id?: string;
    driverId: string;
    driverName: string;
    amount: number;
    status: 'pending' | 'approved' | 'rejected';
    bankInfo: {
        accountHolder: string;
        cbuOrAlias: string;
    };
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    processedAt?: FirestoreTimestamp | FirestoreFieldValue;
    processedBy?: string; // Admin UID
}

export interface Benefit {
    id?: string;
    name: string; // The generic name of the benefit, e.g., "15% off oil change"
    merchantName: string; // Who provides it, e.g., "YPF", "Lubricentro X"
    type: 'combustible' | 'taller' | 'lavadero' | 'repuestos' | 'otro' | string;
    discountPercent: number;
    description: string;
    address: string;
    city?: string; // e.g. "Trelew", "Rawson"
    isActive: boolean;
    conditions: string; // Who can use it
    limitDescription?: string; // e.g. "Tope $5000 mensual"
    applicationMethod?: string; // e.g. "Mostrá este QR en caja antes de facturar"
    logoUrl?: string;
    minLevel?: DriverLevel; // Required level to unlock this benefit
}

export interface PanicAlert {
    id?: string;
    rideId: string;
    uid: string;
    role: 'passenger' | 'driver';
    driverId: string;
    passengerId: string;
    location: {
        lat: number;
        lng: number;
    } | null;
    rideStatus: string;
    severity: 'critical';
    resolved: boolean;
    triggeredByUid: string;
    triggeredByRole: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    resolvedAt?: FirestoreTimestamp | FirestoreFieldValue;
    resolvedBy?: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  PROMOTIONS & BONUSES SYSTEM
// ════════════════════════════════════════════════════════════════════════════

export type PromotionTarget = 'driver' | 'passenger';
export type PromotionStatus = 'draft' | 'active' | 'paused' | 'expired';
export type PromotionContext = 'topup' | 'ride' | 'signup' | 'reactivation' | 'general';

export interface Promotion {
    id?: string;
    name: string;
    description: string;
    target: PromotionTarget;
    type: string; 
    status: PromotionStatus;
    enabled: boolean;
    priority: number;
    stackable: boolean;
    context: PromotionContext;
    
    city?: string | 'global';
    startsAt?: FirestoreTimestamp | null;
    endsAt?: FirestoreTimestamp | null;
    
    // Eligibility Conditions
    conditions: {
        minAmount?: number;
        maxAmount?: number;
        minRides?: number;
        userLevels?: string[];
        daysInactive?: number;
        isFirstAction?: boolean;
    };
    
    // Reward Definition
    reward: {
        type: 'fixed' | 'percentage';
        value: number;
        cap?: number; 
    };
    
    // Limits
    limits: {
        maxRedemptionsPerUser: number;
        maxTotalRedemptions?: number;
    };
    
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface PromotionRedemption {
    id: string; // Deterministic: `${promoId}_${userId}_${contextId}`
    promotionId: string;
    userId: string;
    role: Role;
    redeemedAt: FirestoreTimestamp | FirestoreFieldValue;
    rewardApplied: number;
    status: 'applied' | 'reserved' | 'reversed' | 'failed';
    
    // Optional context references
    rideId?: string;
    transactionId?: string;
}

export interface UserReward {
    id?: string;
    userId: string;
    type: "referral_bonus";
    valueType?: "percentage";
    value?: number;
    amount?: number;
    expiresAt: FirestoreTimestamp | FirestoreFieldValue;
    isUsed: boolean;
    usedAt?: FirestoreTimestamp | FirestoreFieldValue;
    rideId?: string;
    expiryNotified?: boolean;
    source: "referral";
    referralId: string;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

export interface Referral {
    id?: string;
    referrerId: string;
    referredId: string;
    referredUserName?: string | null;
    role: "passenger" | "driver";
    status: "pending" | "qualified" | "rewarded" | "fraud";
    rewardGranted: boolean;
    firstRideId?: string | null;
    campaign?: string | null;
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    rewardedAt?: FirestoreTimestamp | FirestoreFieldValue;
}

// ════════════════════════════════════════════════════════════════════════════
//  VAMOMUNI — Módulo de Habilitación Municipal de Conductores Express
// ════════════════════════════════════════════════════════════════════════════

/**
 * Estado municipal del conductor express.
 * Es la fuente de verdad para saber si puede operar.
 *
 * Transiciones válidas:
 *   pending_municipal_review → municipal_observed | municipal_approved | rejected_by_municipality
 *   municipal_observed       → pending_municipal_review | rejected_by_municipality
 *   municipal_approved       → active | suspended_expired_license | suspended_expired_insurance
 *                              | suspended_unpaid_canon | suspended_by_municipality
 *   active                   → renewal_under_review | suspended_* | rejected_by_municipality
 *   renewal_under_review     → active | municipal_observed
 *   suspended_*              → active (cuando la muni resuelve el problema)
 *   rejected_by_municipality → (estado terminal, requiere acción manual de admin)
 */
export type MunicipalExpressStatus =
    | "pending_municipal_review"      // Recién registrado, esperando revisión
    | "municipal_observed"            // Muni dejó observaciones, requiere corrección
    | "municipal_approved"            // Aprobado, pero documentación no está vigente todavía
    | "active"                        // Aprobado y toda la documentación vigente → PUEDE OPERAR
    | "renewal_under_review"          // Subió documentación nueva, muni revisando
    | "suspended_expired_license"     // Licencia vencida → NO puede operar
    | "suspended_expired_insurance"   // Seguro vencido → NO puede operar
    | "suspended_unpaid_canon"        // Canon municipal impago → NO puede operar
    | "suspended_by_municipality"     // Suspensión discrecional por la muni
    | "rejected_by_municipality";     // Rechazado definitivamente

/** Estados válidos de un ítem del checklist documental */
export type DocItemStatus = "pending" | "submitted" | "approved" | "observed";

/** Un ítem del checklist de documentación municipal */
export interface MunicipalDocItem {
    status: DocItemStatus;
    submittedAt?: FirestoreTimestamp | null;
    reviewedAt?: FirestoreTimestamp | null;
    reviewedBy?: string | null;     // uid del agente municipal
    observation?: string | null;    // texto libre de observación
    storageUrl?: string | null;     // URL del doc subido en Firebase Storage
}

/**
 * Checklist completo de documentación para conductor express.
 * La municipalidad gestiona cada ítem individualmente.
 */
export interface MunicipalChecklist {
    dniFront:               MunicipalDocItem;
    dniBack:                MunicipalDocItem;
    driverLicense:          MunicipalDocItem;
    vehicleInsurance:       MunicipalDocItem;
    vehicleRegistrationCard: MunicipalDocItem;
    criminalRecord:         MunicipalDocItem;
    municipalCanon:         MunicipalDocItem;
}

/** Claves válidas del checklist (para type-safety en loops) */
export type MunicipalChecklistKey = keyof MunicipalChecklist;

/** Estado del canon municipal */
export type CanonStatus = "pending" | "paid" | "overdue";

/**
 * Perfil municipal del conductor express.
 * Colección: `municipal_profiles/{driverId}`
 *
 * Separado de `users/{uid}` para:
 * - Reglas Firestore acotadas por rol
 * - No contaminar el perfil base
 * - Escalar independientemente del modelo de usuario
 */
export interface MunicipalProfile {
    driverId: string;                          // uid del conductor (FK a users)
    driverName?: string;                       // denormalizado para listados rápidos
    driverEmail?: string;                      // denormalizado
    chatSummary?: string;
    
    // ── Localidad ──────────────────────────────────────────────────────────
    city: string;                              // Nombre legible, ej: "Rawson"
    cityKey: string;                           // Clave normalizada, ej: "rawson" (minúsculas, sin acentos)

    // ── Identificación municipal ────────────────────────────────────────────
    municipalCode: string;                     // Código único legible, ej: "RAW-EXP-000123"

    // ── Estado ─────────────────────────────────────────────────────────────
    municipalStatus: MunicipalExpressStatus;
    canonStatus: CanonStatus;

    // ── Vencimientos (cargados por la municipalidad) ───────────────────────
    licenseExpiry?: FirestoreTimestamp | null;
    insuranceExpiry?: FirestoreTimestamp | null;
    backgroundCheckExpiry?: FirestoreTimestamp | null; // Antecedentes penales

    // ── Habilitación ───────────────────────────────────────────────────────
    enabledAt?: FirestoreTimestamp | null;
    enabledBy?: string | null;               // uid del agente municipal que habilitó
    canonPaidAt?: FirestoreTimestamp | null;
    canonPaidBy?: string | null;
    canonExpiry?: FirestoreTimestamp | null; // Fecha hasta la que es válido el pago

    // ── Documentación ──────────────────────────────────────────────────────
    checklist: MunicipalChecklist;

    // ── Observaciones municipales ──────────────────────────────────────────
    municipalObservation?: string | null;    // Observación general (visible al conductor)

    // ── Timestamps ────────────────────────────────────────────────────────
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    updatedAt: FirestoreTimestamp | FirestoreFieldValue;
}

/** Acciones registrables en el log de auditoría municipal */
export type MunicipalAuditAction =
    | "driver_registered_express"        // Conductor se registró como express
    | "checklist_item_approved"          // Muni aprobó un ítem del checklist
    | "checklist_item_observed"          // Muni marcó un ítem con observación
    | "canon_marked_paid"                // Muni marcó canon como pagado
    | "canon_marked_overdue"             // Muni marcó canon como vencido
    | "license_expiry_set"               // Muni cargó vencimiento de licencia
    | "insurance_expiry_set"             // Muni cargó vencimiento de seguro
    | "background_check_expiry_set"      // Muni cargó vencimiento de antecedentes
    | "canon_expiry_set"                 // Muni cargó vencimiento de canon
    | "driver_enabled"                   // Muni habilitó al conductor
    | "driver_suspended_by_municipality" // Muni suspendió al conductor
    | "driver_rejected"                  // Muni rechazó definitivamente
    | "renewal_document_submitted"       // Conductor subió documento de renovación
    | "renewal_approved"                 // Muni aprobó renovación
    | "renewal_rejected"                 // Muni rechazó renovación
    | "status_auto_suspended_expired"    // Sistema suspendió por vencimiento automático
    | "observation_added";               // Muni dejó observación general

/**
 * Registro de auditoría municipal.
 * Colección: `municipal_audit_log/{logId}`
 * Solo lectura para conductor, escritura exclusiva por backend/muni.
 */
export interface MunicipalAuditLog {
    id?: string;
    driverId: string;
    municipalCode: string;              // denormalizado para búsquedas rápidas
    cityKey: string;

    actionBy: string;                   // uid del agente (muni, sistema, conductor)
    actionByRole: Role | "system";
    action: MunicipalAuditAction;

    checklistKey?: MunicipalChecklistKey;  // si la acción se refiere a un ítem
    previousStatus?: string;
    newStatus?: string;
    note?: string;                      // texto libre opcional

    createdAt: FirestoreTimestamp | FirestoreFieldValue;
}

/**
 * Documento/renovación subida por el conductor.
 * Colección: `municipal_doc_submissions/{submissionId}`
 *
 * Se crea cuando el conductor sube un documento nuevo para revisión.
 * La muni lo revisa y actualiza el checklist si aprueba.
 */
export interface MunicipalDocSubmission {
    id?: string;
    driverId: string;
    municipalCode: string;              // denormalizado
    cityKey: string;

    docType: MunicipalChecklistKey;     // qué tipo de documento es
    storageUrl: string;                 // URL en Firebase Storage
    storagePath: string;                // path en Storage para gestión

    uploadedAt: FirestoreTimestamp | FirestoreFieldValue;

    status: "pending_review" | "approved" | "rejected";
    reviewedAt?: FirestoreTimestamp | null;
    reviewedBy?: string | null;         // uid del agente municipal
    observation?: string | null;

    // Si el documento tiene fecha de vencimiento (ej: seguro, licencia)
    documentExpiryDate?: FirestoreTimestamp | null;
}

// ════════════════════════════════════════════════════════════════════════════
//  Función auxiliar: generar cityKey normalizado
//  Usada al crear UNI de conductor express y en filtros municipales.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Convierte un nombre de ciudad a su clave normalizada.
 * Ejemplo: "Río Negro" → "rio-negro" | "Rawson" → "rawson"
 */
export function normalizeCityKey(city: string): string {
    return city
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // elimina diacríticos
        .replace(/[^a-z0-9]+/g, '-')    // reemplaza caracteres especiales con guión
        .replace(/^-+|-+$/g, '');        // elimina guiones al inicio/fin
}

/**
 * Genera el código municipal único para un conductor express.
 * Formato: "{CITY_PREFIX}-EXP-{NNNNNN}"
 * Ejemplo: "RAW-EXP-000042"
 *
 * La unicidad real se garantiza con un contador en Firestore (municipal_counters/{cityKey}).
 * Este helper solo formatea el código dado un prefijo y número.
 */
export function buildMunicipalCode(cityKey: string, sequence: number): string {
    const prefix = cityKey.slice(0, 3).toUpperCase();
    const seq    = String(sequence).padStart(6, '0');
    return `${prefix}-EXP-${seq}`;
}

export interface PricingConfig {
  version: number;
  DAY_BASE_FARE: number;
  DAY_PRICE_PER_100M: number;
  DAY_WAITING_PER_MIN: number;
  NIGHT_BASE_FARE: number;
  NIGHT_PRICE_PER_100M: number;
  NIGHT_WAITING_PER_MIN: number;
  PLATFORM_COMMISSION_RATE: number;
  /** [Vamo PRO v1.2] Aporte al Fondo de Asistencia al Pasajero (Solo Express) */
  ASSISTANCE_FEE: number;
  assistanceEnabled: boolean;
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
}

export interface CityConfig {
  cityKey: string;
  cityName: string;
  pricing: PricingConfig;
  updatedAt: any;
  updatedBy: string;
}

export interface SystemConfig {
  matchingEnabled: boolean;
  expressEnabled: boolean;
  globalMaintenance: boolean;
}

/**
 * [VamO PRO v1.0] Sistema de Reclamos F.A.P.
 */
export type FapStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type FapType = 'accident' | 'injury' | 'damage' | 'theft' | 'other';

export interface FapClaim {
    id: string;
    caseId: string;
    rideId: string;
    passengerId: string;
    driverId: string;
    
    status: FapStatus;
    type: FapType;
    description: string;
    evidenceUrls: string[];
    
    requestedAmount?: number;
    approvedAmount?: number;
    adminNotes?: string;
    rejectionReason?: string;
    
    rideSnapshot: {
        origin: string;
        destination: string;
        totalFare: number;
        completedAt: FirestoreTimestamp;
        driverSubtype: string;
        city?: string;
    };
    
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
    resolvedAt?: FirestoreTimestamp;
    paidAt?: FirestoreTimestamp;
    paymentTxId?: string;
}
