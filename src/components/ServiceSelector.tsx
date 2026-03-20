
'use client';

import React from 'react';
import { VamoIcon } from "./VamoIcon";

const SERVICES = [
  { id: 'premium', label: '🚕 Premium', desc: 'Servicio estándar de Taxis y Remises.' },
  { id: 'express', label: '⚡ Express', desc: 'La opción más económica (10% de dto).' },
];

interface ServiceSelectorProps {
    value: string;
    onChange: (service: string) => void;
}

export function ServiceSelector({ value, onChange }: ServiceSelectorProps) {
  
  return (
    <div className="m-4 grid gap-2">
      {SERVICES.map(s => (
            <button
                key={s.id}
                onClick={() => onChange(s.id)}
                className={`p-3 rounded-xl border text-left transition-colors relative overflow-hidden ${
                    value === s.id ? 'border-primary bg-primary/10' : 'bg-card'
                } hover:bg-accent`}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-medium">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                </div>
            </button>
        )
      )}
    </div>
  );
}

    
