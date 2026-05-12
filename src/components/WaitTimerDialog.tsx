'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';

export function WaitTimerDialog({ 
    isOpen, 
    onOpenChange,
    waitMinutes, 
    waitCost, 
    currentTotal,
    isEarlyArrival,
    scheduledTime
}: { 
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    waitMinutes: string;
    waitCost: string;
    currentTotal: string;
    isEarlyArrival?: boolean;
    scheduledTime?: string;
}) {

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VamoIcon name="hourglass" className="text-primary animate-pulse" />
            Viaje en Espera
          </DialogTitle>
          <DialogDescription>
            {isEarlyArrival ? (
                <span className="text-amber-500 font-medium">
                    Llegaste antes de la hora de la reserva. La espera comienza a las {scheduledTime || 'la hora programada'}.
                </span>
            ) : (waitMinutes.startsWith('00:') || (parseInt(waitMinutes.split(':')[0]) < 5))
              ? "Tenés 5 minutos (300s) de espera sin cargo. Luego se aplicará la tarifa por minuto." 
              : "El tiempo de cortesía ha finalizado y se está aplicando el costo por minuto de espera."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Tiempo de espera (actual)</p>
            <p className="text-5xl font-bold tracking-tighter">{waitMinutes}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Costo adicional por esta espera</p>
            {waitMinutes.startsWith('00:') || (parseInt(waitMinutes.split(':')[0]) < 5) ? (
              <p className="text-2xl font-semibold text-emerald-500">¡GRATIS!</p>
            ) : (
              <p className="text-2xl font-semibold text-destructive">{waitCost}</p>
            )}
          </div>
          <div className="text-center p-3 bg-secondary rounded-md mt-2">
            <p className="text-xs text-muted-foreground">Efectivo a cobrar</p>
            <p className="font-bold text-lg text-primary">{currentTotal}</p>
          </div>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
