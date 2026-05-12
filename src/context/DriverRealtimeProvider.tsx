'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useDriverRealtime, DriverRealtimeData } from '@/hooks/useDriverRealtime';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

const DriverRealtimeContext = createContext<DriverRealtimeData | undefined>(undefined);

export function DriverRealtimeProvider({ children }: { children: ReactNode }) {
    const data = useDriverRealtime();

    // BLOQUEO DE RENDER DETERMINÍSTICO (Uber style)
    // No permitimos que ningún hijo se renderice hasta que la data base esté lista.
    if (!data.ready) {
        return <VamoFullScreenLoader label="Sincronizando sistema realtime..." />;
    }

    return (
        <DriverRealtimeContext.Provider value={data}>
            {children}
        </DriverRealtimeContext.Provider>
    );
}

export function useDriverData() {
    const context = useContext(DriverRealtimeContext);
    if (context === undefined) {
        throw new Error('useDriverData must be used within a DriverRealtimeProvider');
    }
    return context;
}
