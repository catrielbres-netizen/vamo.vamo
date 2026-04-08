"use client";

import React from 'react';
import { VamoIcon } from './VamoIcon';
import { PassengerTripCard } from './PassengerTripCard';
import { ServiceType } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from './ui/button';

interface PassengerSearchingSheetProps {
  serviceType: ServiceType;
  estimatedPrice: number | null;
  originAddress: string | null;
  destinationAddress: string | null;
  onCancel: () => Promise<void>;
  isCancelling?: boolean;
}

export const PassengerSearchingSheet: React.FC<PassengerSearchingSheetProps> = ({
  serviceType,
  estimatedPrice,
  originAddress,
  destinationAddress,
  onCancel,
  isCancelling = false
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  const handleConfirmCancel = async () => {
    await onCancel();
    setIsConfirmOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center animate-in fade-in duration-500">
      {/* Premium Radar Animation */}
      <div className="relative w-32 h-32 my-10 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full radar-pulse-1 bg-indigo-500/20" />
        <div className="absolute inset-0 rounded-full radar-pulse-2 bg-indigo-500/10" />
        <div className="absolute inset-0 rounded-full radar-pulse-3 bg-indigo-500/5" />
        
        <div className="relative z-10 w-20 h-20 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.3)]">
          <VamoIcon name="search" className="h-8 w-8 text-indigo-400" />
        </div>
      </div>

      <div className="text-center mb-8">
        <h2 className="text-2xl font-black text-white tracking-tight mb-2 uppercase">Buscando conductores</h2>
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Conectando...</p>
      </div>

      {/* Trip Summary Card */}
      <PassengerTripCard
        serviceType={serviceType}
        estimatedPrice={estimatedPrice}
        originAddress={originAddress}
        destinationAddress={destinationAddress}
      />

      {/* Cancel Flow with Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogTrigger asChild>
          <button
            disabled={isCancelling}
            className="w-full h-12 mt-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] border border-white/5 hover:bg-zinc-900 bg-zinc-900/50 text-zinc-500 flex items-center justify-center gap-2"
          >
            {isCancelling && <VamoIcon name="loader" className="animate-spin h-4 w-4" />}
            Cancelar búsqueda
          </button>
        </DialogTrigger>
        <DialogContent className="rounded-[2.5rem] max-w-[90vw] sm:max-w-[400px] border-zinc-800 bg-zinc-950 text-white p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-center">¿Cancelar?</DialogTitle>
            <DialogDescription className="text-zinc-500 text-center font-medium mt-2">
              Si cancelas ahora, perderás tu lugar en la fila.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-8">
            <Button
              variant="destructive"
              disabled={isCancelling}
              onClick={handleConfirmCancel}
              className="rounded-2xl h-14 font-black uppercase tracking-widest bg-red-600 hover:bg-red-700"
            >
              {isCancelling ? <VamoIcon name="loader" className="animate-spin mr-2" /> : null}
              Sí, cancelar
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsConfirmOpen(false)}
              className="rounded-2xl h-12 font-bold text-zinc-500 hover:bg-zinc-900"
            >
              Volver
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
