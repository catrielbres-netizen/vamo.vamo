'use client';

import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { motion, AnimatePresence } from 'framer-motion';

export function PWAInstallationGate({ children }: { children: React.ReactNode }) {
    const { canInstall, triggerInstall } = usePWAInstall();
    const [isStandalone, setIsStandalone] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [showGate, setShowGate] = useState(true);

    useEffect(() => {
        setIsMounted(true);
        const checkStandalone = () => {
            const isS = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
            setIsStandalone(isS);
            
            // Basic mobile detection
            const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            setIsMobile(mobile);
        };
        
        checkStandalone();
        window.addEventListener('focus', checkStandalone);
        return () => window.removeEventListener('focus', checkStandalone);
    }, []);

    if (!isMounted) return null;

    // Si ya está instalada, ya la cerramos manualmente, o NO se puede instalar, dejamos pasar.
    if (isStandalone || !showGate || !canInstall) {
        return <>{children}</>;
    }

    return (
        <div className="fixed inset-0 z-[1000] bg-[#050816] flex items-center justify-center p-6 overflow-hidden">
            <div className="absolute inset-0 bg-morphic opacity-20 pointer-events-none" />
            
            <AnimatePresence>
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-md w-full space-y-8 text-center relative z-10"
                >
                    <div className="relative mx-auto w-24 h-24 mb-6">
                        <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping opacity-20" />
                        <div className="relative flex items-center justify-center w-full h-full bg-indigo-500/10 rounded-full border border-indigo-500/30">
                            <VamoIcon name="smartphone" className="h-10 w-10 text-indigo-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">
                            {isMobile ? 'Instalá la App' : 'Mejor en la App'} <br />
                            <span className="text-indigo-500">{isMobile ? 'para Continuar' : 'de Escritorio'}</span>
                        </h1>
                        <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                            {isMobile 
                                ? "Para garantizar tu seguridad y el correcto funcionamiento de las notificaciones y ubicación, te recomendamos usar VamO como app instalada."
                                : "Para una experiencia más fluida y acceso rápido desde tu escritorio, instalá la versión oficial de VamO."
                            }
                        </p>
                    </div>

                    <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 text-left space-y-4">
                        <div className="flex gap-4 items-start">
                            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-500 text-xs font-black shrink-0">1</div>
                            <div>
                                <p className="text-white font-bold text-sm">Mayor Seguridad</p>
                                <p className="text-zinc-500 text-xs">Acceso inmediato al botón antipánico y seguimiento en vivo.</p>
                            </div>
                        </div>
                        {isMobile && (
                            <div className="flex gap-4 items-start">
                                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-500 text-xs font-black shrink-0">2</div>
                                <div>
                                    <p className="text-white font-bold text-sm">Notificaciones Reales</p>
                                    <p className="text-zinc-500 text-xs">Recibí alertas aunque el teléfono esté bloqueado.</p>
                                </div>
                            </div>
                        )}
                        <div className="flex gap-4 items-start">
                            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-500 text-xs font-black shrink-0">{isMobile ? '3' : '2'}</div>
                            <div>
                                <p className="text-white font-bold text-sm">Estabilidad Total</p>
                                <p className="text-zinc-500 text-xs">Evitá cierres inesperados del navegador durante un viaje.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <Button 
                            onClick={triggerInstall}
                            className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-indigo-500/20 transition-all active:scale-[0.98] text-lg"
                        >
                            <VamoIcon name="download" className="mr-3 h-6 w-6" />
                            INSTALAR VAMO AHORA
                        </Button>
                        
                        <Button 
                            variant="ghost"
                            onClick={() => setShowGate(false)}
                            className="text-zinc-500 hover:text-white uppercase tracking-widest text-[10px] font-bold py-4"
                        >
                            {isMobile ? 'Continuar en el navegador (no recomendado)' : 'Continuar en la web'}
                        </Button>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
