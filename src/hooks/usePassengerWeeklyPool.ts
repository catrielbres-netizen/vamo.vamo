'use client';

import { usePassengerWeeklyPoolContext, PassengerWeeklyPoolContextValue } from '@/context/PassengerWeeklyPoolProvider';

export type { PassengerWeeklyPoolContextValue as PassengerWeeklyPoolStatus };

export function usePassengerWeeklyPool(): PassengerWeeklyPoolContextValue {
    return usePassengerWeeklyPoolContext();
}
