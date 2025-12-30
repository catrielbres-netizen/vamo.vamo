
'use client';

import Link from 'next/link';
import { UserCircle2 } from 'lucide-react';

export function PassengerHeader({ userName, location }: { userName: string, location: string }) {
  return (
    <div className="p-4 border-b flex justify-between items-center">
      <div>
        <p className="text-sm text-gray-500">Hola, {userName} 👋</p>
        <p className="font-medium">📍 {location || 'Ubicación no disponible'}</p>
      </div>
      <Link href="/profile" passHref>
        <UserCircle2 className="w-8 h-8 text-muted-foreground hover:text-primary cursor-pointer" />
      </Link>
    </div>
  );
}
