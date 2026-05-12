'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/lib/types';

// -------------------------------------------------------
// Tabla de niveles Express — DEBE COINCIDIR con
// functions/src/lib/passengerProgress.ts (Fase 7.1)
// -------------------------------------------------------
export interface ExpressTier {
    minRides: number;
    discount: number;
    label: string;
}

export const EXPRESS_TIERS: ExpressTier[] = [
    { minRides: 0,  discount: 0,  label: 'Sin descuento' },
    { minRides: 3,  discount: 5,  label: '5% Express'    },
    { minRides: 6,  discount: 8,  label: '8% Express'    },
    { minRides: 10, discount: 10, label: '10% Express'   },
    { minRides: 15, discount: 12, label: '12% Express'   },
    { minRides: 25, discount: 15, label: '15% Express'   },
];

export function getExpressTierInfo(ridesThisWeek: number) {
    // Nivel actual
    const currentTier = [...EXPRESS_TIERS].reverse().find(t => ridesThisWeek >= t.minRides)
        ?? EXPRESS_TIERS[0];
    // Siguiente nivel
    const nextTier = EXPRESS_TIERS.find(t => t.minRides > ridesThisWeek) ?? null;
    const ridesNeeded = nextTier ? nextTier.minRides - ridesThisWeek : 0;

    // Progreso dentro del tramo actual → siguiente
    const prevMin = currentTier.minRides;
    const nextMin = nextTier?.minRides ?? currentTier.minRides;
    const rangeSize = nextMin - prevMin;
    const progressPct = rangeSize > 0
        ? Math.min(((ridesThisWeek - prevMin) / rangeSize) * 100, 100)
        : 100;

    return { currentTier, nextTier, ridesNeeded, progressPct };
}

// -------------------------------------------------------
// Widget compacto: para la pantalla de pedir viaje
// -------------------------------------------------------
interface ExpressProgressWidgetProps {
    profile: UserProfile | null | undefined;
    className?: string;
    /** Si true muestra versión minimalista de una línea */
    compact?: boolean;
}

export function ExpressProgressWidget({ profile, className, compact = false }: ExpressProgressWidgetProps) {
    const rides = profile?.passengerProgress?.ridesThisWeek ?? 0;
    const { currentTier, nextTier, ridesNeeded, progressPct } = getExpressTierInfo(rides);

    if (compact) {
        // Una sola línea para mostrar debajo del botón de servicio
        if (currentTier.discount === 0 && !nextTier) return null;
        return (
            <p className={cn('text-[10px] font-bold text-zinc-500 text-center leading-snug', className)}>
                {currentTier.discount > 0
                    ? `⚡ ${currentTier.discount}% activo esta semana · ${ridesNeeded > 0 ? `${ridesNeeded} viajes para ${nextTier?.discount}%` : '¡Nivel máximo!'}`
                    : `⚡ Completá ${ridesNeeded} viajes para activar ${nextTier?.discount}% Express`}
            </p>
        );
    }

    return (
        <div className={cn('rounded-2xl bg-zinc-900/60 border border-white/5 p-4 space-y-3', className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center">
                        <VamoIcon name="zap" className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                        Progreso Express
                    </span>
                </div>
                <span className="text-[11px] font-black text-white">
                    {rides} viaje{rides !== 1 ? 's' : ''} esta semana
                </span>
            </div>

            {/* Descuento actual */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Tu descuento ahora</p>
                    <p className={cn(
                        'text-xl font-black leading-tight',
                        currentTier.discount > 0 ? 'text-indigo-400' : 'text-zinc-600'
                    )}>
                        {currentTier.discount > 0 ? `${currentTier.discount}%` : '0%'}
                    </p>
                    <p className="text-[9px] text-zinc-600 font-bold">
                        {currentTier.discount > 0 ? currentTier.label : 'Sin descuento aún'}
                    </p>
                </div>
                {nextTier && (
                    <div className="text-right">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Próximo nivel</p>
                        <p className="text-xl font-black text-white leading-tight">{nextTier.discount}%</p>
                        <p className="text-[9px] text-amber-500 font-bold">
                            {ridesNeeded === 1 ? '¡Falta 1 viaje!' : `Faltan ${ridesNeeded} viajes`}
                        </p>
                    </div>
                )}
                {!nextTier && (
                    <div className="text-right">
                        <span className="text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-full uppercase tracking-widest">
                            ⚡ Nivel máximo
                        </span>
                    </div>
                )}
            </div>

            {/* Barra de progreso */}
            {nextTier && (
                <div className="space-y-1">
                    <Progress value={progressPct} className="h-1.5 bg-white/5 [&>div]:bg-indigo-500" />
                    <p className="text-[9px] text-zinc-600 font-bold text-right">
                        {rides} / {nextTier.minRides} viajes para {nextTier.discount}%
                    </p>
                </div>
            )}

            {/* Mensaje motivacional */}
            <p className="text-[10px] text-zinc-500 italic leading-snug px-0.5">
                {currentTier.discount === 0
                    ? `Completá ${ridesNeeded} viaje${ridesNeeded !== 1 ? 's' : ''} Express esta semana para desbloquear tu primer descuento.`
                    : nextTier
                        ? `Llevás ${rides} viajes. Tenés ${currentTier.discount}% Express. Te faltan ${ridesNeeded} para llegar al ${nextTier.discount}%.`
                        : `¡Felicitaciones! Tenés el máximo descuento Express: 15%. Seguí así.`}
            </p>
        </div>
    );
}

// -------------------------------------------------------
// Bloque de comprobante: para FinishedRideSummary
// -------------------------------------------------------
interface ExpressReceiptProgressProps {
    profile: UserProfile | null | undefined;
    /** Viajes ANTES de este viaje (el backend ya los actualizó, leemos post-actualización) */
    className?: string;
}

export function ExpressReceiptProgress({ profile, className }: ExpressReceiptProgressProps) {
    const rides = profile?.passengerProgress?.ridesThisWeek ?? 0;
    const { currentTier, nextTier, ridesNeeded, progressPct } = getExpressTierInfo(rides);

    return (
        <div className={cn(
            'rounded-2xl bg-indigo-500/5 border border-indigo-500/10 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700',
            className
        )}>
            <div className="flex items-center gap-2 mb-1">
                <VamoIcon name="zap" className="w-4 h-4 text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    Tu progreso Express
                </span>
            </div>

            {/* Rides count pill */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-black text-white leading-tight">
                        {rides} viaje{rides !== 1 ? 's' : ''} esta semana
                    </p>
                    <p className="text-[10px] text-zinc-500 font-bold">
                        {currentTier.discount > 0
                            ? `Descuento activo: ${currentTier.discount}%`
                            : 'Sin descuento activo aún'}
                    </p>
                </div>
                {nextTier ? (
                    <div className="text-right">
                        <p className="text-[10px] text-amber-400 font-black">
                            {ridesNeeded === 1 ? '¡Falta 1 viaje!' : `Faltan ${ridesNeeded} viajes`}
                        </p>
                        <p className="text-[9px] text-zinc-500 font-bold">para el {nextTier.discount}%</p>
                    </div>
                ) : (
                    <span className="text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-full uppercase tracking-widest">
                        Nivel máximo
                    </span>
                )}
            </div>

            {nextTier && (
                <div className="space-y-1">
                    <Progress value={progressPct} className="h-1 bg-white/5 [&>div]:bg-indigo-500" />
                    <p className="text-[9px] text-zinc-600 font-bold text-right">
                        {rides} / {nextTier.minRides}
                    </p>
                </div>
            )}
        </div>
    );
}
