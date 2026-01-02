
// @/lib/ride-status.tsx
  
export const RideStatusInfo: {
    [key: string]: { text: string; icon: string; progress: number };
} = {
    searching_driver: {
      text: 'Buscando conductor',
      icon: 'circle-dashed',
      progress: 15,
    },
    driver_assigned: {
      text: 'Conductor en camino',
      icon: 'user-check',
      progress: 30,
    },
    driver_arriving: {
      text: 'Tu conductor está en camino',
      icon: 'car',
      progress: 50,
    },
    arrived: {
      text: 'Tu conductor llegó al origen',
      icon: 'map-pin',
      progress: 75,
    },
    in_progress: {
      text: 'Viaje en curso',
      icon: 'car',
      progress: 90,
    },
    paused: {
        text: 'Viaje en espera',
        icon: 'hourglass',
        progress: 90,
    },
    finished: { text: 'Viaje finalizado', icon: 'check-circle', progress: 100 },
    cancelled: { text: 'Viaje cancelado', icon: 'flag', progress: 0 },
};
