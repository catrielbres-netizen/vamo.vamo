'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doc, onSnapshot, collection, query, where, limit } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { UserProfile, RideOffer, WithId, EnrichedRideOffer } from '@/lib/types';
import { getArgentinaDateStr } from '@/lib/date';

export interface WalletInfo {
    cashBalance: number;
    promoBalance: number;
    totalBalance: number;
    currency: string;
    grossReceiptsBalance?: number;
    lastUpdated?: any;
}

export interface DriverRealtimeData {
    profile: UserProfile | null;
    wallet: WalletInfo | null;
    location: any | null;
    rides: EnrichedRideOffer[];
    newRideIds: Set<string>;
    ready: boolean;
    error: string | null;
}

export function useDriverRealtime() {
    const firestore = useFirestore();
    const { user, profile: authProfile, loading: authLoading } = useUser();
    const timeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
    
    const [profile, setProfile] = useState<UserProfile | null>(() => {
        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem(`vamo_driver_profile_${user?.uid}`);
            return cached ? JSON.parse(cached) : null;
        }
        return null;
    });
    
    const [wallet, setWallet] = useState<WalletInfo | null>(() => {
        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem(`vamo_driver_wallet_${user?.uid}`);
            return cached ? JSON.parse(cached) : null;
        }
        return null;
    });

    const [location, setLocation] = useState<any | null>(() => {
        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem(`vamo_driver_location_${user?.uid}`);
            return cached ? JSON.parse(cached) : null;
        }
        return null;
    });

    const [rides, setRides] = useState<WithId<RideOffer>[]>([]);
    const [newOfferIds, setNewOfferIds] = useState(new Set<string>());
    
    const [loadingStates, setLoadingStates] = useState({
        profile: true,
        wallet: true,
        location: true,
        rides: true
    });
    
    const [error, setError] = useState<string | null>(null);

    // [VamO PRO] Cache Persistence Engine
    useEffect(() => {
        if (!user?.uid) return;
        if (profile) localStorage.setItem(`vamo_driver_profile_${user.uid}`, JSON.stringify(profile));
        if (wallet) localStorage.setItem(`vamo_driver_wallet_${user.uid}`, JSON.stringify(wallet));
        if (location) localStorage.setItem(`vamo_driver_location_${user.uid}`, JSON.stringify(location));
    }, [profile, wallet, location, user?.uid]);

    useEffect(() => {
        if (!firestore || !user?.uid) return;

        console.log(`🚀 [REALTIME] Initializing Driver Subscriptions for ${user.uid}`);

        // 1. Profile Subscription (Primary)
        const unsubProfile = onSnapshot(doc(firestore, 'users', user.uid), (snap) => {
            if (snap.exists()) {
                setProfile({ ...snap.data() as UserProfile, id: snap.id });
            }
            setLoadingStates(prev => ({ ...prev, profile: false }));
        }, (err) => {
            console.error("❌ [REALTIME] Profile Error:", err);
            setError("Error cargando perfil");
        });

        // 2. Wallet Subscription
        const unsubWallet = onSnapshot(doc(firestore, 'wallets', user.uid), (snap) => {
            if (snap.exists()) {
                setWallet(snap.data() as WalletInfo);
            } else {
                setWallet({ cashBalance: 0, promoBalance: 0, totalBalance: 0, currency: 'ARS' });
            }
            setLoadingStates(prev => ({ ...prev, wallet: false }));
        }, (err) => {
            console.error("❌ [REALTIME] Wallet Error:", err);
        });

        // 3. Location Subscription
        const unsubLocation = onSnapshot(doc(firestore, 'drivers_locations', user.uid), (snap) => {
            if (snap.exists()) {
                setLocation(snap.data());
            }
            setLoadingStates(prev => ({ ...prev, location: false }));
        }, (err) => {
            console.error("❌ [REALTIME] Location Error:", err);
        });

        // 4. Ride Offers Subscription
        const ridesQuery = query(
            collection(firestore, "rideOffers"),
            where("driverId", "==", user.uid),
            where("status", "==", "pending"),
            limit(20)
        );

        const unsubRides = onSnapshot(ridesQuery, (snap) => {
            const newRides = snap.docs.map(d => ({ ...d.data() as any, id: d.id }));
            
            // Track new ride IDs for the "New" badge
            setRides(currentRides => {
                const prevIds = new Set(currentRides.map(r => r.id));
                const freshIds = newRides.filter(r => !prevIds.has(r.id)).map(r => r.id);
                
                if (freshIds.length > 0 && prevIds.size > 0) {
                    setNewOfferIds(current => {
                        const next = new Set(current);
                        freshIds.forEach(id => next.add(id));
                        return next;
                    });
                    
                    // Auto-clear after 10 seconds (VamO Security: track timeout for cleanup)
                    const timeoutId = setTimeout(() => {
                        setNewOfferIds(current => {
                            const next = new Set(current);
                            freshIds.forEach(id => next.delete(id));
                            return next;
                        });
                    }, 10000);
                    timeoutsRef.current.add(timeoutId);
                }
                
                return newRides;
            });
            
            setLoadingStates(prev => ({ ...prev, rides: false }));
        }, (err) => {
            console.error("❌ [REALTIME] Rides Error:", err);
        });

        return () => {
            console.log("🛑 [REALTIME] Detaching Driver Subscriptions");
            unsubProfile();
            unsubWallet();
            unsubLocation();
            unsubRides();
            // Clear all pending timeouts
            timeoutsRef.current.forEach(clearTimeout);
            timeoutsRef.current.clear();
        };
    }, [firestore, user?.uid]);

    const ready = useMemo(() => {
        if (authLoading) return false;
        if (!user) return false;
        
        // [VamO PRO] Deterministic Ready State
        // A dashboard is "ready" if we have BOTH Profile and Wallet.
        // We accept cached data to speed up the first paint (Uber Style).
        const hasProfile = profile !== null;
        const hasWallet = wallet !== null;

        return hasProfile && hasWallet;
    }, [authLoading, user, profile, wallet]);

    return {
        profile: profile || authProfile, // Fallback to authProfile during transitions
        wallet,
        location,
        rides,
        newRideIds: newOfferIds,
        ready,
        error
    };
}
