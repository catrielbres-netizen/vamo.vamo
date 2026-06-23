'use client';

import React from 'react';
import { usePassengerRewards } from '@/hooks/usePassengerRewards';
import { PassengerWeeklyPoolCard } from '@/components/PassengerWeeklyPoolCard';
import { Gift, Medal, Info, Loader2 } from 'lucide-react';
import { passengerWeeklyPoolConfig, getPassengerMultiplierForRank } from '@/config/passengerWeeklyPoolConfig';

export default function PassengerRewardsPage() {
  const {
    loading,
    error,
    pool,
    myPoints,
    ranking,
    userRank,
  } = usePassengerRewards();

  // Helper to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const poolTotal = pool?.currentAmount || passengerWeeklyPoolConfig.initialPoolAmount;
  const individualCap = poolTotal * passengerWeeklyPoolConfig.individualCapPercentage;

  // Calculate total multipliers for ranking estimate
  let totalMultipliers = 0;
  ranking.slice(0, passengerWeeklyPoolConfig.eligibleTopCount).forEach((_, idx) => {
      totalMultipliers += getPassengerMultiplierForRank(idx + 1);
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24 px-4 pt-6 md:px-8 max-w-4xl mx-auto">
      {/* HEADER */}
      <div className="text-center mb-8 relative">
        <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full w-48 h-48 mx-auto -top-12 -z-10" />
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-wider text-indigo-400 flex items-center justify-center gap-2 mb-2">
          <Gift className="w-8 h-8 animate-bounce text-indigo-400" />
          VamO Premia Pasajeros
        </h1>
        <p className="text-xs md:text-sm text-zinc-400 font-medium">
          Cada viaje finalizado válido suma al ranking semanal de tu ciudad.
        </p>
      </div>

      {/* ERROR DISPLAY (NON-BLOCKING) */}
      {error && (
        <div className="mb-6 p-4 bg-red-950/30 border border-red-500/20 rounded-2xl flex items-start gap-3">
          <Info className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Aviso del Sistema</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-black">Cargando beneficios...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          
          <PassengerWeeklyPoolCard />

          {/* RANKING TOP */}
          <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5">
              <Medal className="w-4 h-4 text-indigo-400" />
              Ranking Semanal de Pasajeros (Top {passengerWeeklyPoolConfig.eligibleTopCount})
            </h3>

            {ranking.length > 0 ? (
              <div className="max-h-96 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {ranking.slice(0, passengerWeeklyPoolConfig.eligibleTopCount).map((passenger, index) => {
                  const rank = index + 1;
                  
                  let estimated = 0;
                  const multiplier = getPassengerMultiplierForRank(rank);
                  if (totalMultipliers > 0 && multiplier > 0) {
                      const rawPayout = poolTotal * (multiplier / totalMultipliers);
                      estimated = Math.floor(Math.min(rawPayout, individualCap));
                  }

                  const isCurrentUser = passenger.passengerId === myPoints?.passengerId;
                  
                  // Render medal badge
                  let medalBadge = <span className="text-xs font-bold text-zinc-400">#{rank}</span>;
                  if (rank === 1) medalBadge = <span className="text-lg">🥇</span>;
                  else if (rank === 2) medalBadge = <span className="text-lg">🥈</span>;
                  else if (rank === 3) medalBadge = <span className="text-lg">🥉</span>;

                  return (
                    <div 
                      key={passenger.passengerId + '_' + index}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isCurrentUser 
                          ? 'bg-indigo-900/20 border-indigo-500/30' 
                          : 'bg-zinc-900/40 border-white/5 hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-950 flex items-center justify-center border border-white/10 shrink-0">
                          {medalBadge}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-200">
                            Pasajero #{rank} {isCurrentUser && <span className="text-[10px] text-indigo-400 font-black ml-1 uppercase tracking-wider">(Vos)</span>}
                          </p>
                          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                            {passenger.weeklyTripsCount} viaje{passenger.weeklyTripsCount !== 1 ? 's' : ''} válido{passenger.weeklyTripsCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {estimated > 0 && (
                        <div className="text-right">
                          <p className="text-xs font-black text-indigo-400">
                            {formatCurrency(estimated)}
                          </p>
                          <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-black">
                            Est.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center bg-zinc-900/30 border border-dashed border-white/5 rounded-2xl">
                <Info className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-500 italic">
                  Aún no hay pasajeros en el ranking semanal.
                </p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
