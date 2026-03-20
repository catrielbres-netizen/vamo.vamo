'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useUser } from '@/firebase/auth/use-user';
import { ThemeSwitcher } from './ThemeSwitcher';


export function PassengerHeader({ userName, location }: { userName: string, location: string }) {
  const { user } = useUser();
  
  const getInitials = (name: string | null | undefined) => {
    if (!name || name === "Invitado") return '?';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name[0];
  }

  return (
    <div className="flex justify-between items-center">
      <div>
        <p className="text-sm text-muted-foreground">Hola, {userName} 👋</p>
        <p className="font-medium">📍 {location || 'Ubicación no disponible'}</p>
      </div>
      <div className="flex items-center gap-4">
        <ThemeSwitcher />
        <Avatar>
            <AvatarImage src={user?.photoURL || undefined} alt={userName} />
            <AvatarFallback>{getInitials(userName)}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
