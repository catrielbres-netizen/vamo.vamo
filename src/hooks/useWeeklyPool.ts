'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { WeeklyPool, WeeklyPoolDriver } from '@/lib/types';
import { getWeekId } from '@/lib/date';

export interface WeeklyPoolStatus {
    pool: WeeklyPool | null;
    driverStats: WeeklyPoolDriver | null;
    loading: boolean;
    error: string | null;
}

/**
 * [VamO PRO] Hook to track the Weekly Pool status for the current driver.
 * Now reads directly from city config and driver_points for production reliability.
 */
export function useWeeklyPool(): WeeklyPoolStatus {
    const firestore = useFirestore();
    const { user, profile } = useUser();
    
    const [pool, setPool] = useState<WeeklyPool | null>(null);
    const [driverStats, setDriverStats] = useState<WeeklyPoolDriver | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cityKey = profile?.cityKey || 'rawson';
    const weekId = useMemo(() => getWeekId(), []);

    useEffect(() => {
        if (!firestore) {
            setLoading(false);
            return;
        }

        // 1. Listen to the City Document for the Pool Amount
        const cityRef = doc(firestore, 'cities', cityKey);
        const unsubscribePool = onSnapshot(cityRef, (snap) => {
            if (snap.exists()) {
                const cityData = snap.data();
                const rewards = cityData.rewardsConfig || {};
                setPool({
                    cityKey,
                    weekId,
                    status: 'active',
                    baseAmount: 50000,
                    currentAmount: rewards.weeklyPoolAmount || 50000,
                    maxAmount: 300000,
                    growthRate: 0.001,
                    totalCompletedTrips: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            } else {
                // Fallback if city doc is missing (e.g. fresh environment)
                setPool({
                    cityKey,
                    weekId,
                    status: 'active',
                    baseAmount: 50000,
                    currentAmount: 50000,
                    maxAmount: 300000,
                    growthRate: 0.001,
                    totalCompletedTrips: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
            // Mark pool as "loaded" regardless of driver points
            if (!driverStats) setLoading(false);
        }, (err) => {
            console.error("[useWeeklyPool] City Fetch Error:", err);
            // Fallback on error to ensure something renders
            setPool({
                cityKey,
                weekId,
                status: 'active',
                baseAmount: 50000,
                currentAmount: 50000,
                maxAmount: 300000,
                growthRate: 0.001,
                totalCompletedTrips: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            setLoading(false);
        });

        // 2. Listen to the current driver's points if user exists
        let unsubscribePoints: (() => void) | null = null;
        let unsubscribeRank: (() => void) | null = null;

        if (user?.uid) {
            const pointsRef = doc(firestore, 'driver_points', user.uid);
            
            unsubscribePoints = onSnapshot(pointsRef, (snap) => {
                if (snap.exists()) {
                const data = snap.data();
                const myPoints = data.weeklyPoints || 0;
                const myTrips = data.weeklyTripsCount || 0;

                // 3. Dynamic Rank Calculation & Estimated Payout (FASE 3A)
                if (unsubscribeRank) unsubscribeRank();
                
                const top10Query = query(
                    collection(firestore, 'driver_points'),
                    orderBy('weeklyPoints', 'desc'),
                    limit(10)
                );

                unsubscribeRank = onSnapshot(top10Query, (topSnap) => {
                    const topDocs = topSnap.docs;
                    const myRank = topDocs.findIndex(d => d.id === user.uid) + 1;
                    
                    // If not in top 10 snapshot, calculate rank relative to them
                    let finalRank = myRank;
                    if (myRank === 0) {
                        // We need to know how many are better than us
                        // This is a bit complex for a single snapshot, so we approximate
                        // or just show "Out of Top 10" logic
                        finalRank = 11; // Placeholder for "beyond top 10"
                    }

                    // Calculate Total Adjusted Points for the Top 10
                    let totalAdjustedPoints = 0;
                    topDocs.forEach((doc, index) => {
                        const p = doc.data().weeklyPoints || 0;
                        const r = index + 1;
                        let m = 0;
                        if (r <= 2) m = 1.5;
                        else if (r <= 6) m = 1.2;
                        else if (r <= 10) m = 1;
                        totalAdjustedPoints += (p * m);
                    });

                    // Calculate My Multiplier
                    let myMultiplier = 0;
                    if (finalRank <= 2) myMultiplier = 1.5;
                    else if (finalRank <= 6) myMultiplier = 1.2;
                    else if (finalRank <= 10) myMultiplier = 1.0;

                    // Calculate My Estimated Payout
                    const myAdjustedPoints = myPoints * myMultiplier;
                    const poolAmount = pool?.currentAmount || 50000;
                    
                    // Rule: Only Top 10 with at least 10 trips participate
                    const isQualified = myTrips >= 10;
                    const estimatedPayout = (isQualified && finalRank <= 10 && totalAdjustedPoints > 0)
                        ? (myAdjustedPoints / totalAdjustedPoints) * poolAmount
                        : 0;

                    setDriverStats({
                        driverId: user.uid,
                        completedTrips: myTrips,
                        multiplier: myMultiplier,
                        rank: finalRank > 10 ? 0 : finalRank, // 0 means not in top 10
                        estimatedPayout
                    });
                    setLoading(false);
                }, (err) => {
                    console.warn("[useWeeklyPool] Rank/Payout calculation error:", err);
                    setLoading(false);
                });

            } else {
                // Initialize for new driver
                setDriverStats({
                    driverId: user.uid,
                    completedTrips: 0,
                    multiplier: 0,
                    rank: 0,
                    estimatedPayout: 0
                });
                setLoading(false);
            }
            }, (err) => {
                console.warn("[useWeeklyPool] Points Fetch Error:", err);
                setLoading(false);
            });
        }

        return () => {
            unsubscribePool();
            if (unsubscribePoints) unsubscribePoints();
            if (unsubscribeRank) unsubscribeRank();
        };
    }, [firestore, user?.uid, cityKey]);

    return {
        pool,
        driverStats,
        loading,
        error
    };
}

