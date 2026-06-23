"use client";
import React from 'react';
import { VamoIcon } from './VamoIcon';
import { ServiceType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Sparkles, ShieldCheck } from 'lucide-react';

interface PassengerTripCardProps {
  serviceType: ServiceType;
  estimatedPrice: number | null;
  netPrice?: number | null;
  discountAmount?: number | null;
  originAddress: string | null;
  destinationAddress: string | null;
  paymentMethod?: 'cash' | 'wallet' | 'automatic';
  grossFare?: number;
  walletCoveredAmount?: number;
  netPassengerPay?: number;
  dynamicSnapshot?: any;
}

export const PassengerTripCard: React.FC<PassengerTripCardProps> = ({
  serviceType,
  estimatedPrice,
  netPrice,
  discountAmount,
  originAddress,
  destinationAddress,
  paymentMethod = 'automatic',
  grossFare,
  walletCoveredAmount,
  netPassengerPay,
  dynamicSnapshot
}) => {
  const displayPrice = netPrice !== undefined && netPrice !== null ? netPrice : estimatedPrice;
  const hasDiscount = discountAmount && discountAmount > 0;

  const isCash = paymentMethod === 'cash';
  const isWallet = paymentMethod === 'wallet';
  const isMixed = paymentMethod === 'automatic';

  // Fallbacks for display
  const finalGrossFare = grossFare ?? (estimatedPrice || 0);
  const finalWalletCovered = walletCoveredAmount ?? (discountAmount || 0);
  const finalNetPay = netPassengerPay ?? (netPrice ?? estimatedPrice ?? 0);

  return (
    <div className="w-full rounded-3xl p-5 mb-4 border border-white/10 shadow-lg bg-gradient-to-tr from-zinc-900 to-zinc-800 animate-in fade-in duration-700">
      <div className="flex items-center gap-4 mb-5 pb-5 border-b border-white/10">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl bg-white/5 border border-white/10 shadow-inner">
          {serviceType === 'express' ? '⚡' : serviceType === 'shared' ? '👥' : '🛡️'}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5 drop-shadow-sm">Servicio</span>
          <span className="text-sm font-black text-white uppercase drop-shadow-sm">{serviceType === 'express' ? 'Express' : serviceType === 'shared' ? 'Compartido' : 'Profesional'}</span>
        </div>
        {(displayPrice != null) ? (
          <div className="ml-auto text-right flex flex-col gap-1 animate-in fade-in zoom-in duration-300 min-w-[140px]">
               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                   <span>Tarifa</span>
                   <span>${new Intl.NumberFormat('es-AR').format(finalGrossFare)}</span>
               </div>
            
            {/* VamO Pay aplicado (Wallet) */}
            {finalWalletCovered > 0 && (
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tight text-emerald-400">
                    <div className="flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        <span>Billetera</span>
                    </div>
                    <span>-${new Intl.NumberFormat('es-AR').format(finalWalletCovered)}</span>
                </div>
            )}

            <div className="h-px bg-white/5 my-0.5" />

            {/* Total Efectivo */}
            <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1 italic">Total final</span>
                {finalNetPay === 0 ? (
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-xl font-black text-emerald-400 italic tracking-tighter leading-none">$0</span>
                        <div className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 animate-pulse">
                            <ShieldCheck className="w-2 h-2" />
                            <span className="text-[7px] font-black uppercase tracking-widest leading-none">Pagado</span>
                        </div>
                    </div>
                ) : (
                    <span className="text-xl font-black text-white tracking-tighter leading-none italic">
                        ${new Intl.NumberFormat('es-AR').format(finalNetPay)}
                    </span>
                )}
            </div>
            {dynamicSnapshot?.applied && (
                <p className="text-[7px] text-zinc-500 uppercase tracking-tighter font-bold leading-none mt-1">
                    Precio Congelado
                </p>
            )}
          </div>
        ) : (
          <div className="ml-auto text-right flex flex-col justify-center">
            <span className="text-[10px] font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full animate-pulse border border-white/5">Calculando...</span>
          </div>
        )}
      </div>

      <div className="relative flex flex-col gap-5 pl-1">
        <div className="absolute left-[7px] top-[14px] bottom-[14px] w-[2px] bg-white/10" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-3.5 h-3.5 rounded-full shrink-0 border-2 border-indigo-400 bg-zinc-900 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          <div className="flex-1 min-w-0">
            {originAddress ? (
              <p className="text-xs font-bold text-zinc-300 truncate drop-shadow-sm">{originAddress}</p>
            ) : (
              <div className="w-3/4 h-3 rounded bg-white/10 animate-pulse" />
            )}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-3.5 h-3.5 rounded-sm shrink-0 border-2 border-violet-400 bg-zinc-900 shadow-[0_0_8px_rgba(167,139,250,0.5)]" />
          <div className="flex-1 min-w-0">
            {destinationAddress ? (
              <p className="text-xs font-bold text-zinc-300 truncate drop-shadow-sm">{destinationAddress}</p>
            ) : (
              <div className="w-2/3 h-3 rounded bg-white/10 animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
