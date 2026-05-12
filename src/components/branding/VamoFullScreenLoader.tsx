'use client';

import React from 'react';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { cn } from '@/lib/utils';

interface VamoFullScreenLoaderProps {
    label?: string;
    showSpinner?: boolean;
    className?: string;
}

export function VamoFullScreenLoader({ 
    label = "Iniciando VamO...", 
    showSpinner = true,
    className
}: VamoFullScreenLoaderProps) {
    return (
        <div className={cn(
            "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a] px-4 overflow-hidden animate-in fade-in duration-1000",
            className
        )}>
            {/* Ultra-Soft Premium Background Glows */}
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-600/5 blur-[160px] rounded-full animate-pulse duration-[5000ms]" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-indigo-900/5 blur-[160px] rounded-full animate-pulse duration-[7000ms]" />
            
            <div className="relative flex flex-col items-center space-y-10">
                {/* Logo with Soft Dynamic Glow */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-500/10 blur-[40px] rounded-full scale-125 animate-pulse duration-[3000ms]" />
                    <div className="relative z-10 w-24 h-auto transform transition-transform duration-[3000ms] hover:scale-105">
                        <VamoLogo variant="auth" priority />
                    </div>
                </div>

                <div className="flex flex-col items-center space-y-5">
                    {showSpinner && (
                        <div className="relative w-12 h-12">
                            <div className="absolute inset-0 border-[3px] border-indigo-500/5 rounded-full" />
                            <div className="absolute inset-0 border-[3px] border-t-indigo-500/80 rounded-full animate-spin duration-[1500ms] shadow-[0_0_20px_rgba(99,102,241,0.2)]" />
                        </div>
                    )}
                    
                    <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-300 fill-mode-both">
                        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/60 text-center">
                            {label}
                        </p>
                        <div className="mt-3 w-40 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
                    </div>
                </div>
            </div>

            <div className="absolute bottom-12 text-[9px] font-bold text-zinc-800 uppercase tracking-[0.3em] opacity-50">
                Secure Environment — VamO Engine
            </div>
        </div>
    );
}
