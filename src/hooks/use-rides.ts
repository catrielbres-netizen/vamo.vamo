// @/hooks/use-rides.ts
import { useStore } from '@/lib/store';

export const useRides = () => {
  const { rides } = useStore();
  return { rides };
};

export const useRideById = (id: string) => {
  const { rides } = useStore();
  const ride = rides.find((r) => r.id === id);
  return { ride };
};
