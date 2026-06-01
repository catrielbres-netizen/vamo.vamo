'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useFirestore, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride, WithId, SharedRideRequest, Place } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { TripCard } from './TripCard';
import { PanicButton } from './PanicButton';
import { SafetyToolkit } from './SafetyToolkit';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function SharedRideManager({ 
  ride, 
  onClose 
}: { 
  ride: WithId<Ride>, 
  onClose?: () => void 
}) {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [requests, setRequests] = useState<Record<string, SharedRideRequest>>({});
  const [confirmAction, setConfirmAction] = useState<{ action: 'no_show' | 'confirm_dropoff' | 'mark_undeclared_companion', stopOrder?: number, passengerName: string } | null>(null);

  // 1. Escuchar las solicitudes individuales del grupo
  useEffect(() => {
    if (!firestore || !ride.sharedRequestIds || ride.sharedRequestIds.length === 0) return;

    const q = query(
      collection(firestore, 'shared_ride_requests'),
      where('groupId', '==', ride.sharedGroupId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const reqs: Record<string, SharedRideRequest> = {};
      snap.forEach(d => {
        reqs[d.id] = d.data() as SharedRideRequest;
      });
      setRequests(reqs);
    });

    return () => unsub();
  }, [firestore, ride.sharedGroupId, ride.sharedRequestIds]);

  // 2. Identificar la próxima parada (primera que no sea completed o skipped)
  const nextStop = useMemo(() => {
    if (!ride.orderedStops) return null;
    return ride.orderedStops.find(s => s.status !== 'completed' && s.status !== 'skipped');
  }, [ride.orderedStops]);

  const currentPassenger = nextStop ? (requests[nextStop.requestId] || (ride.sharedPassengers || []).find((p: any) => p.requestId === nextStop.requestId)) : null;

  // 3. Handlers
  const handleAction = async (action: 'arrive' | 'confirm_pickup' | 'confirm_dropoff' | 'no_show', stopOrder: number) => {
    if (!firebaseApp || isProcessing) return;
    setIsProcessing(true);
    try {
      const advanceStop = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'advanceSharedRideStopV1');
      await advanceStop({ rideId: ride.id, stopOrder, action });
      toast({ title: 'Estado de parada actualizado' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  const handleOldAction = async (action: string, requestId: string) => {
    if (!firebaseApp || isProcessing) return;
    setIsProcessing(true);
    try {
      const updateStatus = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'updateSharedPassengerStatusV1');
      await updateStatus({ rideId: ride.id, requestId, action });
      toast({ title: 'Estado actualizado correctamente' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsProcessing(false);
      setConfirmAction(null);
    }
  };

  const handleOpenMaps = (location: Place) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`, '_blank');
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
  };

  // 4. Render
  if (!ride) return null;

  // Pantalla Final si el viaje ya cerró operativamente
  if (ride.sharedOperationalStatus === 'completed' || ride.sharedOperationalStatus === 'cancelled_no_valid_passengers') {
    const isSuccess = ride.sharedOperationalStatus === 'completed';
    const summary = ride.sharedCompletionSummary;

    return (
      <div className="flex flex-col min-h-screen bg-zinc-950 text-white relative">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8">
            <div className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center border animate-in zoom-in duration-500",
              isSuccess ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
            )}>
              <VamoIcon name={isSuccess ? "check-circle" : "x-circle"} className="w-12 h-12" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">
                {isSuccess ? "Ciclo Completado" : "Viaje Cancelado"}
              </h1>
              <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">
                {isSuccess ? "Operación Finalizada con Éxito" : "Sin Pasajeros Válidos"}
              </p>
            </div>

            <div className="w-full max-w-sm grid grid-cols-2 gap-3">
               <div className="p-4 rounded-3xl bg-zinc-900 border border-white/5 space-y-1">
                  <p className="text-[10px] font-black text-zinc-500 uppercase">Recaudado</p>
                  <p className="text-xl font-black text-emerald-400">{formatCurrency(ride.totalFare || 0)}</p>
               </div>
               <div className="p-4 rounded-3xl bg-zinc-900 border border-white/5 space-y-1">
                  <p className="text-[10px] font-black text-zinc-500 uppercase">Pasajeros</p>
                  <p className="text-xl font-black text-white">{summary?.validCompletedCount || 0} / {summary?.totalRequests || 0}</p>
               </div>
            </div>

            <div className="w-full max-w-sm space-y-2">
               <div className="flex justify-between items-center p-3 px-5 rounded-2xl bg-zinc-900/50 text-[10px] font-bold uppercase tracking-tight">
                  <span className="text-zinc-500">No presentados</span>
                  <span className="text-red-400">{summary?.noShowCount || 0}</span>
               </div>
               <div className="flex justify-between items-center p-3 px-5 rounded-2xl bg-zinc-900/50 text-[10px] font-bold uppercase tracking-tight">
                  <span className="text-zinc-500">Exceso acompañantes</span>
                  <span className="text-orange-400">{summary?.undeclaredCompanionCount || 0}</span>
               </div>
            </div>

            <div className="p-6 rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/10 w-full max-w-sm">
                <p className="text-indigo-400 font-black uppercase italic text-xs mb-1">Liquidación Diferida</p>
                <p className="text-zinc-500 text-[10px] font-medium leading-relaxed">
                  Este viaje se encuentra en revisión para cierre financiero automático. El saldo se verá reflejado en tu billetera tras el procesamiento de VamO.
                </p>
            </div>

            <Button 
              className="w-full max-w-sm h-16 bg-white hover:bg-zinc-200 text-black font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-white/5"
              onClick={() => onClose?.()}
            >
              SALIR AL MAPA
            </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white relative">
      {/* HEADER */}
      <div className="p-6 pt-12 bg-zinc-900/50 border-b border-white/5 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="px-2 py-0.5 rounded-md bg-indigo-500 text-[10px] font-black uppercase tracking-widest">Modo Compartido</div>
              <div className="px-2 py-0.5 rounded-md bg-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400">ID: {ride.id.slice(-6)}</div>
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter uppercase">Gestión de Viaje</h1>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-zinc-500 uppercase">Efectivo Total</p>
            <p className="text-2xl font-black text-indigo-400 leading-none">{formatCurrency(ride.totalFare || 0)}</p>
          </div>
        </div>
        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-tight italic">
          “Cada solicitud corresponde a 1 pasajero. No se permiten acompañantes no registrados.”
        </p>
      </div>

      <div className="flex-1 p-6 space-y-6 pb-40">
        {/* PRÓXIMA PARADA */}
        {nextStop ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2">
              <VamoIcon name="navigation" className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-400">Próxima Parada</h2>
            </div>
            
            <div className="p-6 rounded-[2.5rem] bg-zinc-900 border border-white/10 shadow-2xl space-y-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
                    nextStop.type === 'pickup' ? "bg-emerald-500/20 text-emerald-500" : "bg-indigo-500/20 text-indigo-500"
                  )}>
                    <VamoIcon name={nextStop.type === 'pickup' ? "user-plus" : "user-minus"} className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white/40 uppercase tracking-widest">{nextStop.type === 'pickup' ? "BUSCAR A" : "DEJAR A"}</p>
                    <p className="text-xl font-black text-white leading-tight">{nextStop.passengerName || currentPassenger?.passengerName || 'Pasajero'}</p>
                  </div>
                </div>
                {nextStop.type === 'dropoff' && (
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase">Cobrar</p>
                        <p className="text-xl font-black text-emerald-400 leading-none">{formatCurrency(currentPassenger?.sharedFareEstimate || ride.sharedFarePerPassenger || 0)}</p>
                    </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-zinc-800/50 border border-white/5 space-y-1">
                <p className="text-xs font-bold text-white leading-snug">{nextStop.location.address}</p>
                <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight">Referencia del destino</p>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <Button 
                  variant="outline" 
                  className="h-16 rounded-2xl border-white/10 bg-zinc-800 hover:bg-zinc-700"
                  onClick={() => handleOpenMaps(nextStop.location)}
                >
                  <VamoIcon name="map-pin" className="w-6 h-6 text-indigo-400" />
                </Button>

                {nextStop.status !== 'arrived' ? (
                  <Button 
                    className="col-span-3 h-16 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs"
                    onClick={() => handleAction('arrive', nextStop.order)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <VamoIcon name="loader" className="animate-spin w-5 h-5" /> : "YA LLEGUÉ"}
                  </Button>
                ) : nextStop.type === 'pickup' ? (
                  <div className="col-span-3 grid grid-cols-2 gap-2">
                    <Button 
                      className="h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] leading-tight"
                      onClick={() => handleAction('confirm_pickup', nextStop.order)}
                      disabled={isProcessing}
                    >
                      CONFIRMAR SUBIDA
                    </Button>
                    <Button 
                      variant="destructive"
                      className="h-16 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-500/20 font-black uppercase tracking-widest text-[10px] leading-tight"
                      onClick={() => setConfirmAction({ action: 'no_show', stopOrder: nextStop.order, passengerName: nextStop.passengerName || '' })}
                      disabled={isProcessing}
                    >
                      NO VINO
                    </Button>
                  </div>
                ) : (
                  <Button 
                    className="col-span-3 h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs"
                    onClick={() => setConfirmAction({ action: 'confirm_dropoff', stopOrder: nextStop.order, passengerName: nextStop.passengerName || '' })}
                    disabled={isProcessing}
                  >
                    CONFIRMAR BAJADA
                  </Button>
                )}
              </div>
              
              {nextStop.status === 'arrived' && nextStop.type === 'pickup' && (
                <Button 
                    variant="ghost"
                    className="w-full h-10 text-[9px] font-bold text-zinc-500 uppercase tracking-widest hover:text-white"
                    onClick={() => setConfirmAction({ action: 'mark_undeclared_companion', passengerName: currentPassenger?.passengerName || '' })}
                    disabled={isProcessing}
                >
                    Informar Exceso de Pasajeros
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <VamoIcon name="check-circle" className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-black uppercase italic">Secuencia Completada</h3>
            <p className="text-zinc-500 text-sm">Todas las paradas han sido procesadas. Podés finalizar el viaje si todos bajaron.</p>
            <Button 
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 font-black uppercase tracking-widest rounded-2xl"
              onClick={() => onClose?.()}
            >
              FINALIZAR VIAJE
            </Button>
          </div>
        )}

        {/* HOJA DE RUTA COMPARTIDA */}
        {ride.orderedStops && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <VamoIcon name="map" className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-500">Hoja de Ruta</h2>
            </div>
            
            <div className="relative space-y-0 pb-4">
               {/* Línea vertical de tiempo */}
               <div className="absolute left-[21px] top-4 bottom-8 w-0.5 bg-zinc-800" />
               
               {ride.orderedStops.map((stop, idx) => {
                  const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
                  const isCurrent = nextStop && nextStop.requestId === stop.requestId && nextStop.type === stop.type;
                  
                  return (
                    <div key={`${stop.requestId}-${stop.type}`} className={cn(
                      "relative flex gap-4 p-3 rounded-2xl transition-all",
                      isCurrent ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-transparent"
                    )}>
                      <div className={cn(
                        "z-10 w-4 h-4 rounded-full mt-1.5 flex items-center justify-center border-2",
                        isCompleted ? "bg-zinc-800 border-zinc-700" : 
                        isCurrent ? "bg-indigo-500 border-indigo-400 animate-pulse" : "bg-zinc-900 border-zinc-800"
                      )}>
                        {isCompleted && <VamoIcon name="check" className="w-2 h-2 text-zinc-500" />}
                      </div>
                      
                      <div className="flex-1">
                         <div className="flex justify-between items-start">
                            <p className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              stop.type === 'pickup' ? "text-emerald-500/60" : "text-indigo-500/60"
                            )}>
                              {idx + 1}. {stop.type === 'pickup' ? "Subida" : "Bajada"}
                            </p>
                            <span className="text-[8px] font-bold text-zinc-600 uppercase">
                              {stop.status || 'pendiente'}
                            </span>
                         </div>
                         <p className={cn(
                           "text-xs font-bold leading-tight",
                           isCompleted ? "text-zinc-500 line-through" : "text-white"
                         )}>
                            {stop.type === 'pickup' ? "Buscar a" : "Dejar a"} {stop.passengerName || 'Pasajero'}
                         </p>
                         <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{stop.location.address}</p>
                      </div>
                    </div>
                  );
               })}
            </div>
          </div>
        )}

        {/* LISTA DE PASAJEROS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <VamoIcon name="users" className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-500">Pasajeros</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {ride.sharedRequestIds.map(rid => {
              const req = requests[rid];
              if (!req) return null;

              const statusColors: Record<string, string> = {
                'picked_up': 'text-emerald-400 bg-emerald-400/10',
                'no_show': 'text-red-400 bg-red-400/10',
                'dropped_off': 'text-indigo-400 bg-indigo-400/10',
                'undeclared_companion': 'text-orange-400 bg-orange-400/10'
              };

              return (
                <div key={rid} className="p-4 rounded-3xl bg-zinc-900/50 border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-black text-zinc-500">
                      {req.passengerName?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{req.passengerName}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">{formatCurrency(req.sharedFareEstimate || ride.sharedFarePerPassenger || 0)} • Cash</p>
                    </div>
                  </div>
                  <div className={cn("px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest", statusColors[req.status] || "bg-zinc-800 text-zinc-500")}>
                    {req.status === 'assigned' ? 'Pendiente' : 
                     req.status === 'picked_up' ? 'A Bordo' :
                     req.status === 'no_show' ? 'No Vino' :
                     req.status === 'dropped_off' ? 'Completado' : req.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="fixed inset-x-0 bottom-0 p-6 z-50 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent">
        <div className="max-w-md mx-auto flex flex-col gap-4">
          <SafetyToolkit ride={ride} role="driver" />
          <PanicButton rideId={ride.id} role="driver" />
        </div>
      </div>

      {/* CONFIRMATION DIALOG */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-zinc-900 border border-white/10 rounded-[2.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-black uppercase italic tracking-tighter">¿Confirmar Acción?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-sm">
              Vas a marcar que el pasajero <span className="text-white font-bold">{confirmAction?.passengerName}</span> {
                confirmAction?.action === 'no_show' ? 'no se presentó' : 
                confirmAction?.action === 'confirm_dropoff' ? 'ha bajado del vehículo' : 
                'tiene exceso de acompañantes'
              }. Esta acción quedará registrada en el sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="flex-1 bg-zinc-800 border-white/5 text-white hover:bg-zinc-700 rounded-2xl h-14 font-bold uppercase text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.action === 'mark_undeclared_companion') {
                    handleOldAction('mark_undeclared_companion', nextStop?.requestId || '');
                } else if (confirmAction.stopOrder !== undefined) {
                    handleAction(confirmAction.action, confirmAction.stopOrder);
                }
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl h-14 font-black uppercase text-xs"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
