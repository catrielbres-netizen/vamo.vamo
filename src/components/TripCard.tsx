
'use client';

import { RideStatusInfo } from '@/lib/ride-status';
import { Progress } from './ui/progress';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { Place } from '@/lib/types';
import { Input } from './ui/input';
import { useState } from 'react';


export function TripCard({
  status,
  origin,
  destination,
  onDestinationSelect,
  isInteractive,
}: {
  status: string;
  origin: string;
  destination: Place | null;
  onDestinationSelect: (place: Place | null) => void;
  isInteractive: boolean;
}) {
  const statusInfo = RideStatusInfo[status as keyof typeof RideStatusInfo] || {
    text: '¿A dónde vamos?',
    icon: <></>,
    progress: 0,
  };

  return (
    <div className="m-4 p-4 rounded-xl shadow-lg bg-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-6 flex justify-center">{statusInfo.icon}</div>
        <span className="text-sm text-primary font-semibold">
          {statusInfo.text}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center">
          <span className="w-16 text-muted-foreground">Origen:</span>
          <p className="font-medium">{origin || 'Ubicación actual'}</p>
        </div>
        <div className="flex items-center">
          <span className="w-16 text-muted-foreground">Destino:</span>
          {isInteractive ? (
            <PlaceAutocomplete onPlaceSelect={onDestinationSelect} />
          ) : (
            <p className="font-medium">{destination?.address || '—'}</p>
          )}
        </div>
      </div>
      {status !== 'idle' && status !== 'finished' && status !== 'cancelled' && (
         <Progress value={statusInfo.progress} className="w-full h-2 mt-4" />
      )}
    </div>
  );
}
