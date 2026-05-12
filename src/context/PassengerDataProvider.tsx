'use client';

import React from 'react';
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection, useFirebaseApp } from '@/firebase';
import { query, collection, where, limit, orderBy } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';

import { getFunctions, httpsCallable } from 'firebase/functions';
import { useState, useEffect } from 'react';

interface PassengerDataContextType {
  completedRides: WithId<Ride>[] | null;
  isHistoryLoading: boolean;
  isGrantingBonus: boolean;
}

const PassengerDataContext = createContext<PassengerDataContextType>({
  completedRides: null,
  isHistoryLoading: true,
  isGrantingBonus: false,
});

export const usePassengerData = () => useContext(PassengerDataContext);

export function PassengerDataProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const [isGrantingBonus, setIsGrantingBonus] = useState(false);
  const welcomeTriggered = React.useRef(false);

  useEffect(() => {
    if (profile && !profile.promoCreditGranted && firebaseApp && !welcomeTriggered.current) {
        welcomeTriggered.current = true;
        const initWelcome = async () => {
            setIsGrantingBonus(true);
            try {
                const functions = getFunctions(firebaseApp, 'us-central1');
                const callInit = httpsCallable(functions, 'initializePassengerWelcomeV1');
                await callInit();
            } catch (e) {
                console.error('Welcome bonus init failed', e);
            } finally {
                setIsGrantingBonus(false);
            }
        };
        initWelcome();
    }
  }, [profile?.promoCreditGranted, firebaseApp]);

  const completedRidesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'rides'),
        where('passengerId', '==', user.uid),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(50)
    );
  }, [firestore, user?.uid]);

  const { data: completedRides, isLoading: isHistoryLoading } = useCollection<WithId<Ride>>(completedRidesQuery);

  const value = useMemo(() => ({
    completedRides,
    isHistoryLoading,
    isGrantingBonus,
  }), [completedRides, isHistoryLoading, isGrantingBonus]);

  return (
    <PassengerDataContext.Provider value={value}>
      {children}
    </PassengerDataContext.Provider>
  );
}
