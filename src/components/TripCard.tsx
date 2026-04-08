
'use client';

import React from 'react';
import { RideStatusInfo } from '@/lib/ride-status';
import { Progress } from './ui/progress';
import { Place } from '@/lib/types';
import { VamoIcon } from './VamoIcon';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';


export function TripCard({
  status,
  origin,
  destination,
}: {
  status: string;
  origin: Place | null;
  destination: Place | null;
}) {
  const statusInfo = RideStatusInfo[status as keyof typeof RideStatusInfo] || {
    text: 'Buscando conductor',
    icon: 'search',
    progress: 10,
  };
  
  const iconClass = status === 'in_progress' ? "animate-pulse" : "";

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <VamoIcon name={statusInfo.icon} className={`w-4 h-4 text-primary ${iconClass}`} />
        <span className="text-sm font-bold text-foreground uppercase tracking-wider">
          {statusInfo.text}
        </span>
      </div>

      <div className="relative flex flex-col gap-4 pl-1">
        {/* Connected line */}
        <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border z-0" />
        
        <div className="relative z-10 flex items-start gap-4">
            <div className="mt-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
                <div className="w-1.5 h-1.5 bg-background rounded-full" />
            </div>
            <div>
                <p className="font-semibold text-foreground text-sm leading-tight">{origin?.address || 'Esperando origen...'}</p>
                <p className="text-muted-foreground text-xs mt-0.5">Punto de partida</p>
            </div>
        </div>
        
        <div className="relative z-10 flex items-start gap-4">
            <div className="mt-1 w-4 h-4 rounded-sm bg-accent/20 flex items-center justify-center shrink-0 border border-accent">
                <div className="w-1.5 h-1.5 bg-accent rounded-sm" />
            </div>
            <div>
                <p className="font-semibold text-foreground text-sm leading-tight">{destination?.address || 'Esperando destino...'}</p>
                <p className="text-muted-foreground text-xs mt-0.5">Punto de llegada</p>
            </div>
        </div>
      </div>
      
      {status !== 'searching' && (
        <Progress value={statusInfo.progress} className="w-full h-1.5 mt-5 bg-border rounded-full [&>div]:bg-primary" />
      )}
    </div>
  );
}
