'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { type WithId, type PlatformTransaction } from '@/lib/types';

export function useDriverTransactions() {
  const firestore = useFirestore();
  const { user } = useUser();
  
  const [transactions, setTransactions] = useState<WithId<PlatformTransaction>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore || !user) {
      setLoading(false);
      return;
    }

    const transactionsQuery = query(
      collection(firestore, 'platform_transactions'),
      where('driverId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
      const newTransactions = snapshot.docs.map(doc => ({ ...doc.data() as PlatformTransaction, id: doc.id }));
      setTransactions(newTransactions);
      setLoading(false);
    }, (err: any) => {
      console.error("[useDriverTransactions] Error:", err);
      const isIndexError = err.message?.includes('index') || err.code === 'failed-precondition';
      setError(isIndexError 
        ? 'Falta un índice en la base de datos para cargar tus movimientos. Contactá a soporte.'
        : 'Hubo un error al cargar las transacciones. Por favor, intentá de nuevo más tarde.');
      setLoading(false);
    });

    return () => unsubscribe();

  }, [firestore, user]);

  return { transactions, loading, error };
}
