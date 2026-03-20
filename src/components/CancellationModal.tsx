'use client';

import React from 'react';
import { useCancellationNotice } from '@/context/CancellationNoticeProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';

export function CancellationModal() {
  const { cancellationNotice, clearCancellationNotice } = useCancellationNotice();

  const isOpen = !!cancellationNotice;

  if (!cancellationNotice) {
    return null;
  }

  const { passengerName } = cancellationNotice;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && clearCancellationNotice()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VamoIcon name="user-x" className="text-destructive" />
            Viaje Cancelado
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p>
            El pasajero <span className="font-semibold">{passengerName}</span> ha cancelado el viaje.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Ya podés recibir nuevas solicitudes.
          </p>
        </div>
        <DialogFooter className="sm:justify-start">
          <DialogClose asChild>
            <Button type="button" variant="secondary" onClick={clearCancellationNotice}>
              Entendido
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
