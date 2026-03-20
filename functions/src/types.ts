

// src/functions/src/types.ts
// This file is intended for Cloud Functions and uses the admin SDK types.

import * as admin from 'firebase-admin';

export type FirestoreTimestamp = admin.firestore.Timestamp;
export type FirestoreFieldValue = admin.firestore.FieldValue;

export type ServiceType = "premium" | "express";
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
export type MunicipalStatus = "approved" | "suspended" | "expired" | "pending_review";

export type DriverStatus = "offline" | "inactive" | "online" | "in_ride";
export type DriverLevel = "bronce" | "plata" | "oro";

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

  pricing?: {
    estimatedTotal: number;
    finalTotal?: number | null;
    estimatedDistanceMeters: number;
    estimatedDurationSeconds?: number;
    surgeMultiplier?: number;
    discountAmount?: number | null;
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
}

export interface DriverStats {
  ridesCompleted: number;
  acceptanceRate: number;
  cancellationRate: number;
}

export interface UserProfile {
    id?: any;
    name: string;
    email: string;
    phone?: string | null;
    role: Role;
    profileCompleted: boolean;
    photoURL?: string | null;

    city?: string;
    country?: string;
    
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
    
    serviceTier?: 'premium' | 'express';
    servicesOffered?: {
        express: boolean;
        premium: boolean;
    };

    stats?: DriverStats;

    rewardPoints?: number;
    driverLevel?: DriverLevel;
    vamoPoints?: number;

    promoCreditGranted?: boolean; 
    fcmToken?: string | null; 
    fcmUpdatedAt?: any;
    
    weeklyCancellations?: number;
    lastCancellationAt?: FirestoreTimestamp | null;
    blockedUntil?: FirestoreTimestamp | null;
}


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
  expiresAt: FirestoreTimestamp;
  finalizedAt?: FirestoreTimestamp | FirestoreFieldValue;
  round: number;

  // Denormalized ride data for driver display
  origin: Place;
  destination: Place;
  serviceType: ServiceType;
  estimatedTotal: number;
  passengerName: string;
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
    bankInfo: {
        accountHolder: string;
        cbuOrAlias: string;
    };
    createdAt: FirestoreTimestamp | FirestoreFieldValue;
    processedAt?: FirestoreTimestamp | FirestoreFieldValue;
    processedBy?: string; // Admin UID
}

export type WithId<T> = T & { id: string };
