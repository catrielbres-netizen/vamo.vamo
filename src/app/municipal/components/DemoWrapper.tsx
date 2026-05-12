'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { VamoTaxiBot } from '@/components/VamoTaxiBot';
import { cn } from '@/lib/utils';
import { VamoIcon } from '@/components/VamoIcon';

// El cursor animado simula movimientos
function DemoCursor() {
    const pathname = usePathname();
    const [position, setPosition] = useState({ x: -100, y: -100 });
    const [isClicking, setIsClicking] = useState(false);

    useEffect(() => {
        setPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        const interval = setInterval(() => {
            setPosition(prev => {
                // Move randomly but stay within screen
                const nx = prev.x + (Math.random() - 0.5) * 300;
                const ny = prev.y + (Math.random() - 0.5) * 300;
                return {
                    x: Math.max(100, Math.min(window.innerWidth - 100, nx)),
                    y: Math.max(100, Math.min(window.innerHeight - 100, ny))
                };
            });
            if (Math.random() > 0.7) {
                setIsClicking(true);
                setTimeout(() => setIsClicking(false), 200);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [pathname]);

    return (
        <div 
            className={cn(
                "fixed pointer-events-none z-[9999] transition-all duration-[2000ms] ease-in-out",
                isClicking && "scale-75 duration-200"
            )}
            style={{ left: position.x, top: position.y }}
        >
            <div className="w-5 h-5 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] border-4 border-[#1D7CFF] flex items-center justify-center opacity-80" />
        </div>
    );
}

const TOUR_STEPS = [
    {
        route: "/municipal/dashboard",
        message: "Bienvenidos a VamO Muni. Este panel permite auditar la operación del transporte local en tiempo real.",
        duration: 4500
    },
    {
        route: "/municipal/drivers",
        message: "Aquí puede visualizar la nómina de conductores registrados, diferenciados por categoría y estado de habilitación.",
        duration: 5000
    },
    {
        route: "/municipal/alerts",
        message: "El sistema genera alertas automáticas para documentación próxima a vencer, facilitando el control preventivo.",
        duration: 5000
    },
    {
        route: "/municipal/map",
        message: "Monitoreo territorial. Provee información sobre zonas con mayor demanda de servicio en la ciudad.",
        duration: 5000
    },
    {
        route: "/municipal/treasury",
        message: "Registro transparente del canon o participación municipal generada por la actividad del sistema.",
        duration: 5000
    },
    {
        route: "/municipal/dashboard",
        message: "VamO no reemplaza el rol de control del municipio. Lo provee de herramientas tecnológicas para ejercerlo.",
        duration: 6000
    }
];

export function DemoWrapper({ children }: { children: React.ReactNode }) {
    const searchParams = useSearchParams();
    const isDemo = searchParams?.get('demo') === 'true';
    const router = useRouter();
    const pathname = usePathname();
    
    const [tourStep, setTourStep] = useState(0);
    const [isTourRunning, setIsTourRunning] = useState(false);
    
    useEffect(() => {
        if (!isDemo || !isTourRunning) return;
        
        const currentStep = TOUR_STEPS[tourStep];
        if (pathname !== currentStep.route) {
            router.push(currentStep.route + '?demo=true');
        }
        
        const timer = setTimeout(() => {
            if (tourStep < TOUR_STEPS.length - 1) {
                setTourStep(prev => prev + 1);
            } else {
                setIsTourRunning(false); // Fin del tour
            }
        }, currentStep.duration);
        
        return () => clearTimeout(timer);
    }, [isTourRunning, tourStep, isDemo, pathname, router]);

    if (!isDemo) return <>{children}</>;

    const currentStepData = TOUR_STEPS[tourStep];

    return (
        <>
            {children}
            
            {isTourRunning && <DemoCursor />}
            
            <div className="fixed bottom-8 right-8 z-[100] w-[320px] bg-[#071A33] border border-[#1D7CFF]/25 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="p-4 flex gap-4 items-center bg-[#050B14]">
                    <div className="w-12 h-12 bg-[#0B1220] rounded-full flex items-center justify-center shadow-inner border border-white/5 flex-shrink-0 relative overflow-hidden">
                        <VamoTaxiBot className="w-14 h-14 object-cover absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 drop-shadow-md" />
                    </div>
                    <div>
                        <h3 className="text-white font-black text-sm uppercase tracking-widest">Asistente VamO</h3>
                        <p className="text-[#1D7CFF] text-[10px] font-bold tracking-widest uppercase">Sistema Municipal</p>
                    </div>
                </div>

                <div className="p-5 border-t border-white/5">
                    <div className="relative bg-white text-[#050B14] p-4 rounded-xl shadow-lg border border-white/10">
                        <p className="text-xs font-bold leading-relaxed">
                            {isTourRunning ? currentStepData.message : "¿Desea iniciar el tour interactivo del sistema?"}
                        </p>
                        <div className="absolute -top-2 left-6 w-4 h-4 bg-white transform rotate-45 border-l border-t border-white/10" />
                    </div>
                </div>

                <div className="p-4 border-t border-white/5 bg-[#050B14] flex justify-between items-center">
                    <div className="flex gap-1.5">
                        {TOUR_STEPS.map((_, i) => (
                            <div 
                                key={i}
                                className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                    i === tourStep && isTourRunning ? "bg-[#1D7CFF] w-4" : 
                                    i < tourStep && isTourRunning ? "bg-[#1D7CFF]/40" : "bg-white/10"
                                )}
                            />
                        ))}
                    </div>

                    {!isTourRunning ? (
                        <button 
                            onClick={() => { setTourStep(0); setIsTourRunning(true); router.push(TOUR_STEPS[0].route + '?demo=true'); }}
                            className="px-4 py-2 bg-[#1D7CFF] hover:bg-[#1560c9] text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            <VamoIcon name="play" className="w-3 h-3" /> Iniciar
                        </button>
                    ) : (
                        <button 
                            onClick={() => setIsTourRunning(false)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            <VamoIcon name="square" className="w-3 h-3" /> Detener
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
