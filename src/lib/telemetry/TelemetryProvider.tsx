'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { TelemetryService } from './index';

const TelemetryContext = createContext<TelemetryService | null>(null);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
    const db = useFirestore();
    const { user, profile } = useUser();

    const service = useMemo(() => {
        if (!db) return null;
        const telemetry = new TelemetryService(db);
        
        // Wrap trackEvent to automatically inject user context
        const originalTrack = telemetry.trackEvent.bind(telemetry);
        telemetry.trackEvent = (event, throttleMs) => {
            return originalTrack({
                userId: user?.uid || null,
                role: profile?.role || null,
                cityKey: profile?.cityKey || null,
                ...event
            }, throttleMs);
        };

        return telemetry;
    }, [db, user?.uid, profile?.role, profile?.cityKey]);

    return (
        <TelemetryContext.Provider value={service}>
            {children}
        </TelemetryContext.Provider>
    );
}

export function useTelemetry() {
    const context = useContext(TelemetryContext);
    if (!context) {
        // Fallback to avoid crashes if provider is missing
        console.warn("[TELEMETRY_WARN] useTelemetry used outside of TelemetryProvider. Events will only be logged to console.");
        return {
            trackEvent: async (event: any) => console.log("[TELEMETRY_MOCK]", event),
            trackRideLifecycle: async () => {},
            trackMatching: async () => {},
            trackPresence: async () => {},
            trackError: async () => {}
        } as unknown as TelemetryService;
    }
    return context;
}
