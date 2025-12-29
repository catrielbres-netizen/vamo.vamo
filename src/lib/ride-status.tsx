// @/lib/ride-status.tsx
import {
    Car,
    CircleDashed,
    Flag,
    MapPin,
    PartyPopper,
    UserCheck,
    Hourglass
  } from 'lucide-react';
  
export const RideStatusInfo: {
    [key: string]: { text: string; icon: React.ReactNode; progress: number };
} = {
    searching_driver: {
      text: 'Buscando conductor',
      icon: <CircleDashed className="animate-spin" />,
      progress: 20,
    },
    driver_assigned: {
      text: 'Conductor asignado',
      icon: <UserCheck />,
      progress: 40,
    },
    driver_arriving: {
      text: 'Conductor en camino',
      icon: <Car />,
      progress: 60,
    },
    arrived: {
      text: 'El conductor llegó',
      icon: <MapPin />,
      progress: 80,
    },
    in_progress: {
      text: 'Viaje en curso',
      icon: <Car className="animate-pulse" />,
      progress: 90,
    },
    paused: {
        text: 'Viaje pausado',
        icon: <Hourglass />,
        progress: 90,
    },
    finished: { text: 'Viaje finalizado', icon: <PartyPopper />, progress: 100 },
    cancelled: { text: 'Viaje cancelado', icon: <Flag />, progress: 0 },
};
  