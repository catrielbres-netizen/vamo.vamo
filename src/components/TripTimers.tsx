'use client';

import { Clock } from 'lucide-react';

export function TripTimers({ waitMinutes, waitCost }: { waitMinutes: number, waitCost: number }) {
  if (!waitMinutes) return null;

  return (
    <div className="m-4 p-3 text-sm rounded-lg bg-secondary/50 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span>Espera: <strong>{waitMinutes} min</strong></span>
        </div>
        <div>
            <span>Costo espera: <strong>${new Intl.NumberFormat('es-AR').format(waitCost)}</strong></span>
        </div>
    </div>
  );
}
