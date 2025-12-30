
'use client';

import Link from 'next/link';
import { UserCircle2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { doc } from 'firebase/firestore';


export function PassengerHeader({ userName, location }: { userName: string, location: string }) {
  const firestore = useFirestore();
  const { user } = useUser();
  
  const userProfileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: userProfile } = useDoc<UserProfile>(userProfileRef);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name[0];
  }

  return (
    <div className="p-4 border-b flex justify-between items-center">
      <div>
        <p className="text-sm text-gray-500">Hola, {userName} 👋</p>
        <p className="font-medium">📍 {location || 'Ubicación no disponible'}</p>
      </div>
      <Link href="/profile" passHref>
        <Avatar className="cursor-pointer">
            <AvatarImage src={userProfile?.photoURL || user?.photoURL || undefined} alt={userName} />
            <AvatarFallback>{getInitials(userName)}</AvatarFallback>
        </Avatar>
      </Link>
    </div>
  );
}
