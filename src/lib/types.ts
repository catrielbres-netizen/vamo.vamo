

// src/lib/types.ts

// Utility type to ensure a type has a non-optional `id` field.
export type WithId<T> = T & { id: string };

// Tipos agnósticos para evitar conflictos de build entre client y admin SDK.
export type FirestoreTimestamp = any;
export type FirestoreFieldValue = any;

export type ServiceType = "premium" | "express";
export type VehicleType = "taxi" | "remis";

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

export type VerificationStatus = "unverified" | "pending_review" | "approved" | "rejected";
export type DocumentStatus = "valid" | "expired" | "pending_review" | "rejected";
export type MunicipalStatus = "approved" | "suspended" | "expired" | "pending_review";


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
}


export interface Place {
  address: string;
  lat: number;
  lng: number;
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
    pointsAwarded?: number;
    trackingStats: TrackingStats;
    calculatedAt: FirestoreTimestamp;
}

// ESTRUCTURA DE VIAJE UNIFICADA
export interface Ride {
  id?: string;
  passengerId: string;
  driverId?: string | null;

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

  // --- DATOS DEL MATCHING ---
  isUrgent?: boolean;
  notifiedDrivers?: string[];
  matchingStage?: string;
  matchingVersion?: string;

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

  // --- PRICING ---
  pricing: {
    estimatedTotal: number;
    finalTotal?: number | null;
    estimatedDistanceMeters: number;
    estimatedDurationSeconds?: number;
    surgeMultiplier?: number;
    discountAmount?: number | null;
  };
  
  // --- DATOS DE PAUSA Y ESPERA ---
  pauseStartedAt?: FirestoreTimestamp | FirestoreFieldValue | null;
  pauseHistory?: { duration: number; reason: 'initial_wait' | 'driver_pause' }[];
  
  // --- DATOS DE FINALIZACIÓN Y LIQUIDACIÓN ---
  completedRide?: CompletedRide | null;
  settledAt?: FirestoreTimestamp | null;
  settlementError?: string | null;
  
  // --- CALIFICACIONES (post-viaje) ---
  driverRatingByPassenger?: number | null;
  passengerRatingByDriver?: number | null;
  driverComments?: string | null;
  passengerComments?: string | null;
  vamoPointsAwarded?: number | null;
  
  // --- DATOS DE CANCELACIÓN ---
  cancelledBy?: 'passenger' | 'driver' | 'system' | null;
  cancelReason?: string | null;
  cancelledAt?: FirestoreTimestamp | FirestoreFieldValue | null;
}

export interface DriverStats {
  ridesCompleted: number;
  acceptanceRate: number;
  cancellationRate: number;
}


export type UserProfile = {
    // --- IDENTIDAD ---
    id?: any;
    name: string;
    email: string;
    phone?: string | null;
    role: Role;
    profileCompleted: boolean;
    photoURL?: string | null;

    // --- UBICACIÓN OPERATIVA ---
    city?: string;
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
    weeklyCancellations?: number;
    lastCancellationAt?: FirestoreTimestamp | null;
    blockedUntil?: FirestoreTimestamp | null;
    
    // --- CONDUCTOR ---
    driverStatus?: DriverStatus;
    approved?: boolean;
    currentBalance?: number;
    nonWithdrawableBalance?: number;

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
    serviceTier?: 'premium' | 'express';
    servicesOffered?: {
        express: boolean;
        premium: boolean;
    };

    // --- MÉTRICAS (CONDUCTOR) ---
    stats?: DriverStats;

    // --- RECOMPENSAS (CONDUCTOR) ---
    rewardPoints?: number;
    driverLevel?: DriverLevel;

    // --- FLAGS INTERNOS ---
    promoCreditGranted?: boolean; // Flag to ensure promo is granted only once
    fcmToken?: string | null; // For Push Notifications
    fcmUpdatedAt?: any;
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
