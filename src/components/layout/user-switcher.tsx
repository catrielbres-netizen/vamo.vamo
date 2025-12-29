// @/components/layout/user-switcher.tsx
'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUsers } from '@/hooks/use-users';
import { useStore } from '@/lib/store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { UserRole } from '@/lib/types';

const roleNames: Record<UserRole, string> = {
    passenger: 'Pasajero',
    driver: 'Conductor',
    admin: 'Admin'
}

export function UserSwitcher() {
  const { users } = useUsers();
  const { currentUser } = useCurrentUser();
  const { setCurrentUserId } = useStore();

  if (!currentUser) return null;

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={currentUser.avatarUrl} />
        <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <Select value={currentUser.id} onValueChange={setCurrentUserId}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Seleccionar usuario" />
        </SelectTrigger>
        <SelectContent>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={user.avatarUrl} />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span>
                  {user.name} ({roleNames[user.role]})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
