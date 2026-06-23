'use client';

import React, { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';

export function CityRecruitmentBanner({ cityKey }: { cityKey: string | undefined }) {
    const firestore = useFirestore();
    const [cityConfig, setCityConfig] = useState<any>(null);

    useEffect(() => {
        if (!firestore || !cityKey) return;
        const unsubscribe = onSnapshot(doc(firestore, `cities/${cityKey}`), (docSnap) => {
            if (docSnap.exists()) {
                setCityConfig(docSnap.data());
            }
        });
        return () => unsubscribe();
    }, [firestore, cityKey]);

    if (!cityConfig) return null;

    const opStatus = cityConfig.operationalStatus;
    if (opStatus !== 'recruiting_drivers' && opStatus !== 'ready_for_passengers') {
        return null; // Don't show if active or invited
    }

    const estimatedDate = cityConfig.driverRecruitment?.estimatedLaunchDate 
        ? new Date(cityConfig.driverRecruitment.estimatedLaunchDate).toLocaleDateString()
        : 'a confirmar';

    return (
        <div className="p-4 rounded-2xl mb-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex flex-col gap-2 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <VamoIcon name="megaphone" className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-black text-sm leading-tight uppercase tracking-widest">{cityConfig.name} en expansión</p>
                    <p className="text-xs opacity-90 mt-0.5 font-medium">Estamos en etapa de reclutamiento de conductores.</p>
                </div>
            </div>
            <div className="mt-2 text-[10px] text-indigo-400/80 font-bold bg-black/20 p-2 rounded-lg border border-indigo-500/10">
                <p>Fecha estimada de lanzamiento: <span className="text-indigo-300 font-black">{estimatedDate}</span>.</p>
                <p className="mt-1">Te avisaremos cuando VamO esté activo para recibir viajes. Podés continuar con la carga de tu documentación.</p>
            </div>
        </div>
    );
}
