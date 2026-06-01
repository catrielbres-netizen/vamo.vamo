'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useUser } from '@/firebase/auth/use-user';
import { ThemeSwitcher } from './ThemeSwitcher';
import { VamoIcon } from './VamoIcon';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { formatRating } from '@/lib/formatters';
import { NotificationBell } from './NotificationBell';

export function PassengerHeader({ userName, location }: { userName: string, location: string }) {
  const { user, profile } = useUser();
  
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
      <div className="flex items-center gap-3">
        <VamoLogo variant="navbar" />
        <div>
          <p className="text-sm text-muted-foreground">Hola, {userName} 👋</p>
          <div className="flex items-center gap-1.5 mt-0.5">
           <VamoIcon name="star" className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
           <span className="font-bold text-sm text-foreground">{formatRating(profile?.averageRating)}</span>
           <span className="text-muted-foreground mx-1">•</span>
           <span className="font-medium text-sm">📍 {location || profile?.city || 'VamO'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ThemeSwitcher />
        <NotificationBell role="passenger" />
        <Avatar className="border border-white/10 shadow-sm">
            <AvatarImage src={user?.photoURL || undefined} alt={userName} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold">{getInitials(userName)}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
