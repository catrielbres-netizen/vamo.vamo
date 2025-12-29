// @/hooks/use-current-user.ts
import { useStore } from '@/lib/store';

export const useCurrentUser = () => {
  const { currentUserId, users } = useStore();
  const currentUser = users.find((u) => u.id === currentUserId);
  return { currentUser };
};
