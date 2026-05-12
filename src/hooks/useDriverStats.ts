'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { startOfDay, subDays } from 'date-fns';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import { getArgentinaDateStr, getWeekId } from '@/lib/date';

export interface DriverStatsSummary {
    todayRevenue: number;
    todayCash: number;
    todayDigital: number;
    todayRides: number;
    todayKm: number;
    todayOnlineMinutes: number;
    weeklyRevenue: number;
    weeklyCommissions: number;
    weeklyRides: number;
    monthlyRevenue: number;
    monthlyRides: number;
    loading: boolean;
    error: string | null;
}

/**
 * [VamO PRO] Custom hook to calculate driver performance stats for the last 7 days.
 */
export function useDriverStats(): DriverStatsSummary {
    const { profile } = useUser();
    
    const stats = useMemo(() => {
        const todayStr = getArgentinaDateStr();
        const dStats = profile?.dailyStats?.lastResetDate === todayStr 
            ? profile.dailyStats 
            : { ridesCount: 0, earningsDaily: 0, todayCash: 0, todayDigital: 0, kilometersDaily: 0, onlineSeconds: 0 };
        
        const fStats = (profile as any)?.financialStats || {
            weeklyEarnings: 0,
            monthlyEarnings: 0,
            totalHistoricalEarnings: 0
        };

        const accumulatedSeconds = dStats.onlineSeconds || 0;
        let currentSessionSeconds = 0;
        if (profile?.dailyStats?.lastResetDate === todayStr && profile.dailyStats.lastStatusChangedAt) {
            // Safe conversion for both Firestore Timestamp and JS Date
            const startTime = (profile.dailyStats.lastStatusChangedAt as any)?.toMillis 
                ? (profile.dailyStats.lastStatusChangedAt as any).toMillis() 
                : new Date(profile.dailyStats.lastStatusChangedAt).getTime();
            
            if (profile.driverStatus === 'online' || profile.driverStatus === 'in_ride') {
                currentSessionSeconds = Math.floor((Date.now() - startTime) / 1000);
            }
        }

        return {
            todayRevenue: dStats.earningsDaily || 0, // Now reflects Net Earnings (Settlements)
            todayCash: dStats.todayCash || 0,
            todayDigital: dStats.todayDigital || 0,
            todayRides: dStats.ridesCount || 0,
            todayKm: dStats.kilometersDaily || 0,
            todayOnlineMinutes: Math.floor((accumulatedSeconds + currentSessionSeconds) / 60),
            weeklyRevenue: fStats.weeklyEarnings || 0,
            weeklyCommissions: 0,
            weeklyRides: fStats.weeklyRidesCount || 0,
            monthlyRevenue: fStats.monthlyEarnings || 0,
            monthlyRides: fStats.monthlyRidesCount || 0,
            loading: false,
            error: null as string | null
        };
    }, [profile]);

    return stats;
}
