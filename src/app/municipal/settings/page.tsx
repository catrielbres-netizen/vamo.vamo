'use client';

import React from 'react';
import { ThemeCustomizer } from '@/components/settings/ThemeCustomizer';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

export default function MunicipalSettingsPage() {
    const { cityName } = useMunicipalContext();

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-700">
            {/* Header */}
            <div className="mb-8">
                <span className="text-[#1D7CFF] font-black uppercase tracking-[0.3em] text-[10px]">
                    Personalización del Portal
                </span>
                <h1 className="text-4xl font-black text-foreground mt-2 uppercase italic tracking-tighter leading-none">
                    Diseño Visual <span className="text-[#1D7CFF]">{cityName}</span>
                </h1>
                <p className="text-muted-foreground text-xs mt-2 uppercase font-black tracking-widest">
                    Ajustá la paleta de colores, bordes y texturas de tu panel municipal.
                </p>
            </div>

            <div className="bg-card border border-border p-6 sm:p-8 rounded-[2.5rem]">
                <ThemeCustomizer />
            </div>
        </div>
    );
}
