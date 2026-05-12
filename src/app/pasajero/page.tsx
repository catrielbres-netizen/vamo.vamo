'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

/**
 * [VamO PASAJERO] Welcome Screen
 * Entry point for the Play Store TWA experience.
 */
export default function PasajeroWelcomePage() {
    const router = useRouter();

    return (
        <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-between p-8 pb-16 overflow-hidden relative">
            {/* Background Glow */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

            {/* Top Branding */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="mt-20 flex flex-col items-center gap-6"
            >
                <div className="w-[180px]">
                    <VamoLogo variant="login" priority />
                </div>
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">
                        Viajá <span className="text-indigo-500 underline underline-offset-8 decoration-indigo-500/30">Diferente</span>
                    </h1>
                    <p className="text-zinc-500 font-bold uppercase tracking-[0.3em] text-[10px]">
                        Rawson • Trelew • Comodoro
                    </p>
                </div>
            </motion.div>

            {/* Center Visual / Illustration Space */}
            <div className="flex-1 flex items-center justify-center">
                <motion.div
                    animate={{ 
                        scale: [1, 1.05, 1],
                        opacity: [0.3, 0.5, 0.3]
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="w-64 h-64 bg-indigo-600/5 rounded-full border border-indigo-500/10 flex items-center justify-center"
                >
                    <div className="w-48 h-48 bg-indigo-600/10 rounded-full border border-indigo-500/20" />
                </motion.div>
            </div>

            {/* Bottom Actions */}
            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                className="w-full max-w-sm space-y-4"
            >
                <Button 
                    onClick={() => router.push('/pasajero/onboarding')}
                    className="w-full h-16 bg-white text-black hover:bg-zinc-200 font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-white/5 active:scale-[0.98] transition-all"
                >
                    Empezar Ahora
                </Button>
                
                <div className="text-center">
                    <button 
                        onClick={() => router.push('/login')}
                        className="text-[11px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-all"
                    >
                        Ya tengo cuenta • <span className="text-indigo-400">Ingresar</span>
                    </button>
                </div>

                <div className="pt-8 text-center">
                    <p className="text-[9px] font-black text-zinc-800 uppercase tracking-[0.2em]">
                        VamO PRO Identity Engine • v6.2
                    </p>
                </div>
            </motion.div>
        </main>
    );
}
