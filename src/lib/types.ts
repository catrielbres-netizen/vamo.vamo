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
}
