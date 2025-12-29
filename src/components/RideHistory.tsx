// src/components/RideHistory.tsx
'use client';

import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Skeleton } from './ui/skeleton';
import RideHistoryCard from './RideHistoryCard';

export default function RideHistory({ passengerId }: { passengerId: string }) {
  const firestore = useFirestore();

  const historyQuery = useMemoFirebase(
    () =>
      firestore && passengerId
        ? query(
            collection(firestore, 'rides'),
            where('passengerId', '==', passengerId),
            where('status', 'in', ['finished', 'cancelled']),
            orderBy('createdAt', 'desc')
          )
        : null,
    [firestore, passengerId]
  );

  const { data: rides, isLoading } = useCollection(historyQuery);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!rides || rides.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">No tenés viajes en tu historial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rides.map((ride) => (
        <RideHistoryCard key={ride.id} ride={ride} />
      ))}
    </div>
  );
}
