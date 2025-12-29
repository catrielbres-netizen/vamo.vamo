'use client';

import { Input } from './ui/input';
import { RideStatusInfo } from '@/lib/ride-status';
import { Progress } from './ui/progress';

export function TripCard({
  status,
  origin,
  destination,
  onDestinationChange,
  isInteractive,
}: {
  status: string;
  origin: string;
  destination: string;
  onDestinationChange: (value: string) => void;
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
            <Input
              type="text"
              placeholder="Ingresá una dirección"
              value={destination}
              onChange={(e) => onDestinationChange(e.target.value)}
              className="h-8"
            />
          ) : (
            <p className="font-medium">{destination || '—'}</p>
          )}
        </div>
      </div>
      {status !== 'idle' && status !== 'finished' && status !== 'cancelled' && (
         <Progress value={statusInfo.progress} className="w-full h-2 mt-4" />
      )}
    </div>
  );
}
