
// src/lib/types.ts

import { type Timestamp } from "firebase/firestore";

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
  | "cancelled";

export type VerificationStatus = "unverified" | "pending_review" | "approved" | "rejected";

export type DriverStatus = "inactive" | "online" | "in_ride";

export type AuditLogAction = 
  | "driver_approved"
  | "driver_rejected"
  | "ride_cancelled_by_admin"
  | "ride_marked_as_audited";

export interface Place {
  address: string;
  lat: number;
  lng: number;
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
  };
  status: RideStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  finishedAt?: Timestamp | null;
  driverId?: string | null;
  driverName?: string | null;
  driverArrivalInfo?: {
    distanceMeters: number;
    durationSeconds: number;
  } | null;
  pauseStartedAt?: Timestamp | null;
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
  audited?: boolean;
}

export type UserProfile = {
    name: string;
    email: string;
    role: 'admin' | 'driver' | 'passenger';
    createdAt: any;
    updatedAt?: any;
    // Common fields
    phone?: string;
    photoURL?: string | null;
    averageRating?: number | null;
    ridesCompleted?: number;
    // Passenger fields
    vamoPoints?: number;
    activeBonus?: boolean;
    // Driver fields
    approved?: boolean;
    driverStatus?: DriverStatus;
    carModelYear?: number | null;
    vehicleVerificationStatus?: VerificationStatus;
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
    details?: string;
}
