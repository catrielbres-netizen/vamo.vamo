'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/lib/types';
import { getWeekIdentifierART } from '@/lib/timeUtils';

// -------------------------------------------------------
// Regla Express: 5 viajes para desbloquear.
// Máximo 3 usos por semana. 20% max $2000.
// -------------------------------------------------------

export function getExpressTierInfo(ridesThisWeek: number, usesThisWeek: number = 0) {
    const minRides = 5;
    const maxUses = 3;
    const isUnlocked = ridesThisWeek >= minRides;
    const usesLeft = isUnlocked ? Math.max(0, maxUses - usesThisWeek) : 0;
    
    const ridesNeeded = isUnlocked ? 0 : minRides - ridesThisWeek;
    const progressPct = isUnlocked ? 100 : Math.min((ridesThisWeek / minRides) * 100, 100);

    return { isUnlocked, usesLeft, ridesNeeded, progressPct, maxUses, usesThisWeek };
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
    const currentWeekId = getWeekIdentifierART(new Date());
    const isCurrentWeek = profile?.passengerProgress?.weekIdentifier === currentWeekId;
    const rides = isCurrentWeek ? (profile?.passengerProgress?.ridesThisWeek ?? 0) : 0;
    const uses = isCurrentWeek ? (profile?.passengerProgress?.expressUsesThisWeek ?? 0) : 0;
    const { isUnlocked, usesLeft, ridesNeeded, progressPct, maxUses } = getExpressTierInfo(rides, uses);

    if (compact) {
        if (!isUnlocked && rides === 0) return null;
        return (
            <div className={cn("bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 p-3 rounded-2xl flex flex-col gap-2 shadow-xl", className)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", isUnlocked ? "bg-indigo-500/20" : "bg-white/5")}>
                            <VamoIcon name="zap" className={cn("w-3.5 h-3.5", isUnlocked ? "text-indigo-400" : "text-zinc-500")} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white leading-tight">
                                {isUnlocked ? 'Express Activado' : 'Desbloquea Express'}
                            </span>
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider">
                                {rides} viajes esta semana
                            </span>
                        </div>
                    </div>
                    {isUnlocked ? (
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-indigo-400 border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                                {usesLeft} usos disp.
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-amber-500">
                                Faltan {ridesNeeded} viajes
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] font-bold text-zinc-400">
                        {isUnlocked ? `Ahorraste $${profile?.passengerProgress?.expressSavedAmountThisWeek || 0} esta semana` : 'Reinicia cada lunes'}
                    </span>
                    <span className="text-[9px] font-black text-indigo-400 uppercase flex items-center gap-1 hover:text-indigo-300 transition-colors">
                        Ver Beneficios <VamoIcon name="chevron-right" className="w-3 h-3" />
                    </span>
                </div>
            </div>
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
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 leading-tight">
                            Beneficio Semanal Express
                        </span>
                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-wider">
                            Reinicia cada lunes · No es mensual
                        </span>
                    </div>
                </div>
                <span className="text-[11px] font-black text-white">
                    {rides} viaje{rides !== 1 ? 's' : ''} esta semana
                </span>
            </div>

            {/* Descuento actual */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Estado</p>
                    <p className={cn(
                        'text-xl font-black leading-tight',
                        isUnlocked ? 'text-indigo-400' : 'text-zinc-600'
                    )}>
                        {isUnlocked ? `Activado` : 'Inactivo'}
                    </p>
                    <p className="text-[9px] text-zinc-600 font-bold">
                        {isUnlocked ? '20% off (max $2000)' : 'Faltan viajes'}
                    </p>
                </div>
                {!isUnlocked ? (
                    <div className="text-right">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Para activar</p>
                        <p className="text-xl font-black text-white leading-tight">5 viajes</p>
                        <p className="text-[9px] text-amber-500 font-bold">
                            {ridesNeeded === 1 ? '¡Falta 1 viaje!' : `Faltan ${ridesNeeded} viajes`}
                        </p>
                    </div>
                ) : (
                    <div className="text-right">
                        <span className={cn("text-[9px] font-black border px-2 py-1 rounded-full uppercase tracking-widest",
                            usesLeft > 0 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-zinc-800 text-zinc-500 border-zinc-700")}>
                            {usesLeft > 0 ? `⚡ Quedan ${usesLeft} usos` : 'Agotado'}
                        </span>
                    </div>
                )}
            </div>

            {/* Barra de progreso */}
            {!isUnlocked && (
                <div className="space-y-1">
                    <Progress value={progressPct} className="h-1.5 bg-white/5 [&>div]:bg-indigo-500" />
                    <p className="text-[9px] text-zinc-600 font-bold text-right">
                        {rides} / 5 viajes para activar
                    </p>
                </div>
            )}

            {/* Mensaje motivacional */}
            <p className="text-[10px] text-zinc-500 italic leading-snug px-0.5">
                {!isUnlocked
                    ? `Completá ${ridesNeeded} viaje${ridesNeeded !== 1 ? 's' : ''} Express esta semana para desbloquear tu beneficio. Reinicia cada lunes.`
                    : `Beneficio Express: ${uses} de ${maxUses} usados esta semana.`}
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
    const currentWeekId = getWeekIdentifierART(new Date());
    const isCurrentWeek = profile?.passengerProgress?.weekIdentifier === currentWeekId;
    const rides = isCurrentWeek ? (profile?.passengerProgress?.ridesThisWeek ?? 0) : 0;
    const uses = isCurrentWeek ? (profile?.passengerProgress?.expressUsesThisWeek ?? 0) : 0;
    const { isUnlocked, usesLeft, ridesNeeded, progressPct, maxUses } = getExpressTierInfo(rides, uses);

    return (
        <div className={cn(
            'rounded-2xl bg-indigo-500/5 border border-indigo-500/10 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700',
            className
        )}>
            <div className="flex items-center gap-2 mb-1">
                <VamoIcon name="zap" className="w-4 h-4 text-indigo-400" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 leading-tight">
                        Tu Progreso Express (Semanal)
                    </span>
                    <span className="text-[8px] font-black text-indigo-400/60 uppercase tracking-wider">
                        Reinicia cada lunes · No es mensual
                    </span>
                </div>
            </div>

            {/* Rides count pill */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-black text-white leading-tight">
                        {rides} viaje{rides !== 1 ? 's' : ''} esta semana
                    </p>
                    <p className="text-[10px] text-zinc-500 font-bold">
                        {isUnlocked
                            ? `Beneficio Express: ${uses} de ${maxUses} usados`
                            : 'Beneficio inactivo aún'}
                    </p>
                </div>
                {!isUnlocked ? (
                    <div className="text-right">
                        <p className="text-[10px] text-amber-400 font-black">
                            {ridesNeeded === 1 ? '¡Falta 1 viaje!' : `Faltan ${ridesNeeded} viajes`}
                        </p>
                        <p className="text-[9px] text-zinc-500 font-bold">para activar</p>
                    </div>
                ) : (
                    <span className={cn("text-[9px] font-black border px-2 py-1 rounded-full uppercase tracking-widest",
                            usesLeft > 0 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-zinc-800 text-zinc-500 border-zinc-700")}>
                        {usesLeft > 0 ? `Quedan ${usesLeft} usos` : 'Agotado'}
                    </span>
                )}
            </div>

            {!isUnlocked && (
                <div className="space-y-1">
                    <Progress value={progressPct} className="h-1 bg-white/5 [&>div]:bg-indigo-500" />
                    <p className="text-[9px] text-zinc-600 font-bold text-right">
                        {rides} / 5
                    </p>
                </div>
            )}
        </div>
    );
}
