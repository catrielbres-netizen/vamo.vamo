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
    <div className="flex justify-between items-center pt-2 pb-2">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
          Hola, {userName.split(' ')[0]} 👋
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-900/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5 shadow-sm">
             <VamoIcon name="star" className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
             <span className="font-bold text-xs text-zinc-200">{formatRating(profile?.averageRating)}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-indigo-500/10 backdrop-blur-md px-2.5 py-1 rounded-full border border-indigo-500/20 shadow-sm">
             <VamoIcon name="map-pin" className="w-3.5 h-3.5 text-indigo-400" />
             <span className="font-bold text-xs text-indigo-200">{location || profile?.city || 'VamO'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell role="passenger" />
        <Avatar className="h-12 w-12 border-2 border-white/10 shadow-xl bg-zinc-900">
            <AvatarImage src={user?.photoURL || undefined} alt={userName} className="object-cover" />
            <AvatarFallback className="bg-indigo-600 text-white font-black text-lg">{getInitials(userName)}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
