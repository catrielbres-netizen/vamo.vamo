'use client';

import React from 'react';
import { usePassengerRewards } from '@/hooks/usePassengerRewards';
import { VamoIcon } from '@/components/VamoIcon';
import { Gift, Trophy, Medal, Star, Info, TrendingUp, Award, Loader2 } from 'lucide-react';

export default function PassengerRewardsPage() {
  const {
    loading,
    error,
    cityKey,
    weekId,
    pool,
    myPoints,
    ranking,
    userRank,
    estimatedReward,
  } = usePassengerRewards();

  // Constants
  const BASE_AMOUNT = 20000;
  const MAX_AMOUNT = 600000;

  // Resolved values
  const currentAmount = pool?.totalAmount ?? BASE_AMOUNT;
  const progressPercent = Math.min(100, Math.max(0, (currentAmount / MAX_AMOUNT) * 100));

  // Helper to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Helper to get estimated reward for a specific ranking index
  const getEstimatedRewardForRank = (rank: number) => {
    if (rank <= 10) return 15000;
    if (rank <= 30) return 8000;
    if (rank <= 60) return 5000;
    if (rank <= 100) return 3500;
    return 0;
  };

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
          
          {/* SECCIÓN DUO: POZO + TU AVANCE */}
          <div className="grid md:grid-cols-2 gap-6">
            
            {/* CARD POZO */}
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-6 -mt-6" />
              
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full">
                    Pozo Semanal
                  </span>
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                </div>
                
                {pool ? (
                  <>
                    <h2 className="text-3xl font-black mb-1 text-zinc-100">
                      {formatCurrency(currentAmount)}
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-medium mb-4">
                      Tope de la semana: {formatCurrency(MAX_AMOUNT)} • Base: {formatCurrency(BASE_AMOUNT)}
                    </p>
                  </>
                ) : (
                  <div className="py-4">
                    <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest mb-2 italic">
                      Pozo semanal pendiente de creación. Se activará con el primer viaje válido.
                    </p>
                    <h2 className="text-2xl font-black text-zinc-300">
                      {formatCurrency(BASE_AMOUNT)}
                    </h2>
                  </div>
                )}
              </div>

              <div>
                {/* PROGRESS BAR */}
                <div className="w-full bg-zinc-900 rounded-full h-2.5 mb-2 overflow-hidden border border-white/5">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                  <span>0%</span>
                  <span>{progressPercent.toFixed(1)}% Acumulado</span>
                  <span>100%</span>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-indigo-300/80 leading-relaxed flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Se suma <strong>$100</strong> por cada viaje finalizado en la ciudad.</span>
                </div>
              </div>
            </div>

            {/* CARD TU AVANCE */}
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl -mr-6 -mt-6" />
              
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full">
                    Tu Avance
                  </span>
                  <Trophy className="w-4 h-4 text-violet-400" />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Viajes Válidos</p>
                    <p className="text-2xl font-black text-zinc-100">
                      {myPoints?.weeklyTripsCount ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Tu Posición</p>
                    <p className="text-2xl font-black text-zinc-100">
                      {userRank > 0 ? `#${userRank}` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                {myPoints && myPoints.weeklyTripsCount > 0 ? (
                  <div className="bg-violet-950/20 border border-violet-500/10 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">Premio Estimado</p>
                    <p className="text-lg font-black text-zinc-100">{formatCurrency(estimatedReward)}</p>
                  </div>
                ) : (
                  <div className="p-3 bg-zinc-900/50 border border-white/5 rounded-2xl text-center">
                    <p className="text-[10px] text-zinc-500 italic">
                      Todavía no tenés viajes válidos esta semana.
                    </p>
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-white/5 text-[9px] text-zinc-500 leading-snug">
                  Los premios se calculan al cierre de cada ciclo semanal en base a tu puesto final en el ranking.
                </div>
              </div>
            </div>

          </div>

          {/* TABLA DE PREMIOS RECOPILADOS */}
          <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-indigo-400" />
              Tabla de Premios Semanales
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-zinc-900/60 p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Top 1 - 10</p>
                <p className="text-sm font-black text-zinc-100">{formatCurrency(15000)}</p>
              </div>
              <div className="bg-zinc-900/60 p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Top 11 - 30</p>
                <p className="text-sm font-black text-zinc-100">{formatCurrency(8000)}</p>
              </div>
              <div className="bg-zinc-900/60 p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Top 31 - 60</p>
                <p className="text-sm font-black text-zinc-100">{formatCurrency(5000)}</p>
              </div>
              <div className="bg-zinc-900/60 p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Top 61 - 100</p>
                <p className="text-sm font-black text-zinc-100">{formatCurrency(3500)}</p>
              </div>
            </div>
          </div>

          {/* RANKING TOP 100 */}
          <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-1.5">
              <Medal className="w-4 h-4 text-indigo-400" />
              Ranking Semanal de Pasajeros
            </h3>

            {ranking.length > 0 ? (
              <div className="max-h-96 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {ranking.map((passenger, index) => {
                  const rank = index + 1;
                  const estimated = getEstimatedRewardForRank(rank);
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
