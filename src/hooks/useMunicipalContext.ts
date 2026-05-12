'use client';

import { useUser } from '@/firebase';
import { normalizeCityKey } from '@/lib/types';
import { useMemo } from 'react';
import { CITIES, GLOBAL_CENTER } from '@/lib/cityData';

export function useMunicipalContext() {
    const { profile, loading } = useUser();

    const cityKey = useMemo(() => {
        if (!profile) return null;
        
        // Admin-level override (for Super Admin & Admin Global)
        const savedCityKey = typeof window !== 'undefined' ? localStorage.getItem('vamo_selected_city') : null;
        const isAdminType = profile.role === 'admin' || profile.role === 'superadmin';

        if (isAdminType && savedCityKey) {
            return normalizeCityKey(savedCityKey);
        }

        // Default for SuperAdmin/Admin if no city selected
        if (isAdminType && !savedCityKey) {
            return 'rawson'; // Default starting point for global admins
        }

        // Standard municipal role fallback
        const rawCity = profile.cityKey || profile.city;
        return rawCity ? normalizeCityKey(rawCity) : null;
    }, [profile]);

    const isContextAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

    const setCityOverride = (newCity: string) => {
        if (typeof window !== 'undefined') {
            console.log('🏁 [CONTEXT] Setting city override:', newCity);
            localStorage.setItem('vamo_selected_city', newCity);
            // Force reload context or window if needed, but usually useMemo will catch it on next render
            window.location.reload(); 
        }
    };

    const cityName = useMemo(() => {
        if (!cityKey) return 'Portal Municipal';
        return CITIES[cityKey]?.name || profile?.city || 'Portal Municipal';
    }, [cityKey, profile?.city]);

    const cityCenter = useMemo(() => {
        if (!cityKey) return GLOBAL_CENTER;
        return CITIES[cityKey]?.center || GLOBAL_CENTER;
    }, [cityKey]);

    const cityZoom = useMemo(() => {
        if (!cityKey) return 11;
        return CITIES[cityKey]?.zoom || 13;
    }, [cityKey]);

    const isGlobalAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
    const isMuniAdmin   = profile?.role === 'admin_municipal' || isGlobalAdmin;
    const isOperator    = profile?.role === 'operator_municipal' || isMuniAdmin;
    const isTreasury    = profile?.role === 'treasury_municipal' || isMuniAdmin;
    const isTraffic     = profile?.role === 'traffic_municipal' || isMuniAdmin;
    const isAuditor     = profile?.role === 'auditor_municipal' || isMuniAdmin || isOperator || isTreasury || isTraffic;

    return {
        cityKey,
        cityName,
        cityCenter,
        cityZoom,
        loading,
        isContextAdmin,
        isGlobalAdmin,
        isMuniAdmin,
        isOperator,
        isTreasury,
        isAuditor,
        isTraffic,
        setCityOverride
    };
}
