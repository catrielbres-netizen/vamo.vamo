'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useUser } from '@/firebase';
import { resolveCityKey } from '@/lib/resolveCityKey';

// YYYY-Www calculator helper (Argentina timezone consistent with backend)
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
  const argDate = new Date(y, m, day);
  const firstDayOfYear = new Date(y, 0, 1);
  const pastDaysOfYear = (argDate.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${y}-W${String(weekNumber).padStart(2, '0')}`;
}

export interface PassengerWeeklyPool {
  cityKey: string;
  weekId: string;
  totalAmount: number;
  baseAmount: number;
  completedTripsTotal?: number;
  amountPerTrip?: number;
  status?: string;
  updatedAt?: any;
}

export interface PassengerPoints {
  passengerId: string;
  passengerName: string;
  weekId: string;
  weeklyTripsCount: number;
  lastUpdated?: any;
}

export function usePassengerRewards() {
  const { user, profile, claims, loading: userLoading, firestore } = useUser();
  const weekId = useMemo(() => getWeekId(), []);
  const cityKey = useMemo(() => resolveCityKey(profile, claims), [profile, claims]);

  const [pool, setPool] = useState<PassengerWeeklyPool | null>(null);
  const [myPoints, setMyPoints] = useState<PassengerPoints | null>(null);
  const [ranking, setRanking] = useState<PassengerPoints[]>([]);

  const [poolLoading, setPoolLoading] = useState(false);
  const [myPointsLoading, setMyPointsLoading] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;

    if (!user) {
      setPoolLoading(false);
      setMyPointsLoading(false);
      setRankingLoading(false);
      return;
    }

    if (!firestore) {
      setError('Error de inicialización de base de datos.');
      return;
    }

    if (!cityKey) {
      setError('No se pudo resolver la ciudad para el ranking semanal.');
      setPoolLoading(false);
      setMyPointsLoading(false);
      setRankingLoading(false);
      return;
    }

    // Reset error state and start loading
    setError(null);
    setPoolLoading(true);
    setMyPointsLoading(true);
    setRankingLoading(true);

    // 1. Subscription to pool: cities/{cityKey}/passenger_weekly_pools/{weekId}
    const poolDocRef = doc(firestore, 'cities', cityKey, 'passenger_weekly_pools', weekId);
    const unsubscribePool = onSnapshot(
      poolDocRef,
      (snap) => {
        if (snap.exists()) {
          setPool(snap.data() as PassengerWeeklyPool);
        } else {
          setPool(null);
        }
        setPoolLoading(false);
      },
      (err) => {
        console.error('[usePassengerRewards] Error cargando pozo de pasajeros:', err);
        setError(prev => prev || `Error cargando pozo: ${err.message}`);
        setPoolLoading(false);
      }
    );

    // 2. Subscription to myPoints: cities/{cityKey}/passenger_points/{userId_weekId}
    const myPointsDocRef = doc(firestore, 'cities', cityKey, 'passenger_points', `${user.uid}_${weekId}`);
    const unsubscribeMyPoints = onSnapshot(
      myPointsDocRef,
      (snap) => {
        if (snap.exists()) {
          setMyPoints(snap.data() as PassengerPoints);
        } else {
          setMyPoints(null);
        }
        setMyPointsLoading(false);
      },
      (err) => {
        console.error('[usePassengerRewards] Error cargando puntos del pasajero:', err);
        setError(prev => prev || `Error cargando tus puntos: ${err.message}`);
        setMyPointsLoading(false);
      }
    );

    // 3. Subscription to ranking: cities/{cityKey}/passenger_points
    // where weekId == weekId order by weeklyTripsCount desc limit 100
    const rankingColRef = collection(firestore, 'cities', cityKey, 'passenger_points');
    const rankingQ = query(
      rankingColRef,
      where('weekId', '==', weekId),
      orderBy('weeklyTripsCount', 'desc'),
      limit(100)
    );

    const unsubscribeRanking = onSnapshot(
      rankingQ,
      (snap) => {
        const list = snap.docs.map(d => ({
          passengerId: d.data().passengerId || d.id.split('_')[0],
          passengerName: d.data().passengerName || 'Pasajero',
          weekId: d.data().weekId || weekId,
          weeklyTripsCount: d.data().weeklyTripsCount || 0,
          ...d.data(),
        })) as PassengerPoints[];
        setRanking(list);
        setRankingLoading(false);
      },
      (err) => {
        console.error('[usePassengerRewards] Error cargando ranking de pasajeros:', err);
        setError(prev => prev || `Error cargando ranking: ${err.message}`);
        setRankingLoading(false);
      }
    );

    return () => {
      unsubscribePool();
      unsubscribeMyPoints();
      unsubscribeRanking();
    };
  }, [userLoading, user, firestore, cityKey, weekId]);

  // Derived userRank
  const userRank = useMemo(() => {
    if (!user || ranking.length === 0) return 0;
    const index = ranking.findIndex(r => r.passengerId === user.uid);
    return index >= 0 ? index + 1 : 0;
  }, [ranking, user]);

  // Estimated Reward calculation based on current userRank
  const estimatedReward = useMemo(() => {
    const rank = userRank;
    if (!rank || rank <= 0 || rank > 100) return 0;

    const trips = myPoints?.weeklyTripsCount || 0;
    if (trips <= 0) return 0;

    // Table:
    // Puestos 1 al 10: $15.000
    // Puestos 11 al 30: $8.000
    // Puestos 31 al 60: $5.000
    // Puestos 61 al 100: $3.500
    if (rank <= 10) return 15000;
    if (rank <= 30) return 8000;
    if (rank <= 60) return 5000;
    if (rank <= 100) return 3500;
    return 0;
  }, [userRank, myPoints]);

  const loading = userLoading || poolLoading || myPointsLoading || rankingLoading;

  return {
    loading,
    error,
    cityKey,
    weekId,
    pool,
    myPoints,
    ranking,
    userRank,
    estimatedReward,
  };
}
