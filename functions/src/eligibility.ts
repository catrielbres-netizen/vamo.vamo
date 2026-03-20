import { UserProfile, ServiceType } from "./types";

export const canDriverTakeRide = (driverProfile: UserProfile, rideService: ServiceType): boolean => {
  if (!driverProfile) return false;
  if (driverProfile.role !== 'driver') return false;
  if (!driverProfile.approved) return false;
  if (driverProfile.isSuspended) return false;
  if (driverProfile.activeRideId) return false;
  if ((driverProfile.currentBalance ?? 0) < 0) return false;

  const services = driverProfile.servicesOffered || {
    premium: false,
    express: false,
  };

  switch (rideService) {
    case 'premium':
      return services.premium === true;

    case 'express':
      return services.express === true;

    default:
      return false;
  }
}
