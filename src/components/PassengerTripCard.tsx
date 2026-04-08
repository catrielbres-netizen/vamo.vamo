"use client";
import React from 'react';
import { VamoIcon } from './VamoIcon';
import { ServiceType } from '@/lib/types';

interface PassengerTripCardProps {
  serviceType: ServiceType;
  estimatedPrice: number | null;
  originAddress: string | null;
  destinationAddress: string | null;
}

export const PassengerTripCard: React.FC<PassengerTripCardProps> = ({
  serviceType,
  estimatedPrice,
  originAddress,
  destinationAddress
}) => {
  return (
    <div className="w-full rounded-3xl p-5 mb-4 border border-white/5 animate-in fade-in duration-700" style={{ backgroundColor: '#222' }}>
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ backgroundColor: '#2a2a2a' }}>
          {serviceType === 'express' ? '⚡' : '🚕'}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-40">Servicio</p>
          <p className="text-sm font-bold text-white uppercase">{serviceType === 'express' ? 'Express' : 'Premium'}</p>
        </div>
        {(estimatedPrice != null && estimatedPrice > 0) ? (
          <div className="ml-auto text-right">
            <p className="text-xs font-bold uppercase tracking-widest opacity-40">Tarifa</p>
            <p className="text-lg font-black" style={{ color: '#6366f1' }}>
              ${new Intl.NumberFormat('es-AR').format(estimatedPrice)}
            </p>
          </div>
        ) : (
          <div className="ml-auto w-16 h-4 rounded bg-white/5 animate-pulse" />
        )}
      </div>

      <div className="relative flex flex-col gap-4 pl-1">
        <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px]" style={{ backgroundColor: '#333' }} />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-3.5 h-3.5 rounded-full shrink-0 border-2" style={{ borderColor: '#6366f1', backgroundColor: '#1a1a1a' }} />
          <div className="flex-1 min-w-0">
            {originAddress ? (
              <p className="text-xs font-semibold text-white/80 truncate">{originAddress}</p>
            ) : (
              <div className="w-3/4 h-3 rounded bg-white/5 animate-pulse" />
            )}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-3.5 h-3.5 rounded-sm shrink-0 border-2" style={{ borderColor: '#a78bfa', backgroundColor: '#1a1a1a' }} />
          <div className="flex-1 min-w-0">
            {destinationAddress ? (
              <p className="text-xs font-semibold text-white/80 truncate">{destinationAddress}</p>
            ) : (
              <div className="w-2/3 h-3 rounded bg-white/5 animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
