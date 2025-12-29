// @/hooks/use-users.ts
import { useStore } from '@/lib/store';

export const useUsers = () => {
  const { users } = useStore();
  return { users };
};
