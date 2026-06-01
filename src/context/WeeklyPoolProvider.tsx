'use client';

/**
 * WeeklyPoolProvider v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Listeners del Pozo Semanal unificados.
 *
 * CAMBIOS v2:
 *  - weekId canónico: YYYY-Www (mismo formato que el backend)
 *  - Fuente única de verdad: driver_points/{uid}
 *  - Expone estado de distribución (open / distributed / no_qualified)
 *  - Expone payout de semana anterior si fue distribuido
 *
 * NO tocar: wallet / refund / settlement / matching / tarifa dinámica / functions.
 */

import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    ReactNode,
} from 'react';
import {
    doc,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { WeeklyPool, WeeklyPoolDriver } from '@/lib/types';
import { weeklyPoolConfig, getMultiplierForRank } from '@/config/weeklyPoolConfig';

// ─── weekId canónico (mismo algoritmo que el backend) ────────────────────────

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

function getPreviousWeekId(): string {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getWeekId(); // usa la misma lógica pero con fecha -7 días
    // (implementación simplificada — el backend es el que calcula el anterior para pagos)
}

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type PoolWeekStatus = 'open' | 'distributed' | 'loading' | 'no_data';

export interface WeeklyPoolContextValue {
    pool: WeeklyPool | null;
    driverStats: WeeklyPoolDriver | null;
    dynamicTripsCount: number;
    dynamicPoints: number;
    dynamicMultiplier: number;
    loading: boolean;
    error: string | null;
    // Nuevos en v2:
    weekId: string;
    poolStatus: PoolWeekStatus;
    /** Payout de la semana anterior si fue distribuida */
    previousPayout: {
        payoutAmount: number;
        rank: number;
        multiplier: number;
        paidAt: any;
    } | null;
}

// ─── Context ────────────────────────────────────────────────────────────────

const WeeklyPoolContext = createContext<WeeklyPoolContextValue | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────────────────

export function WeeklyPoolProvider({ children }: { children: ReactNode }) {
    const firestore = useFirestore();
    const { user, profile } = useUser();

    const [pool, setPool] = useState<WeeklyPool | null>(null);
    const [driverStats, setDriverStats] = useState<WeeklyPoolDriver | null>(null);
    const [dynamicTripsCount, setDynamicTripsCount] = useState(0);
    const [dynamicPoints, setDynamicPoints] = useState(0);
    const [dynamicMultiplier, setDynamicMultiplier] = useState(1.0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [poolStatus, setPoolStatus] = useState<PoolWeekStatus>('loading');
    const [previousPayout, setPreviousPayout] = useState<WeeklyPoolContextValue['previousPayout']>(null);

    // weekId canónico memoizado
    const weekId = useMemo(() => getWeekId(), []);

    const cityKey = profile?.cityKey || 'rawson';

    // Ref para el pool amount real (evita closure stale en listener de ranking)
    const poolAmountRef = useRef<number>(20000);

    // Ref para el listener de ranking (se abre dentro del listener de puntos)
    const unsubscribeRankRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!firestore) {
            setLoading(false);
            return;
        }

        // ── Listener 1: weekly_pools/{weekId} (fuente primaria del pozo) ──────
        // Si existe, usar sus datos. Si no, usar cities como fallback.
        const weeklyPoolRef = doc(firestore, 'cities', cityKey, 'weekly_pools', weekId);
        const unsubscribeWeeklyPool = onSnapshot(
            weeklyPoolRef,
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setPoolStatus(data.status === 'distributed' ? 'distributed' : 'open');
                    setPool({
                        cityKey,
                        weekId,
                        status: data.status || 'active',
                        baseAmount: data.baseAmount || 20000,
                        currentAmount: data.currentAmount || data.totalAmount || 20000,
                        maxAmount: data.maxAmount || 600000,
                        growthRate: 0.001,
                        totalCompletedTrips: data.completedTripsTotal || 0,
                        weeklyPoolContributionPerRide: data.incrementPerRide || data.amountPerTrip || 100,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                    poolAmountRef.current = data.currentAmount || data.totalAmount || 20000;
                }
                // Si el doc no existe, esperamos el listener de cities como fallback
            },
            (err) => {
                console.error('[WeeklyPoolProvider] weekly_pools fetch error:', err);
            }
        );

        // ── Listener 2: cities/{cityKey} (fallback y fuente del monto acumulado) ─
        const cityRef = doc(firestore, 'cities', cityKey);
        const unsubscribePool = onSnapshot(
            cityRef,
            (snap) => {
                const cityData = snap.exists() ? snap.data() : null;
                const rewards = cityData?.rewardsConfig || {};
                const poolAmount = rewards.weeklyPoolAmount || 20000;

                // Solo actualizar el pool si NO hay doc weekly_pools (fallback)
                setPool(prev => {
                    if (prev) return prev; // ya fue seteado por weekly_pools listener
                    return {
                        cityKey,
                        weekId,
                        status: 'active',
                        baseAmount: 20000,
                        currentAmount: poolAmount,
                        maxAmount: 600000,
                        growthRate: 0.001,
                        totalCompletedTrips: 0,
                        weeklyPoolContributionPerRide: rewards.weeklyPoolContributionPerRide || 100,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                });
                // Siempre actualizar el ref (el listener de ranking lo usa)
                poolAmountRef.current = poolAmount;
                if (poolStatus === 'loading') setPoolStatus('open');
                if (!user?.uid) setLoading(false);
            },
            (err) => {
                console.error('[WeeklyPoolProvider] City fetch error:', err);
                setLoading(false);
            }
        );

        // ── Listener 3: Puntos del conductor + Ranking top10 ────────────────
        let unsubscribePoints: (() => void) | null = null;

        if (user?.uid) {
            // Listener de driver_points/{uid} (fuente única de verdad para el conductor)
            const pointsRef = doc(firestore, 'driver_points', user.uid);

            unsubscribePoints = onSnapshot(
                pointsRef,
                (snap) => {
                    const data = snap.exists() ? snap.data() : null;
                    const myPoints = data?.weeklyPoints || 0;
                    const myTrips = data?.weeklyTripsCount || 0;
                    const myDynTrips = data?.weeklyDynamicTripsCount || 0;
                    const myDynPoints = data?.weeklyDynamicPoints || 0;
                    const myDynMultiplier = data?.weeklyPoolDynamicMultiplier || 1.0;

                    setDynamicTripsCount(myDynTrips);
                    setDynamicPoints(myDynPoints);
                    setDynamicMultiplier(myDynMultiplier);

                    // Limpiar listener de ranking previo antes de re-abrir
                    if (unsubscribeRankRef.current) {
                        unsubscribeRankRef.current();
                        unsubscribeRankRef.current = null;
                    }

                    // ── Listener 4: Ranking topN ─────────────────────────────
                    const topNQuery = query(
                        collection(firestore, 'driver_points'),
                        where('cityKey', '==', cityKey),
                        where('weekId', '==', weekId),
                        orderBy('weeklyTripsCount', 'desc'),
                        limit(weeklyPoolConfig.eligibleTopCount)
                    );

                    unsubscribeRankRef.current = onSnapshot(
                        topNQuery,
                        (topSnap) => {
                            const topDocs = topSnap.docs.map(d => d.data());
                            const myRankIdx = topSnap.docs.findIndex((d) => d.id === user.uid);
                            const finalRank = myRankIdx >= 0 ? myRankIdx + 1 : weeklyPoolConfig.eligibleTopCount + 1;

                            // Payout estimado usando distribución proporcional al pozo real con tope del 25% individual
                            const poolAmount = poolAmountRef.current;
                            let totalMultipliers = 0;
                            
                            topDocs.forEach((doc, idx) => {
                                const rank = idx + 1;
                                // Sólo sumamos los que tienen al menos 1 viaje
                                if ((doc.weeklyTripsCount || 0) >= 1) {
                                    totalMultipliers += getMultiplierForRank(rank);
                                }
                            });

                            const isInTopN = finalRank <= weeklyPoolConfig.eligibleTopCount && myRankIdx >= 0 && myTrips >= 1;
                            
                            let estimatedPayout = 0;
                            if (isInTopN && totalMultipliers > 0) {
                                const myMultiplier = getMultiplierForRank(finalRank);
                                const rawPayout = poolAmount * (myMultiplier / totalMultipliers);
                                const individualCap = poolAmount * weeklyPoolConfig.individualCapPercentage;
                                estimatedPayout = Math.floor(Math.min(rawPayout, individualCap));
                            }

                            setDriverStats({
                                driverId: user.uid,
                                completedTrips: myTrips,
                                weeklyPoints: myPoints,
                                multiplier: 1.0,
                                rank: isInTopN ? finalRank : 0,
                                estimatedPayout,
                            });
                            setLoading(false);
                        },
                        (err) => {
                            console.warn('[WeeklyPoolProvider] Rank error:', err);
                            setLoading(false);
                        }
                    );
                },
                (err) => {
                    console.warn('[WeeklyPoolProvider] Points fetch error:', err);
                    setDriverStats({
                        driverId: user.uid,
                        completedTrips: 0,
                        weeklyPoints: 0,
                        multiplier: 0,
                        rank: 0,
                        estimatedPayout: 0,
                    });
                    setLoading(false);
                }
            );

            // ── Listener 5: Distribución de semana anterior ──────────────────
            // Calcula prevWeekId localmente
            const prevDate = new Date();
            prevDate.setDate(prevDate.getDate() - 7);
            const prevFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Argentina/Buenos_Aires',
                year: 'numeric', month: '2-digit', day: '2-digit',
            });
            const prevParts = prevFormatter.formatToParts(prevDate);
            const py = parseInt(prevParts.find(p => p.type === 'year')?.value || '0');
            const pm = parseInt(prevParts.find(p => p.type === 'month')?.value || '0') - 1;
            const pday = parseInt(prevParts.find(p => p.type === 'day')?.value || '0');
            const prevArgDate = new Date(py, pm, pday);
            const prevFirstDay = new Date(py, 0, 1);
            const prevPastDays = (prevArgDate.getTime() - prevFirstDay.getTime()) / 86400000;
            const prevWeekNum = Math.ceil((prevPastDays + prevFirstDay.getDay() + 1) / 7);
            const prevWeekId = `${py}-W${String(prevWeekNum).padStart(2, '0')}`;

            const prevDistRef = doc(firestore, 'weekly_pool_distributions', `${prevWeekId}_${user.uid}`);
            onSnapshot(prevDistRef, (snap) => {
                if (snap.exists()) {
                    const d = snap.data();
                    setPreviousPayout({
                        payoutAmount: d.payoutAmount || 0,
                        rank: d.rank || 0,
                        multiplier: d.multiplier || 0,
                        paidAt: d.paidAt,
                    });
                } else {
                    setPreviousPayout(null);
                }
            });
        }

        // ── Cleanup ──────────────────────────────────────────────────────────
        return () => {
            unsubscribeWeeklyPool();
            unsubscribePool();
            if (unsubscribePoints) unsubscribePoints();
            if (unsubscribeRankRef.current) {
                unsubscribeRankRef.current();
                unsubscribeRankRef.current = null;
            }
        };
    }, [firestore, user?.uid, cityKey, weekId]);

    const value = useMemo<WeeklyPoolContextValue>(
        () => ({
            pool,
            driverStats,
            dynamicTripsCount,
            dynamicPoints,
            dynamicMultiplier,
            loading,
            error,
            weekId,
            poolStatus,
            previousPayout,
        }),
        [pool, driverStats, dynamicTripsCount, dynamicPoints, dynamicMultiplier, loading, error, weekId, poolStatus, previousPayout]
    );

    return (
        <WeeklyPoolContext.Provider value={value}>
            {children}
        </WeeklyPoolContext.Provider>
    );
}

// ─── Hook de consumo ─────────────────────────────────────────────────────────

export function useWeeklyPoolContext(): WeeklyPoolContextValue {
    const ctx = useContext(WeeklyPoolContext);
    if (ctx === undefined) {
        throw new Error('useWeeklyPoolContext must be used within a WeeklyPoolProvider');
    }
    return ctx;
}
