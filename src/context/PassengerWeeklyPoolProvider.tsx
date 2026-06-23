'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { doc, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { passengerWeeklyPoolConfig, getPassengerMultiplierForRank } from '@/config/passengerWeeklyPoolConfig';

function getWeekId(): string {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(d);
    const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');

    const argDate = new Date(Date.UTC(y, m, day));
    const dayNum = argDate.getUTCDay() || 7;
    argDate.setUTCDate(argDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(argDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((argDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${argDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export interface PassengerWeeklyPoolContextValue {
    pool: any | null;
    passengerStats: any | null;
    dynamicTripsCount: number;
    dynamicPoints: number;
    dynamicMultiplier: number;
    loading: boolean;
    poolStatus: 'open' | 'distributed' | 'no_qualified';
    previousPayout: number | null;
    weekId: string;
}

const PassengerWeeklyPoolContext = createContext<PassengerWeeklyPoolContextValue>({
    pool: null,
    passengerStats: null,
    dynamicTripsCount: 0,
    dynamicPoints: 0,
    dynamicMultiplier: 0,
    loading: true,
    poolStatus: 'open',
    previousPayout: null,
    weekId: '',
});

export const usePassengerWeeklyPoolContext = () => useContext(PassengerWeeklyPoolContext);

export function PassengerWeeklyPoolProvider({ children }: { children: ReactNode }) {
    const firestore = useFirestore();
    const { profile, loading: userLoading } = useUser();

    const [pool, setPool] = useState<any | null>(null);
    const [passengerStats, setPassengerStats] = useState<any | null>(null);
    const [loadingPool, setLoadingPool] = useState(true);
    const [loadingStats, setLoadingStats] = useState(true);
    const [topPassengers, setTopPassengers] = useState<any[]>([]);
    const [previousPayout, setPreviousPayout] = useState<number | null>(null);

    const weekId = useMemo(() => getWeekId(), []);
    const cityKey = profile?.cityKey || 'rio_gallegos';
    const isPassenger = profile?.role === 'passenger';
    const isActive = isPassenger;

    useEffect(() => {
        if (!isActive || !firestore) {
            setLoadingPool(false);
            setLoadingStats(false);
            return;
        }

        const poolRef = doc(firestore, 'cities', cityKey, 'passenger_weekly_pools', weekId);
        const unSubPool = onSnapshot(poolRef, (docSnap) => {
            if (docSnap.exists()) {
                setPool(docSnap.data() as any);
            } else {
                setPool(null);
            }
            setLoadingPool(false);
        }, (err) => {
            setLoadingPool(false);
        });

        const pointsQuery = query(
            collection(firestore, 'cities', cityKey, 'passenger_points'),
            where('weekId', '==', weekId),
            orderBy('weeklyTripsCount', 'desc'),
            limit(passengerWeeklyPoolConfig.eligibleTopCount)
        );

        const unSubPoints = onSnapshot(pointsQuery, (snapshot) => {
            const top: any[] = [];
            let currentRank = 1;
            let lastTrips = -1;

            snapshot.docs.forEach((docSnap, index) => {
                const data = docSnap.data();
                if (data.weeklyTripsCount !== lastTrips) {
                    currentRank = index + 1;
                    lastTrips = data.weeklyTripsCount;
                }
                top.push({
                    passengerId: data.passengerId,
                    rank: currentRank,
                    weeklyTripsCount: data.weeklyTripsCount,
                    weeklyPoints: data.weeklyPoints,
                });
            });

            setTopPassengers(top);

            if (profile?.uid) {
                const myStat = top.find(t => t.passengerId === profile.uid);
                if (myStat) {
                    setPassengerStats(myStat);
                } else {
                    setPassengerStats(null);
                }
            }
            setLoadingStats(false);
        }, (err) => {
            setLoadingStats(false);
        });

        // Buscar payout previo
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const prevFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
        const parts = prevFormatter.formatToParts(d);
        const prevYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
        const prevMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
        const prevDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
        const prevArgDate = new Date(Date.UTC(prevYear, prevMonth, prevDay));
        const prevDayNum = prevArgDate.getUTCDay() || 7;
        prevArgDate.setUTCDate(prevArgDate.getUTCDate() + 4 - prevDayNum);
        const prevYearStart = new Date(Date.UTC(prevArgDate.getUTCFullYear(), 0, 1));
        const prevWeekNo = Math.ceil((((prevArgDate.getTime() - prevYearStart.getTime()) / 86400000) + 1) / 7);
        const prevWeekId = `${prevArgDate.getUTCFullYear()}-W${String(prevWeekNo).padStart(2, '0')}`;

        if (profile?.uid) {
            const distRef = doc(firestore, 'passenger_weekly_pool_distributions', `${prevWeekId}_${profile.uid}`);
            onSnapshot(distRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().payoutAmount > 0) {
                    setPreviousPayout(docSnap.data().payoutAmount);
                } else {
                    setPreviousPayout(null);
                }
            });
        }

        return () => {
            unSubPool();
            unSubPoints();
        };
    }, [firestore, isActive, cityKey, weekId, profile?.uid]);

    const value = useMemo<PassengerWeeklyPoolContextValue>(() => {
        if (!isActive || loadingPool || loadingStats || userLoading) {
            return {
                pool: null,
                passengerStats: null,
                dynamicTripsCount: 0,
                dynamicPoints: 0,
                dynamicMultiplier: 0,
                loading: true,
                poolStatus: 'open',
                previousPayout: null,
                weekId,
            };
        }

        let poolStatus: 'open' | 'distributed' | 'no_qualified' = 'open';
        if (pool?.status === 'distributed') {
            poolStatus = 'distributed';
        }

        const currentAmount = pool?.currentAmount || passengerWeeklyPoolConfig.initialPoolAmount;
        const maxAmount = pool?.maxAmount || passengerWeeklyPoolConfig.maxDisplayedGoal;
        const cappedPool = Math.min(currentAmount, maxAmount);

        let dynamicTripsCount = passengerStats?.weeklyTripsCount || 0;
        let dynamicPoints = passengerStats?.weeklyPoints || 0;
        let dynamicMultiplier = getPassengerMultiplierForRank(passengerStats?.rank || 0);

        // Calculate payout like backend
        let estimatedPayout = 0;
        if (passengerStats && passengerStats.rank > 0 && passengerStats.rank <= passengerWeeklyPoolConfig.eligibleTopCount) {
            let totalMultipliers = 0;
            topPassengers.forEach(p => {
                totalMultipliers += getPassengerMultiplierForRank(p.rank);
            });
            if (totalMultipliers > 0) {
                const individualCap = cappedPool * passengerWeeklyPoolConfig.individualCapPercentage;
                const rawPayout = cappedPool * (dynamicMultiplier / totalMultipliers);
                estimatedPayout = Math.floor(Math.min(rawPayout, individualCap));
            }
        }

        return {
            pool,
            passengerStats: passengerStats ? { ...passengerStats, estimatedPayout } : null,
            dynamicTripsCount,
            dynamicPoints,
            dynamicMultiplier,
            loading: false,
            poolStatus,
            previousPayout,
            weekId,
        };
    }, [isActive, loadingPool, loadingStats, userLoading, pool, passengerStats, topPassengers, weekId, previousPayout]);

    return (
        <PassengerWeeklyPoolContext.Provider value={value}>
            {children}
        </PassengerWeeklyPoolContext.Provider>
    );
}
