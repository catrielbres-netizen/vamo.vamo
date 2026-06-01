'use client';

import React from 'react';
import Image from 'next/image';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { cn } from '@/lib/utils';
import vamoLogo from "../../../public/branding/vamo-logo.png";

export type VamoFullScreenLoaderProps = {
    label?: string;
    message?: string; // Alias for label for safety
    showSpinner?: boolean;
    variant?: "centered" | "cover";
    className?: string;
};

export function VamoFullScreenLoader({ 
    label,
    message,
    showSpinner = true,
    variant = "cover", // Cover is now the default for a premium, fullscreen splash transition across the entire app
    className
}: VamoFullScreenLoaderProps) {
    const activeLabel = message || label || "Iniciando VamO...";

    if (variant === 'cover') {
        return (
            <div className={cn(
                "fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-[#030712] flex flex-col items-center justify-center animate-in fade-in duration-1000",
                className
            )}>
                {/* Breathing Brand Gradient Glows */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_55%)] animate-pulse duration-[6000ms] pointer-events-none" />
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center justify-center space-y-12 w-full max-w-[85vw]">
                    {/* Centered Large Logo with Premium Glow - No small constraint wrapper */}
                    <div className="relative group flex items-center justify-center w-full">
                        <div className="absolute inset-0 bg-indigo-500/10 blur-[50px] rounded-full scale-125 animate-pulse duration-[3000ms] pointer-events-none" />
                        <div className="relative z-10 w-[70vw] max-w-[420px] md:max-w-[480px] h-auto transform transition-transform duration-[3000ms] hover:scale-105 flex items-center justify-center">
                            <Image
                                src={vamoLogo}
                                alt="VamO"
                                priority
                                className="w-full h-auto object-contain object-center drop-shadow-[0_4px_30px_rgba(99,102,241,0.2)]"
                            />
                        </div>
                    </div>

                    {/* Loader and Text Block */}
                    <div className="flex flex-col items-center space-y-6">
                        {showSpinner && (
                            <div className="relative w-12 h-12">
                                <div className="absolute inset-0 border-[3px] border-indigo-500/5 rounded-full" />
                                <div className="absolute inset-0 border-[3px] border-t-indigo-500/80 rounded-full animate-spin duration-[1200ms] shadow-[0_0_20px_rgba(99,102,241,0.3)]" />
                            </div>
                        )}
                        
                        <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-300 fill-mode-both">
                            <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/90 text-center drop-shadow-md">
                                {activeLabel}
                            </p>
                            <div className="mt-3 w-48 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-12 text-[9px] font-bold text-zinc-700 uppercase tracking-[0.3em] opacity-40 pointer-events-none z-10">
                    Secure Environment — VamO Engine
                </div>
            </div>
        );
    }

    // Default centered variant
    return (
        <div className={cn(
            "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a] px-4 overflow-hidden animate-in fade-in duration-1000",
            className
        )}>
            {/* Ultra-Soft Premium Background Glows */}
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-600/5 blur-[160px] rounded-full animate-pulse duration-[5000ms] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-indigo-900/5 blur-[160px] rounded-full animate-pulse duration-[7000ms] pointer-events-none" />
            
            <div className="relative flex flex-col items-center space-y-10">
                {/* Logo with Soft Dynamic Glow */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-500/10 blur-[40px] rounded-full scale-125 animate-pulse duration-[3000ms]" />
                    {/* Fixed parent wrapper to exactly match variantClass["auth"] (w-[140px]) to prevent overflow and right-shifting */}
                    <div className="relative z-10 w-[140px] h-auto transform transition-transform duration-[3000ms] hover:scale-105 flex items-center justify-center">
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
                            {activeLabel}
                        </p>
                        <div className="mt-3 w-40 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
                    </div>
                </div>
            </div>

            <div className="absolute bottom-12 text-[9px] font-bold text-zinc-800 uppercase tracking-[0.3em] opacity-50 pointer-events-none">
                Secure Environment — VamO Engine
            </div>
        </div>
    );
}
