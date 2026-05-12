'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';

interface TutorialStep {
    title: string;
    description: string;
    icon: string;
    target?: string; // For highlighting (future)
}

const STEPS: TutorialStep[] = [
    {
        title: "¡Bienvenido a VamO!",
        description: "Pedir un viaje es más simple que nunca. Seguí esta guía rápida.",
        icon: "map"
    },
    {
        title: "Elegí tu destino",
        description: "Buscá a dónde querés ir en la barra superior. Te daremos el mejor precio.",
        icon: "search"
    },
    {
        title: "Seguí tu viaje",
        description: "Podrás ver al conductor en tiempo real y compartir tu ubicación por seguridad.",
        icon: "car"
    },
    {
        title: "Pagá como quieras",
        description: "Efectivo, Transferencia o Mercado Pago. Vos elegís al final del viaje.",
        icon: "wallet"
    }
];

export function TutorialOverlay({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(0);

    const isLastStep = step === STEPS.length - 1;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative bg-zinc-900 border border-white/10 rounded-[3rem] p-8 max-w-sm w-full text-center space-y-8 shadow-2xl"
            >
                <div className="relative mx-auto w-24 h-24 bg-indigo-600/10 rounded-full flex items-center justify-center border border-indigo-500/20">
                    <VamoIcon name={STEPS[step].icon as any} className="h-10 w-10 text-indigo-500" />
                    <div className="absolute inset-0 bg-indigo-600/20 rounded-full animate-ping opacity-20" />
                </div>

                <div className="space-y-3">
                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">{STEPS[step].title}</h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">{STEPS[step].description}</p>
                </div>

                <div className="flex flex-col gap-3">
                    <Button 
                        onClick={() => isLastStep ? onComplete() : setStep(s => s + 1)}
                        className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl"
                    >
                        {isLastStep ? "¡Entendido, vamos!" : "Siguiente"}
                    </Button>
                    
                    <div className="flex justify-center gap-1.5 pt-2">
                        {STEPS.map((_, i) => (
                            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-indigo-500' : 'w-1.5 bg-zinc-800'}`} />
                        ))}
                    </div>
                </div>

                <button 
                    onClick={onComplete}
                    className="absolute top-6 right-6 text-zinc-600 hover:text-white transition-colors"
                >
                    <VamoIcon name="x" className="h-5 w-5" />
                </button>
            </motion.div>
        </div>
    );
}
