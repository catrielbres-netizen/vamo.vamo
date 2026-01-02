
// @/lib/ride-status.tsx
import { VamoIcon } from '@/components/icons';
  
export const RideStatusInfo: {
    [key: string]: { text: string; icon: React.ReactNode; progress: number };
} = {
    searching_driver: {
      text: 'Buscando conductor',
      icon: <VamoIcon name="CircleDashed" className="animate-spin" />,
      progress: 15,
    },
    driver_assigned: {
      text: 'Conductor en camino',
      icon: <VamoIcon name="UserCheck" />,
      progress: 30,
    },
    driver_arriving: {
      text: 'Tu conductor está en camino',
      icon: <VamoIcon name="Car" />,
      progress: 50,
    },
    arrived: {
      text: 'Tu conductor llegó al origen',
      icon: <VamoIcon name="MapPin" />,
      progress: 75,
    },
    in_progress: {
      text: 'Viaje en curso',
      icon: <VamoIcon name="Car" className="animate-pulse" />,
      progress: 90,
    },
    paused: {
        text: 'Viaje en espera',
        icon: <VamoIcon name="Hourglass" />,
        progress: 90,
    },
    finished: { text: 'Viaje finalizado', icon: <VamoIcon name="CheckCircle2" />, progress: 100 },
    cancelled: { text: 'Viaje cancelado', icon: <VamoIcon name="Flag" />, progress: 0 },
};
