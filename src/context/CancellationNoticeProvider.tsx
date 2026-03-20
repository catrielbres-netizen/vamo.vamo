'use client';

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { Ride } from '@/lib/types';

interface CancellationNoticeContextType {
  cancellationNotice: Ride | null;
  showCancellationNotice: (ride: Ride) => void;
  clearCancellationNotice: () => void;
}

const CancellationNoticeContext = createContext<CancellationNoticeContextType | undefined>(undefined);

export const CancellationNoticeProvider = ({ children }: { children: React.ReactNode }) => {
  const [cancellationNotice, setCancellationNotice] = useState<Ride | null>(null);

  const showCancellationNotice = useCallback((ride: Ride) => {
    setCancellationNotice(ride);
  }, []);

  const clearCancellationNotice = useCallback(() => {
    setCancellationNotice(null);
  }, []);

  const value = useMemo(() => ({
    cancellationNotice,
    showCancellationNotice,
    clearCancellationNotice,
  }), [cancellationNotice, showCancellationNotice, clearCancellationNotice]);

  return (
    <CancellationNoticeContext.Provider value={value}>
      {children}
    </CancellationNoticeContext.Provider>
  );
};

export const useCancellationNotice = () => {
  const context = useContext(CancellationNoticeContext);
  if (context === undefined) {
    throw new Error('useCancellationNotice must be used within a CancellationNoticeProvider');
  }
  return context;
};
