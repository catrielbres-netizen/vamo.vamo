'use client';

import React from 'react';
import { Ride, WithId } from '@/lib/types';
import { VamoIcon } from './VamoIcon';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';

export function PassengerSharedRoadSheet({ ride }: { ride: WithId<Ride> }) {
  const { user } = useUser();
  const myId = user?.uid;

  if (!ride.orderedStops || !myId) return null;

  // Encontrar mi posición y la parada actual
  const nextStop = ride.orderedStops.find(s => s.status !== 'completed' && s.status !== 'skipped');
  const myPickup = ride.orderedStops.find(s => s.passengerId === myId && s.type === 'pickup');
  const myDropoff = ride.orderedStops.find(s => s.passengerId === myId && s.type === 'dropoff');

  const isMyNextStop = nextStop?.passengerId === myId;
  const isPickedUp = myPickup?.status === 'completed';
  const isDroppedOff = myDropoff?.status === 'completed';

  // Determinar mensaje de estado principal
  let mainStatusTitle = "Viaje Compartido";
  let mainStatusDesc = "El conductor está siguiendo la hoja de ruta.";

  if (isDroppedOff) {
    mainStatusTitle = "¡Llegaste!";
    mainStatusDesc = "Esperamos que hayas tenido un buen viaje.";
  } else if (isPickedUp) {
    if (isMyNextStop && nextStop?.type === 'dropoff') {
        mainStatusTitle = "Hacia tu destino";
        mainStatusDesc = "Sos la próxima parada para bajar.";
    } else {
        mainStatusTitle = "Ya estás a bordo";
        mainStatusDesc = "El conductor está procesando otras paradas.";
    }
  } else {
    if (isMyNextStop && nextStop?.type === 'pickup') {
        mainStatusTitle = "Viene por vos";
        mainStatusDesc = "El conductor está llegando a tu ubicación.";
    } else if (nextStop?.status === 'arrived' && isMyNextStop) {
        mainStatusTitle = "¡El conductor llegó!";
        mainStatusDesc = "Buscá el vehículo en el punto de encuentro.";
    } else {
        mainStatusTitle = "Buscando pasajeros";
        mainStatusDesc = "El conductor está recogiendo a otros pasajeros.";
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* STATUS CARD */}
      <div className="p-6 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-5">
         <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <VamoIcon name={isPickedUp ? "navigation" : "user-check"} className="w-7 h-7 text-white" />
         </div>
         <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white leading-tight italic">{mainStatusTitle}</h3>
            <p className="text-xs font-medium text-zinc-400">{mainStatusDesc}</p>
         </div>
      </div>

      {/* ROAD SHEET */}
      <div className="space-y-4 px-2">
        <div className="flex items-center gap-2">
          <VamoIcon name="map" className="w-4 h-4 text-zinc-500" />
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Hoja de Ruta</h4>
        </div>

        <div className="relative space-y-2">
           <div className="absolute left-[13px] top-4 bottom-6 w-0.5 bg-zinc-800" />
           
           {ride.orderedStops.map((stop, idx) => {
              const isMe = stop.passengerId === myId;
              const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
              const isArrived = stop.status === 'arrived';
              const isCurrent = nextStop?.order === stop.order;
              
              return (
                <div key={`${stop.requestId}-${stop.type}`} className={cn(
                  "relative flex gap-4 p-3 rounded-2xl transition-all border",
                  isMe ? (isCurrent ? "bg-indigo-500/10 border-indigo-500/30" : "bg-zinc-900/50 border-white/5") : "bg-transparent border-transparent"
                )}>
                  <div className={cn(
                    "z-10 w-7 h-7 rounded-full flex items-center justify-center border-2",
                    isCompleted ? "bg-zinc-800 border-zinc-700" : 
                    isCurrent ? (isArrived ? "bg-emerald-500 border-emerald-400 animate-pulse" : "bg-indigo-500 border-indigo-400 animate-pulse") : "bg-zinc-950 border-zinc-900"
                  )}>
                    {isCompleted ? (
                        <VamoIcon name="check" className="w-3 h-3 text-zinc-500" />
                    ) : (
                        <span className="text-[10px] font-black text-white">{idx + 1}</span>
                    )}
                  </div>
                  
                  <div className="flex-1">
                     <div className="flex justify-between items-start">
                        <p className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          stop.type === 'pickup' ? "text-emerald-500/60" : "text-indigo-500/60"
                        )}>
                          {stop.type === 'pickup' ? "Subida" : "Bajada"} {isMe && " (VOS)"}
                        </p>
                        {isCurrent && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-500 text-white uppercase animate-pulse">
                                {isArrived ? "CONDUCTOR AQUÍ" : "EN CURSO"}
                            </span>
                        )}
                     </div>
                     <p className={cn(
                       "text-xs font-bold leading-tight",
                       isCompleted ? "text-zinc-500 line-through" : "text-white"
                     )}>
                        {stop.type === 'pickup' ? "Recoger a" : "Dejar a"} {isMe ? "vos" : (stop.passengerName || 'Pasajero')}
                     </p>
                     <p className="text-[9px] text-zinc-500 truncate mt-0.5">{stop.location.address}</p>
                  </div>
                </div>
              );
           })}
        </div>
      </div>
    </div>
  );
}
