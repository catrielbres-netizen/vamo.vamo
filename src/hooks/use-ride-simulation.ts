// @/hooks/use-ride-simulation.ts
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { RideStatus } from '@/lib/types';

const SIMULATION_DELAYS: Record<RideStatus, number> = {
  confirmed: 3000,
  searching: 5000,
  driver_found: 3000,
  en_route: 5000,
  arrived: 3000,
  active: 10000, // Ride duration
  paused: 5000, // Pause duration
  requested: 0,
  finished: 0,
  cancelled: 0,
};

const NEXT_STATUS: Partial<Record<RideStatus, RideStatus>> = {
  confirmed: 'searching',
  searching: 'driver_found',
  driver_found: 'en_route',
  en_route: 'arrived',
  arrived: 'active',
};

export const useRideSimulation = (rideId: string) => {
  const { rides, updateRideStatus } = useStore();
  const ride = rides.find((r) => r.id === rideId);

  useEffect(() => {
    if (!ride) return;

    const currentStatus = ride.status;
    const nextStatus = NEXT_STATUS[currentStatus];

    if (nextStatus) {
      const delay = SIMULATION_DELAYS[currentStatus];
      const timer = setTimeout(() => {
        updateRideStatus(rideId, nextStatus);
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [ride, rideId, updateRideStatus]);
};
