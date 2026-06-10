'use client';

import React from 'react';
import { Ride, WithId } from '@/lib/types';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
export function PassengerSharedRoadSheet({ ride, myId }: { ride: WithId<Ride>, myId?: string }) {

  if (!ride.orderedStops || !myId) return null;

  // Encontrar mi posición y la parada actual
  const nextStop = ride.orderedStops.find(s => s.status !== 'completed' && s.status !== 'skipped');
  const myPickup = ride.orderedStops.find(s => s.passengerId === myId && s.type === 'pickup');
  const myDropoff = ride.orderedStops.find(s => s.passengerId === myId && s.type === 'dropoff');

  const isMyNextStop = nextStop?.passengerId === myId;
  const isPickedUp = myPickup?.status === 'completed';
  const isDroppedOff = myDropoff?.status === 'completed';

  const myPickupIndex = ride.orderedStops.findIndex(s => s.passengerId === myId && s.type === 'pickup');
  const myPickupOrder = myPickupIndex !== -1 ? myPickupIndex + 1 : 0;
  const totalStops = ride.orderedStops.length;

  // Determinar la posición de la parada en curso
  const currentStopIndex = ride.orderedStops.findIndex(s => s.requestId === nextStop?.requestId && s.type === nextStop?.type);
  const remainingStopsBeforeMe = myPickupIndex !== -1 && currentStopIndex !== -1 ? Math.max(0, myPickupIndex - currentStopIndex) : 0;

  // Determinar mensaje de estado principal
  let mainStatusTitle = "Conductor asignado";
  let mainStatusDesc = "El conductor está siguiendo la hoja de ruta.";

  if (isDroppedOff) {
    mainStatusTitle = "Viaje finalizado";
    mainStatusDesc = "Esperamos que hayas tenido un buen viaje.";
  } else if (isPickedUp) {
    if (isMyNextStop && nextStop?.type === 'dropoff') {
        mainStatusTitle = "Hacia tu destino";
        mainStatusDesc = "Estás llegando a tu destino.";
    } else {
        mainStatusTitle = "Viajando en grupo";
        mainStatusDesc = nextStop?.type === 'pickup' 
            ? `El conductor está yendo a buscar a ${nextStop?.passengerName || 'otro pasajero'}.`
            : `El conductor está llevando a ${nextStop?.passengerName || 'otro pasajero'} a destino.`;
    }
  } else {
    if (nextStop?.status === 'arrived' && isMyNextStop) {
        mainStatusTitle = "¡El conductor llegó!";
        mainStatusDesc = "Te está esperando en el punto de encuentro.";
    } else if (isMyNextStop && nextStop?.type === 'pickup') {
        mainStatusTitle = "¡Preparáte!";
        mainStatusDesc = "El conductor está yendo a buscarte.";
    } else if (nextStop?.type === 'pickup' || nextStop?.type === 'dropoff') {
        mainStatusTitle = "Conductor en camino";
        mainStatusDesc = nextStop?.type === 'pickup'
            ? `El conductor está yendo a buscar a ${nextStop?.passengerName || 'otro pasajero'}. Tu turno será después de ${remainingStopsBeforeMe} parada(s).`
            : `El conductor está llevando a ${nextStop?.passengerName || 'otro pasajero'} a destino. Tu turno será después de ${remainingStopsBeforeMe} parada(s).`;
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* STATUS CARD */}
      <div className="p-6 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-5">
         <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <VamoIcon name={isPickedUp ? "navigation" : (nextStop?.status === 'arrived' && isMyNextStop ? "check-circle" : "user-check")} className="w-7 h-7 text-white" />
         </div>
         <div className="flex-1">
            <h3 className="text-lg font-black uppercase tracking-tight text-white leading-tight italic">{mainStatusTitle}</h3>
            <p className="text-xs font-medium text-zinc-400 mt-0.5">{mainStatusDesc}</p>
         </div>
      </div>

      {/* ROAD SHEET */}
      <div className="space-y-4 px-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <VamoIcon name="map" className="w-4 h-4 text-zinc-500" />
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Hoja de Ruta</h4>
          </div>
          {!isPickedUp && myPickupOrder > 0 && (
             <span className="text-[10px] font-black bg-white/10 text-white px-2 py-1 rounded-full">
                Sos la parada {myPickupOrder} de {totalStops}
             </span>
          )}
        </div>

        <div className="relative space-y-2">
           <div className="absolute left-[13px] top-4 bottom-6 w-0.5 bg-zinc-800" />
           
           {ride.orderedStops.map((stop, idx) => {
              const isMe = stop.passengerId === myId;
              const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
              const isArrived = stop.status === 'arrived';
              const isCurrent = nextStop?.requestId === stop.requestId && nextStop?.type === stop.type;
              
              return (
                <div key={`${stop.requestId}-${stop.type}`} className={cn(
                  "relative flex gap-4 p-3 rounded-2xl transition-all border",
                  isMe ? (isCurrent ? "bg-indigo-500/10 border-indigo-500/30" : "bg-zinc-900/50 border-white/5") : "bg-transparent border-transparent"
                )}>
                  <div className={cn(
                    "z-10 w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0",
                    isCompleted ? "bg-zinc-800 border-zinc-700" : 
                    isCurrent ? (isArrived ? "bg-emerald-500 border-emerald-400 animate-pulse" : "bg-indigo-500 border-indigo-400 animate-pulse") : "bg-zinc-950 border-zinc-900"
                  )}>
                    {isCompleted ? (
                        <VamoIcon name={stop.status === 'skipped' ? "x" : "check"} className="w-3 h-3 text-zinc-500" />
                    ) : (
                        <span className="text-[10px] font-black text-white">{idx + 1}</span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                     <div className="flex justify-between items-start gap-2">
                        <p className={cn(
                          "text-[9px] font-black uppercase tracking-widest shrink-0",
                          stop.type === 'pickup' ? "text-emerald-500/60" : "text-indigo-500/60"
                        )}>
                          {stop.type === 'pickup' ? "Subida" : "Bajada"} {isMe && " (VOS)"}
                        </p>
                        {isCurrent && (
                            <span className={cn(
                                "text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase animate-pulse truncate",
                                isArrived ? "bg-emerald-500" : "bg-indigo-500"
                            )}>
                                {isArrived ? "CONDUCTOR AQUÍ" : "EN CURSO"}
                            </span>
                        )}
                     </div>
                     <p className={cn(
                       "text-xs font-bold leading-tight mt-0.5 truncate",
                       isCompleted ? "text-zinc-500 line-through" : (isCurrent ? "text-white" : "text-zinc-300")
                     )}>
                        {stop.type === 'pickup' ? "Recoger a" : "Dejar a"} {isMe ? "vos" : (stop.passengerName || 'Pasajero')}
                     </p>
                     <p className={cn(
                        "text-[9px] truncate mt-0.5",
                        isCompleted ? "text-zinc-600" : "text-zinc-500"
                     )}>
                        {stop.location.address}
                     </p>
                  </div>
                </div>
              );
           })}
        </div>
      </div>
    </div>
  );
}

