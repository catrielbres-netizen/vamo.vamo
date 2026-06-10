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
  walletCoveredAmount?: number | null;
  cashToCollect?: number | null;
  paymentMethod?: 'cash' | 'wallet' | 'automatic';
  originAddress: string | null;
  destinationAddress: string | null;
  onCancel: () => Promise<void>;
  isCancelling?: boolean;
  notifiedCount?: number;
  interestedDriversCount?: number;
  status?: string;
  scheduledAt?: any;
  dynamicSnapshot?: any;
}

export const PassengerSearchingSheet: React.FC<PassengerSearchingSheetProps> = ({
  serviceType,
  estimatedPrice,
  walletCoveredAmount,
  cashToCollect,
  paymentMethod,
  originAddress,
  destinationAddress,
  onCancel,
  isCancelling = false,
  notifiedCount = 0,
  interestedDriversCount = 0,
  status = 'searching',
  scheduledAt,
  dynamicSnapshot
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  const handleConfirmCancel = async () => {
    await onCancel();
    setIsConfirmOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center animate-in fade-in duration-500 w-full px-2">
      {/* Sleeker Radar Animation */}
      <div className="relative w-20 h-20 my-4 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full radar-pulse-1 bg-indigo-500/20" />
        <div className="absolute inset-0 rounded-full radar-pulse-2 bg-indigo-500/10" />
        <div className="absolute inset-0 rounded-full radar-pulse-3 bg-indigo-500/5" />
        
        <div className="relative z-10 w-12 h-12 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)]">
          <VamoIcon name={status === 'scheduled' ? 'calendar' : 'search'} className="h-5 w-5 text-indigo-400" />
        </div>
      </div>

      <div className="text-center mb-4">
        <h2 className="text-xl font-black text-white tracking-tight mb-1 uppercase">
            {status === 'scheduled' ? 'Viaje Programado' : 'Buscando conductor'}
        </h2>
        {status === 'scheduled' ? (
          <>
            <div className="flex items-center justify-center gap-2 mt-2 bg-indigo-500/10 py-1.5 px-4 rounded-full border border-indigo-500/20 w-max mx-auto shadow-sm">
              <VamoIcon name="calendar" className="w-3.5 h-3.5 text-indigo-400" />
              <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                  {scheduledAt ? new Date(scheduledAt.toMillis ? scheduledAt.toMillis() : scheduledAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Horario programado'}
              </p>
            </div>
            <div className="mt-4 mb-2 max-w-[280px] mx-auto p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-left flex gap-3 items-start animate-in fade-in zoom-in-95 duration-500">
                <VamoIcon name="shield-check" className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-0.5">Reserva Confirmada</p>
                    <p className="text-xs text-zinc-400 font-medium leading-relaxed">Nuestro sistema inteligente ya está trabajando. Te garantizamos prioridad máxima para asegurar tu puntualidad. Podés cerrar la app tranquilo.</p>
                </div>
            </div>
            {interestedDriversCount > 0 && (
                <div className="flex items-center justify-center gap-2 mt-2 bg-indigo-500/10 py-1.5 px-4 rounded-full border border-indigo-500/20 w-max mx-auto">
                    <VamoIcon name="users" className="w-3.5 h-3.5 text-indigo-400" />
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                        {interestedDriversCount} {interestedDriversCount === 1 ? 'conductor anotado' : 'conductores anotados'}
                    </p>
                </div>
            )}
          </>
        ) : notifiedCount > 0 ? (
          <div className="flex items-center justify-center gap-2 mt-2 bg-indigo-500/10 py-1.5 px-4 rounded-full border border-indigo-500/20 w-max mx-auto shadow-sm">
            <VamoIcon name="bell-ring" className="w-3.5 h-3.5 text-indigo-400 animate-bounce" style={{ animationDuration: '2s' }} />
            <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">{notifiedCount} {notifiedCount === 1 ? 'Conductor notificado' : 'Conductores notificados'}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mt-2 bg-zinc-900 py-1.5 px-4 rounded-full border border-zinc-800 w-max mx-auto shadow-sm">
            <VamoIcon name="radar" className="w-3.5 h-3.5 text-zinc-400 animate-spin" style={{ animationDuration: '3s' }} />
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Rastreando zona...</p>
          </div>
        )}
      </div>

      {/* Trip Summary Card */}
      <div className="w-full max-w-[340px]">
        <PassengerTripCard
            serviceType={serviceType}
            estimatedPrice={estimatedPrice}
            grossFare={estimatedPrice || 0}
            walletCoveredAmount={walletCoveredAmount || 0}
            netPassengerPay={cashToCollect || 0}
            paymentMethod={paymentMethod}
            originAddress={originAddress}
            destinationAddress={destinationAddress}
            dynamicSnapshot={dynamicSnapshot}
        />
      </div>

      {/* Cancel Flow with Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogTrigger asChild>
          <button
            disabled={isCancelling}
            className="w-full max-w-[340px] h-12 mb-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] border border-white/5 hover:bg-zinc-800 bg-zinc-900 text-zinc-400 flex items-center justify-center gap-2 shadow-sm"
          >
            {isCancelling && <VamoIcon name="loader" className="animate-spin h-3 w-3" />}
            Cancelar
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
