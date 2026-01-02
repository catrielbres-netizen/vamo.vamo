
'use client';

import { VamoIcon } from '@/components/icons';

export function TripTimers({ waitMinutes, waitCost, currentTotal }: { waitMinutes: string, waitCost: string, currentTotal: string }) {
  const hasWaitTime = waitMinutes !== '00:00';

  return (
    <div className="m-4 p-3 text-sm rounded-lg bg-card border shadow-sm flex flex-col gap-3">
        {hasWaitTime && (
            <div className="flex items-center justify-center gap-4 text-center">
                <div className="flex items-center gap-2">
                    <VamoIcon name="Hourglass" className="w-4 h-4 text-primary" />
                    <span>Espera: <strong>{waitMinutes}</strong></span>
                </div>
                <div>
                    <span>Costo: <strong>{waitCost}</strong></span>
                </div>
            </div>
        )}
        <div className="bg-secondary/50 p-3 rounded-md text-center">
            <p className="text-xs text-muted-foreground">Tarifa actual estimada</p>
            <p className="font-bold text-lg text-primary">{currentTotal}</p>
        </div>
    </div>
  );
}
