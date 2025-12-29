// @/hooks/use-ride-simulation.ts
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { RideStatus } from '@/lib/types';

const SIMULATION_DELAYS: Record<RideStatus, number> = {
  confirmado: 3000,
  buscando: 5000,
  conductor_encontrado: 3000,
  en_camino: 5000,
  llegado: 3000,
  activo: 10000, // Ride duration
  pausado: 5000, // Pause duration
  solicitado: 0,
  finalizado: 0,
  cancelado: 0,
};

const NEXT_STATUS: Partial<Record<RideStatus, RideStatus>> = {
  confirmado: 'buscando',
  buscando: 'conductor_encontrado',
  conductor_encontrado: 'en_camino',
  en_camino: 'llegado',
  llegado: 'activo',
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
