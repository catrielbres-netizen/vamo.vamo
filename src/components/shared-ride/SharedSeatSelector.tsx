import React from 'react';
import { cn } from '@/lib/utils';

export type SeatId = 'front_passenger' | 'rear_left' | 'rear_center' | 'rear_right';

interface SharedSeatSelectorProps {
  selectedSeats: SeatId[];
  onSeatsChange: (seats: SeatId[]) => void;
  occupiedSeats?: SeatId[];
}

export function SharedSeatSelector({ selectedSeats, onSeatsChange, occupiedSeats = [] }: SharedSeatSelectorProps) {
  const toggleSeat = (id: SeatId) => {
    if (occupiedSeats.includes(id)) return;
    
    if (selectedSeats.includes(id)) {
      onSeatsChange(selectedSeats.filter(s => s !== id));
    } else {
      if (selectedSeats.length >= 2) return; // Max 2
      onSeatsChange([...selectedSeats, id]);
    }
  };

  const renderSeat = (id: SeatId, label: string) => {
    const isOccupied = occupiedSeats.includes(id);
    const isSelected = selectedSeats.includes(id);

    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleSeat(id);
        }}
        disabled={isOccupied}
        className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all relative",
          isOccupied ? "bg-red-500/10 text-red-500/50 border border-red-500/20 cursor-not-allowed" : 
          isSelected ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50 scale-105 z-10" : 
          "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:border-white/30"
        )}
      >
        {isOccupied ? 'Ocupado' : isSelected ? 'Tu lugar' : label}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center p-4 bg-white/5 rounded-3xl border border-white/10 space-y-4">
      <div className="flex flex-col gap-1 items-center">
        <p className="text-[12px] font-black uppercase tracking-widest text-indigo-400">¿Dónde te sentás?</p>
        <p className="text-[10px] text-zinc-400">Podés elegir hasta 2 asientos</p>
      </div>

      <div className="relative w-48 sm:w-56 p-4 border-2 border-white/5 rounded-[2rem] bg-black/40 flex flex-col gap-6 mx-auto">
        {/* Front row */}
        <div className="flex justify-between w-full px-1">
          {/* Driver */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-[10px] font-bold bg-white/5 text-zinc-600 border border-white/5">
            Chofer
          </div>
          {renderSeat('front_passenger', 'Delantero')}
        </div>
        
        {/* Back row */}
        <div className="flex justify-between w-full">
          {renderSeat('rear_left', 'Izq.')}
          {renderSeat('rear_center', 'Cen.')}
          {renderSeat('rear_right', 'Der.')}
        </div>
      </div>
      
      <div className="flex gap-4 items-center justify-center mt-2 opacity-60">
         <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-white/10 border border-white/20"></div><span className="text-[9px] uppercase tracking-wider text-white font-bold">Libre</span></div>
         <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></div><span className="text-[9px] uppercase tracking-wider text-white font-bold">Tuyo</span></div>
         <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-red-500/20 border border-red-500/30"></div><span className="text-[9px] uppercase tracking-wider text-white font-bold">Ocupado</span></div>
      </div>
    </div>
  );
}
