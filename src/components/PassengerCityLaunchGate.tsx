'use client';

import React, { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { VamoLogo } from '@/components/branding/VamoLogo';

export function PassengerCityLaunchGate({ 
    cityKey, 
    children 
}: { 
    cityKey: string | undefined | null,
    children: React.ReactNode 
}) {
    const firestore = useFirestore();
    const [cityConfig, setCityConfig] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !cityKey) {
            setLoading(false);
            return;
        }

        const unsubscribe = onSnapshot(doc(firestore, `cities/${cityKey}`), (docSnap) => {
            if (docSnap.exists()) {
                setCityConfig(docSnap.data());
            } else {
                setCityConfig(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [firestore, cityKey]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-[#050816] flex flex-col items-center justify-center z-[100]">
                <VamoLogo className="w-32 animate-pulse mb-8" />
            </div>
        );
    }

    if (!cityKey || (!cityConfig && !loading)) {
        return (
            <div className="fixed inset-0 bg-[#050816] z-[100] flex flex-col items-center justify-center p-6 text-center text-white">
                <VamoIcon name="map-pin" className="w-16 h-16 text-zinc-600 mb-6" />
                <h2 className="text-2xl font-black uppercase tracking-tighter mb-4">Aún no llegamos</h2>
                <p className="text-zinc-400 mb-8 max-w-sm">
                    VamO todavía no está disponible en esta ciudad. No se pueden pedir viajes por el momento.
                </p>
            </div>
        );
    }

    const opStatus = cityConfig?.operationalStatus;
    const isPassengerEnabled = cityConfig?.passengerAccess?.enabled;

    const isOperative = opStatus === 'active' || isPassengerEnabled === true;

    if (isOperative) {
        return <>{children}</>;
    }

    const targetDrivers = cityConfig?.driverRecruitment?.targetApprovedDrivers || 50;
    const approvedDrivers = cityConfig?.driverRecruitment?.approvedDriversCount || 0;
    
    const estimatedDate = cityConfig?.driverRecruitment?.estimatedLaunchDate 
        ? new Date(cityConfig.driverRecruitment.estimatedLaunchDate).toLocaleDateString()
        : 'a confirmar';

    return (
        <div className="fixed inset-0 bg-[#050816] z-[100] flex flex-col items-center justify-center p-6 text-center text-white overflow-y-auto">
            <div className="w-full max-w-md flex flex-col items-center py-10">
                <div className="h-20 w-20 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mb-6">
                    <VamoIcon name="megaphone" className="h-10 w-10 text-indigo-400" />
                </div>
                
                <h2 className="text-3xl font-black uppercase tracking-tighter text-white mb-4">
                    VamO se está preparando en {cityConfig?.name || cityKey}
                </h2>
                
                <p className="text-zinc-400 mb-8 leading-relaxed">
                    Estamos sumando conductores habilitados antes de activar los viajes para pasajeros.
                    <br/><br/>
                    Muy pronto vas a poder pedir viajes desde la app.
                </p>

                <div className="w-full bg-zinc-900/50 rounded-2xl p-5 mb-8 text-left border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-zinc-400">Estado</span>
                        <span className="text-sm font-bold text-indigo-400 uppercase tracking-wider text-right">
                            {opStatus === 'recruiting_drivers' ? 'Reclutando conductores' : 'En preparación'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-zinc-400">Conductores aprobados</span>
                        <span className="text-sm font-bold text-white">
                            {approvedDrivers} / {targetDrivers}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-zinc-400">Lanzamiento estimado</span>
                        <span className="text-sm font-bold text-white">
                            {estimatedDate}
                        </span>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="mt-4 h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-500 transition-all duration-1000" 
                            style={{ width: `${Math.min(100, Math.max(0, (approvedDrivers / targetDrivers) * 100))}%` }}
                        />
                    </div>
                </div>

                <Button className="w-full h-14 text-base font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    onClick={() => {
                        alert("Próximamente vas a poder dejar tu aviso.");
                    }}
                >
                    Avisarme cuando esté disponible
                </Button>
            </div>
        </div>
    );
}
