// @/lib/ride-status.tsx
import {
    Car,
    CircleDashed,
    Flag,
    MapPin,
    PartyPopper,
    UserCheck,
    Hourglass,
    Play,
    CheckCircle2
  } from 'lucide-react';
  
export const RideStatusInfo: {
    [key: string]: { text: string; icon: React.ReactNode; progress: number };
} = {
    searching_driver: {
      text: 'Buscando conductor',
      icon: <CircleDashed className="animate-spin" />,
      progress: 15,
    },
    driver_assigned: {
      text: '¡Conductor asignado!',
      icon: <UserCheck />,
      progress: 30,
    },
    driver_arriving: {
      text: 'Tu conductor está en camino',
      icon: <Car />,
      progress: 50,
    },
    arrived: {
      text: 'Tu conductor llegó al origen',
      icon: <MapPin />,
      progress: 75,
    },
    in_progress: {
      text: 'Viaje en curso',
      icon: <Car className="animate-pulse" />,
      progress: 90,
    },
    paused: {
        text: 'Viaje en espera',
        icon: <Hourglass />,
        progress: 90,
    },
    finished: { text: 'Viaje finalizado', icon: <CheckCircle2 />, progress: 100 },
    cancelled: { text: 'Viaje cancelado', icon: <Flag />, progress: 0 },
};
