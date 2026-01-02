
'use client';

import { RideStatusInfo } from '@/lib/ride-status';
import { Progress } from './ui/progress';
import { Place } from '@/lib/types';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { VamoIcon } from './VamoIcon';


export function TripCard({
  status,
  origin,
  destination,
  onOriginSelect,
  onDestinationSelect,
  isInteractive,
}: {
  status: string;
  origin: Place | null;
  destination: Place | null;
  onOriginSelect: (place: Place | null) => void;
  onDestinationSelect: (place: Place | null) => void;
  isInteractive: boolean;
}) {
  const statusInfo = RideStatusInfo[status as keyof typeof RideStatusInfo] || {
    text: '¿A dónde vamos?',
    icon: 'search',
    progress: 0,
  };
  
  const iconClass = status === 'searching_driver' ? "animate-spin" : status === 'in_progress' ? "animate-pulse" : "";

  return (
    <div className="m-4 p-4 rounded-xl shadow-lg bg-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-6 flex justify-center">
            <VamoIcon name={statusInfo.icon} className={iconClass} />
        </div>
        <span className="text-sm text-primary font-semibold">
          {statusInfo.text}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center">
          <span className="w-16 text-muted-foreground">Origen:</span>
          {isInteractive ? (
             <PlaceAutocomplete onPlaceSelect={onOriginSelect} />
          ) : (
            <p className="font-medium">{origin?.address || 'No especificado'}</p>
          )}
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
