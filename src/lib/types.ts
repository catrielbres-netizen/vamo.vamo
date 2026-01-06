
// src/lib/types.ts

import { type Timestamp, type FieldValue } from "firebase/firestore";

export type ServiceType = "premium" | "privado" | "express";

export type Role = "admin" | "driver" | "passenger";

export type RideStatus = 
  | "searching_driver"
  | "driver_assigned"
  | "driver_arriving"
  | "arrived"
  | "in_progress"
  | "paused"
  | "finished"
  | "cancelled"
  | "expired";

export type VerificationStatus = "unverified" | "pending_review" | "approved" | "rejected";

export type DriverStatus = "inactive" | "online" | "in_ride";

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
  | "debit_commission" // Cobro de comisión por viaje
  | "credit_payment"   // Carga de saldo real (ej. Mercado Pago)
  | "credit_promo"     // Crédito promocional (ej. bono de bienvenida)
  | "debit_adjustment" // Ajuste manual de débito por admin
  | "credit_manual";   // Ajuste manual de crédito por admin

export type PaymentIntentStatus = "pending" | "approved" | "rejected" | "credited";


export interface PaymentIntent {
  id?: string;
  driverId: string;
  amount: number;
  status: PaymentIntentStatus;
  provider: "mercadopago";
  mpPreferenceId?: string;
  mpPaymentId?: string | null;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}


export interface PlatformTransaction {
  driverId: string;
  amount: number; // Positive for credit, negative for debit
  type: PlatformTransactionType;
  createdAt: Timestamp | FieldValue;
  source: "system" | "admin" | "ride_finish" | "mp_topup"; // Expanded source
  referenceId?: string; // ID of the ride, payment, etc.
  note?: string; // Motivo del ajuste manual, etc.
}


export interface Place {
  address: string;
  lat: number;
  lng: number;
}

export interface CompletedRide {
    distanceMeters: number;
    durationSeconds: number;
    waitingSeconds: number;
    totalPrice: number;
    finishedAt: Timestamp | FieldValue;
}

export interface Ride {
  passengerId: string;
  passengerName?: string | null;
  origin: {
    address: string;
    lat: number;
    lng: number;
  };
  destination: {
    address: string;
    lat: number;
    lng: number;
  };
  serviceType: ServiceType;
  pricing: {
    estimatedTotal: number;
    finalTotal?: number | null;
    estimatedDistanceMeters: number;
    estimatedDurationSeconds?: number | null;
    discountAmount?: number | null;
    rideCommission?: number | null; // Commission for this specific ride
  };
  status: RideStatus;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  finishedAt?: Timestamp | FieldValue | null;
  driverId?: string | null;
  driverName?: string | null;
  driverArrivalInfo?: {
    distanceMeters: number;
    durationSeconds: number;
  } | null;
  pauseStartedAt?: Timestamp | FieldValue | null;
  pauseHistory?: {
    started: Timestamp;
    ended: Timestamp;
    duration: number; // in seconds
  }[];
  passengerRating?: number | null;
  driverRating?: number | null;
  passengerComments?: string | null;
  driverComments?: string | null;
  vamoPointsAwarded?: number | null;
  audited: boolean;
  auditComment?: string | null;
  completedRide?: CompletedRide | null;
  // --- New fields for dispatch queue ---
  candidates: string[]; // Array of driver UIDs
  currentCandidateIndex: number;
  expiresAt?: Timestamp | FieldValue | null;
}

export type UserProfile = {
    id?: any;
    name: string;
    lastName?: string | null;
    email: string;
    role: 'admin' | 'driver' | 'passenger';
    createdAt: any;
    updatedAt?: any;
    profileCompleted: boolean;
    // Common fields
    phone?: string | null;
    photoURL?: string | null;
    fcmToken?: string | null; // For Push Notifications
    fcmUpdatedAt?: any;
    averageRating?: number | null;
    ridesCompleted: number; // Canonical counter
    isSuspended?: boolean;
    // Passenger fields
    vamoPoints?: number;
    activeBonus?: boolean;
    // Driver fields
    approved?: boolean;
    driverStatus?: DriverStatus;
    carModelYear?: number | null;
    vehicleVerificationStatus?: VerificationStatus;
    platformCreditPaid: number; // Canonical balance from real money top-ups
    promoCreditGranted?: boolean; // Flag to ensure promo is granted only once
    currentLocation?: {
      lat: number;
      lng: number;
    } | null;
};

export interface DriverSummary {
    driverId: string;
    weekId: string; // e.g., "2024-W28"
    totalEarnings: number;
    commissionOwed: number;
    commissionRate: number;
    bonusesApplied: number;
    status: 'pending' | 'paid';
    updatedAt: Timestamp;
}

export interface AuditLog {
    adminId: string;
    adminName: string;
    action: AuditLogAction;
    entityId: string; // ID of the ride, driver, etc.
    timestamp: Timestamp;
    details?: string | null;
}
