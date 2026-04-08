'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { startOfDay, subDays } from 'date-fns';

export interface DriverStatsSummary {
    weeklyRevenue: number;
    weeklyCommissions: number;
    weeklyRides: number;
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
        weeklyRevenue: 0,
        weeklyCommissions: 0,
        weeklyRides: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firestore || !user) return;

        const sevenDaysAgo = Timestamp.fromDate(startOfDay(subDays(new Date(), 7)));
        
        // Listen to completed rides in the last 7 days for this driver
        const ridesQuery = query(
            collection(firestore, 'rides'),
            where('driverId', '==', user.uid),
            where('status', '==', 'completed'),
            where('completedAt', '>=', sevenDaysAgo),
            orderBy('completedAt', 'desc')
        );

        const unsubscribe = onSnapshot(ridesQuery, (snapshot) => {
            let totalRevenue = 0;
            let totalCommissions = 0;
            let totalRides = snapshot.docs.length;

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                // Prioritize the actual settled fare, then estimated as fallback
                const fare = data.completedRide?.totalFare || data.pricing?.final?.total || data.pricing?.estimated?.total || 0;
                const commission = data.completedRide?.commissionAmount || data.pricing?.final?.commissionAmount || 0;
                
                totalRevenue += fare;
                totalCommissions += commission;
            });

            setStats({
                weeklyRevenue: totalRevenue,
                weeklyCommissions: totalCommissions,
                weeklyRides: totalRides
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
