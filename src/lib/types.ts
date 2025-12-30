// src/lib/types.ts

import { type Timestamp } from "firebase/firestore";

export type ServiceType = "premium" | "privado" | "express";

export type RideStatus = 
  | "searching_driver"
  | "driver_assigned"
  | "driver_arriving"
  | "arrived"
  | "in_progress"
  | "paused"
  | "finished"
  | "cancelled";

export interface Ride {
  passengerId: string;
  passengerName?: string | null;
  origin: {
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
    discountAmount?: number | null;
  };
  status: RideStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  finishedAt?: Timestamp | null;
  driverId?: string | null;
  driverName?: string | null;
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
}

export interface UserProfile {
  name: string;
  photoURL?: string | null;
  createdAt: Timestamp;
  vamoPoints: number;
  averageRating: number | null;
  ridesCompleted: number;
  activeBonus: boolean;
  isDriver?: boolean;
  carModelYear?: number;
}

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
