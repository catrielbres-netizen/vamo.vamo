'use client';

import React from 'react';
import { VamoIcon } from "./VamoIcon";
import { useUser } from '@/firebase';
import { ExpressProgressWidget, getExpressTierInfo } from './ExpressProgressWidget';
import { featureFlags } from '@/config/features';

const SERVICES = [
  { id: 'professional', label: '🛡️ Profesional', desc: 'Servicio habilitado de Taxis y Remises.' },
  { id: 'express',      label: '⚡ Express',      desc: '' }, // desc se genera dinámicamente
];

interface ServiceSelectorProps {
    value: string;
    onChange: (service: string) => void;
}

export function ServiceSelector({ value, onChange }: ServiceSelectorProps) {
  const { profile } = useUser();

  const ridesThisWeek = profile?.passengerProgress?.ridesThisWeek ?? 0;
  const { isUnlocked, ridesNeeded } = getExpressTierInfo(ridesThisWeek);
  const currentDiscount = isUnlocked ? 20 : 0;

  // Express visible para todos — el descuento varía según el nivel (puede ser 0%)
  // Admin siempre ve Express
  const canSeeExpress = true;

  // Descripción dinámica de Express según nivel actual
  const expressDesc = currentDiscount > 0
    ? `${currentDiscount}% de descuento · ¡Nivel máximo!`
    : `Completá ${ridesNeeded} viaje${ridesNeeded !== 1 ? 's' : ''} para activar 20% de dto.`;

  const visibleServices = SERVICES.map(s =>
    s.id === 'express' ? { ...s, desc: expressDesc } : s
  ).filter(s => {
    if (s.id === 'express' && !canSeeExpress) return false;
    if (s.id === 'professional' && !featureFlags.taxiRemisEnabled) return false;
    return true;
  });

  return (
    <div className="mx-4 mb-4 grid gap-3">
      {visibleServices.map(s => (
            <button
                key={s.id}
                id={`service-selector-${s.id}`}
                onClick={() => onChange(s.id)}
                className={`p-4 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                    value === s.id
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/5'
                        : 'bg-zinc-900/40 border-white/5 hover:bg-zinc-900/60'
                }`}
            >
                <div className="flex justify-between items-center gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                        <p className="font-black text-white italic tracking-tight">{s.label}</p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Badge de descuento — solo para Express */}
                        {s.id === 'express' && (
                            currentDiscount > 0 ? (
                                <span className="text-[9px] font-black bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                                    {currentDiscount}% dto.
                                </span>
                            ) : (
                                <span className="text-[9px] font-black bg-zinc-800/80 text-zinc-500 border border-white/5 px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                                    Sin dto. todavía
                                </span>
                            )
                        )}
                        {/* Checkmark de selección */}
                        {value === s.id && (
                            <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center animate-in zoom-in duration-300">
                                 <VamoIcon name="check" className="w-3.5 h-3.5 text-white" />
                            </div>
                        )}
                    </div>
                </div>
            </button>
        )
      )}

      {/* Widget de progreso Express — siempre visible cuando Express está seleccionado */}
      {value === 'express' && (
          <ExpressProgressWidget
              profile={profile}
              className="mt-1"
          />
      )}

      {/* Mensaje motivacional si Express NO está seleccionado y el descuento es 0% */}
      {value !== 'express' && currentDiscount === 0 && (
          <div className="p-3 rounded-2xl bg-zinc-950/50 border border-dashed border-indigo-500/20 text-center">
              <p className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.2em] mb-0.5">⚡ Descuento Express</p>
              <p className="text-[11px] text-zinc-500 italic">
                  Completá {ridesNeeded} viaje{ridesNeeded !== 1 ? 's' : ''} esta semana para activar 20% de descuento.
              </p>
          </div>
      )}
    </div>
  );
}
