// @/lib/types.ts

export type UserRole = 'passenger' | 'driver' | 'admin';

export type User = {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl: string;
};

export type RideService = 'Premium' | 'Privado' | 'Express';

export type RideStatus =
  | 'requested'
  | 'confirmed'
  | 'searching'
  | 'driver_found'
  | 'en_route'
  | 'arrived'
  | 'active'
  | 'paused'
  | 'finished'
  | 'cancelled';

export type Ride = {
  id: string;
  passenger: User;
  driver?: User;
  origin: string;
  destination: string;
  serviceType: RideService;
  status: RideStatus;
  fare?: number;
  distanceMeters?: number;
  estimatedTimeMinutes?: number;
  startTime?: number;
  endTime?: number;
  pauseDuration: number; // in seconds
  lastPauseTime?: number;
};
