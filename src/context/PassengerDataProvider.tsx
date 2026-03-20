'use client';

import React from 'react';
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { query, collection, where, limit } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';

interface PassengerDataContextType {
  completedRides: WithId<Ride>[] | null;
  isHistoryLoading: boolean;
}

const PassengerDataContext = createContext<PassengerDataContextType>({
  completedRides: null,
  isHistoryLoading: true,
});

export const usePassengerData = () => useContext(PassengerDataContext);

export function PassengerDataProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const firestore = useFirestore();

  const completedRidesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'rides'),
        where('passengerId', '==', user.uid),
        where('status', '==', 'completed'),
        limit(50)
    );
  }, [firestore, user?.uid]);

  const { data: completedRides, isLoading: isHistoryLoading } = useCollection<WithId<Ride>>(completedRidesQuery);

  const value = useMemo(() => ({
    completedRides,
    isHistoryLoading,
  }), [completedRides, isHistoryLoading]);

  return (
    <PassengerDataContext.Provider value={value}>
      {children}
    </PassengerDataContext.Provider>
  );
}
