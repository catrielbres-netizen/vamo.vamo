'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { startOfDay, subDays } from 'date-fns';

export interface DriverStatsSummary {
    todayRevenue: number;
    todayRides: number;
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
    const firestore = useFirestore();
    const { user } = useUser();
    
    const [stats, setStats] = useState<Omit<DriverStatsSummary, 'loading' | 'error'>>({
        todayRevenue: 0,
        todayRides: 0,
        weeklyRevenue: 0,
        weeklyCommissions: 0,
        weeklyRides: 0,
        monthlyRevenue: 0,
        monthlyRides: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firestore || !user) return;

        const now = new Date();
        const startOfToday = startOfDay(now);
        const startOfSevenDays = startOfDay(subDays(now, 7));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const minDate = Timestamp.fromDate(startOfMonth < startOfSevenDays ? startOfMonth : startOfSevenDays);
        
        // Listen to completed rides in the last month (covers day/week too)
        const ridesQuery = query(
            collection(firestore, 'rides'),
            where('driverId', '==', user.uid),
            where('status', '==', 'completed'),
            where('completedAt', '>=', minDate),
            orderBy('completedAt', 'desc')
        );

        const unsubscribe = onSnapshot(ridesQuery, (snapshot) => {
            let todayRevenue = 0;
            let todayRides = 0;
            let weeklyRevenue = 0;
            let weeklyCommissions = 0;
            let weeklyRides = 0;
            let monthlyRevenue = 0;
            let monthlyRides = snapshot.docs.length;

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const fapFee = data.completedRide?.fapFee || 0;
                const baseFareForRevenue = data.completedRide?.totalFare || data.pricing?.final?.total || data.pricing?.estimated?.total || 0;
                const fare = baseFareForRevenue - fapFee;
                const commission = data.completedRide?.commissionAmount || data.pricing?.final?.commissionAmount || 0;
                
                const completedAt = (data.completedAt as Timestamp).toDate();

                // Monthly: already filtered by query
                monthlyRevenue += fare;

                // Weekly
                if (completedAt >= startOfSevenDays) {
                    weeklyRevenue += fare;
                    weeklyCommissions += commission;
                    weeklyRides++;
                }

                // Today
                if (completedAt >= startOfToday) {
                    todayRevenue += fare;
                    todayRides++;
                }
            });

            setStats({
                todayRevenue,
                todayRides,
                weeklyRevenue,
                weeklyCommissions,
                weeklyRides,
                monthlyRevenue,
                monthlyRides
            });
            setLoading(false);
        }, (err) => {
            console.error("[useDriverStats] Error:", err);
            // Some environments might catch indexing errors here if 'driverId' + 'status' + 'completedAt' index is missing.
            setError('Error al calcular estadísticas. Verificá tu conexión.');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, user]);

    return { ...stats, loading, error };
}
