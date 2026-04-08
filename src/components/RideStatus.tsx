'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { doc, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  AlertDialog, 
  AlertDialogTrigger, 
  AlertDialogContent, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogDescription, 
  AlertDialogFooter 
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useFirestore, useFirebaseApp, useDoc, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, isPanicButtonVisible } from '@/lib/types';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { haversineDistance } from '@/lib/geo';
import { useMapsAvailability } from '@/components/MapsProvider';
import { Alert, AlertDescription as AlertDescriptionUI, AlertTitle } from './ui/alert';
import { PassengerSearchingSheet } from './PassengerSearchingSheet';
import { PassengerRideHeader } from './PassengerRideHeader';
import { PassengerTripCard } from './PassengerTripCard';
import { PassengerDriverCard } from './PassengerDriverCard';
import { WaitTimerDialog } from './WaitTimerDialog';
import { PanicButton } from './PanicButton';
import { useWaitTimer } from '@/hooks/useWaitTimer';
import RideMap from './RideMap';
import { VamoBottomSheet } from './VamoBottomSheet';
import { ChatContainer } from './Chat/ChatContainer';
import { Map } from '@vis.gl/react-google-maps';
import { RideReceipt } from './RideReceipt';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

const STATUS_CONFIG: Record<string, { title: string; subtitle: string }> = {
    searching: { title: "Buscando conductor", subtitle: "Conectando con un vehículo cercano..." },
    driver_assigned: { title: "Conductor en camino", subtitle: "Ya confirmamos tu viaje" },
    driver_arrived: { title: "Conductor llegó", subtitle: "Te está esperando en el punto de encuentro" },
    in_progress: { title: "Viaje en curso", subtitle: "Dirigiéndote a tu destino" },
    paused: { title: "Viaje en espera", subtitle: "El conductor ha pausado el cronómetro" },
    completed: { title: "Viaje finalizado", subtitle: "Gracias por viajar con VamO" },
    cancelled: { title: "Viaje cancelado", subtitle: "No se pudo concretar el viaje" },
};

export default function RideStatus({ ride, onNewRide }: { ride: WithId<Ride>, onNewRide: () => void }) {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { mapsAvailable } = useMapsAvailability();
  
  const { waitMinutes, waitCost, isCurrentlyWaiting, hasWaitData } = useWaitTimer(ride);
  
  const [isWaitTimerOpen, setIsWaitTimerOpen] = useState(false);
  const [driverEta, setDriverEta] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  
  // FCM Denied State (Bloque 6 Fix)
  const [isFcmDenied, setIsFcmDenied] = useState(false);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setIsFcmDenied(Notification.permission === 'denied');
    }
  }, []);

  const driverLocationRef = useMemoFirebase(() => {
    if (!firestore || !ride.driverId) return null;
    return doc(firestore, "drivers_locations", ride.driverId);
  }, [firestore, ride.driverId]);

  const { data: driverLocationData } = useDoc<any>(driverLocationRef);
  
  const driverLocation = useMemo(() => {
    const loc = driverLocationData?.currentLocation;
    if (!loc) return null;
    const lat = loc.lat ?? loc.latitude;
    const lng = loc.lng ?? loc.longitude;
    if (lat == null || lng == null) return null;
    return { lat, lng };
  }, [driverLocationData]);

  useEffect(() => {
    if (ride.status === 'driver_assigned' && driverLocation && ride.origin) {
        const distance = haversineDistance(driverLocation, ride.origin);
        const etaSeconds = distance / 8.33;
        const etaMinutes = Math.ceil(etaSeconds / 60);

        if (etaMinutes < 1) {
            setDriverEta("Llegando...");
        } else if (etaMinutes > 60) {
            setDriverEta(">1 hora");
        } else {
            setDriverEta(`~${etaMinutes} min`);
        }
    } else {
        setDriverEta(null);
    }
  }, [driverLocation, ride.origin, ride.status]);

  useEffect(() => {
    setIsWaitTimerOpen(isCurrentlyWaiting);
  }, [isCurrentlyWaiting]);

  const handleCancelRide = async () => {
    if (!ride || !firebaseApp) return;
    setIsCancelling(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
      await cancelRideV1({ rideId: ride.id, reason: 'cancelled_by_passenger' });
      toast({ title: 'Viaje cancelado correctamente' });
      setIsCancelDialogOpen(false);
    } catch (e: any) {
      console.error("Error cancelando el viaje (pasajero):", e);
      toast({
        variant: 'destructive',
        title: 'No se pudo cancelar el viaje',
        description: e.message || 'Intenta nuevamente',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Unified Wait Timer Logic (Bloque 6 Fix)
  // No longer need separate effect that overrides isCurrentlyWaiting

  const baseTotal = ride.pricing?.final?.total || ride.pricing?.estimated?.total || (ride.pricing as any)?.finalTotal || (ride.pricing as any)?.estimatedTotal || 0;
  const currentTotalWithWait = baseTotal + waitCost;
  const showMap = ['searching', 'driver_assigned', 'driver_arrived', 'in_progress', 'paused'].includes(ride.status) && mapsAvailable;
  const canPassengerCancel = ride && ['searching', 'driver_assigned', 'driver_arrived'].includes(ride.status);

  const config = STATUS_CONFIG[ride.status] || { title: "Estado del viaje", subtitle: "Actualizando..." };

  return (
    <>
      <div className="fixed inset-0 flex flex-col bg-transparent overflow-hidden"> 
      {/* MAP BACKGROUND */}
      {showMap && (
        <div className="absolute inset-0 z-0">
            <Map
              defaultCenter={ride.origin}
              defaultZoom={15}
              gestureHandling={'greedy'}
              disableDefaultUI={true}
              mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "vamo-passenger-map"}
            >
                <RideMap 
                    status={ride.status}
                    origin={ride.origin}
                    destination={ride.destination}
                    driverLocation={driverLocation}
                    isExpanded={isExpanded}
                />
            </Map>
        </div>
      )}

      {/* TOP STATUS OVERLAY (MINIMAL) */}
      <div className="absolute top-6 inset-x-0 z-50 flex flex-col items-center gap-3 pointer-events-none px-6">
          <div className="glass-morphism premium-shadow rounded-full px-5 py-2 flex items-center gap-2 pointer-events-auto border border-white/5">
              <div className={cn("w-2 h-2 rounded-full", ride.status === 'searching' ? 'bg-indigo-500 animate-pulse' : 'bg-primary')} />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">{config.title}</span>
          </div>

          {/* FCM DENIED BANNER (Bug 2 Fix) */}
          {isFcmDenied && (
            <div className="glass-morphism premium-shadow border border-red-500/30 rounded-2xl px-4 py-2 flex items-center gap-3 pointer-events-auto max-w-xs animate-in slide-in-from-top-4 duration-500">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                    <VamoIcon name="bell-off" className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-red-500 tracking-tighter">NOTIFICACIONES BLOQUEADAS</span>
                    <span className="text-[9px] text-red-200/60 leading-tight">Tocá el candado 🔒 en la barra y habilitá Permisos.</span>
                </div>
            </div>
          )}
      </div>

      {/* UNIFIED VAMO SHEET */}
      <VamoBottomSheet
        isOpen={true}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        minHeight={ride.status === 'searching' ? '55vh' : '40vh'}
        maxHeight="75vh"
      >
          {ride.status === 'searching' ? (
             <PassengerSearchingSheet
               serviceType={ride.serviceType as 'premium' | 'express'}
               estimatedPrice={ride.pricing?.estimated?.total || null}
               originAddress={ride.origin.address}
               destinationAddress={ride.destination.address}
               onCancel={handleCancelRide}
               isCancelling={isCancelling}
             />
          ) : (ride.status === 'cancelled' || (['driver_assigned', 'driver_arrived', 'in_progress', 'paused'].includes(ride.status) && !ride.driverId)) ? (
             <div className="flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-500">
                 <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                     <VamoIcon name="x-circle" className="w-10 h-10 text-red-500" />
                 </div>
                 <h2 className="text-2xl font-black text-white uppercase mb-2">Viaje Cancelado</h2>
                 <p className="text-zinc-500 font-medium mb-8">
                     {ride.cancelReason === 'expired_no_acceptance' || ride.cancelReason === 'expired_no_drivers'
                         ? "No encontramos conductores disponibles en este momento."
                         : "El viaje no pudo completarse o fue cancelado."}
                 </p>
                 <Button 
                    onClick={onNewRide}
                    className="w-full h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase tracking-widest"
                 >
                    Volver a intentar
                 </Button>
             </div>
          ) : (
             <div className="flex flex-col animate-in fade-in duration-300">
                 {/* DRIVER INFO - Only if we have a real driver assigned */}
                 {ride.driverId ? (
                    <PassengerDriverCard 
                        name={ride.driverName || 'Conductor'}
                        rating={ride.driverRating || '5.0'}
                        vehicle={ride.driverVehicle || 'Cargando...'}
                        plate={ride.driverPlate || '...'}
                        vehiclePhoto={ride.driverVehiclePhoto}
                        photoURL={(ride as any).driverPhotoUrl}
                        eta={ride.status === 'driver_assigned' ? driverEta : null}
                        statusText={ride.status !== 'driver_assigned' ? (ride.status === 'driver_arrived' ? 'AQUÍ' : 'EN VIAJE') : null}
                        onChat={() => setIsChatOpen(true)}
                        unreadCount={ride.chatSummary?.unreadCountPassenger || 0}
                    />
                 ) : (
                    <div className="p-6 text-center text-zinc-500 font-bold uppercase tracking-widest">
                        Actualizando conductor...
                    </div>
                 )}

                 {/* ACTIVE WAIT INDICATOR (IF ANY) */}
                 {hasWaitData && waitCost > 0 && (
                     <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 mb-4 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <VamoIcon name="clock" className="h-4 w-4 text-orange-500" />
                             <span className="text-[10px] font-black uppercase text-orange-600 dark:text-orange-400">Espera: {waitMinutes} min</span>
                         </div>
                         <span className="text-sm font-black text-orange-600">+{formatCurrency(waitCost)}</span>
                     </div>
                 )}

                 {/* EXPANDABLE SECTION */}
                 {isExpanded && (
                    <div className="flex flex-col gap-4 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <PassengerTripCard 
                            serviceType={ride.serviceType as 'premium' | 'express'}
                            estimatedPrice={ride.pricing?.estimated?.total || null}
                            originAddress={ride.origin.address}
                            destinationAddress={ride.destination.address}
                        />
                    </div>
                 )}

                 {/* PRICE & PRIMARY ACTION */}
                 <div className="flex flex-col gap-4 mt-2">
                     <div className="flex items-center justify-between bg-zinc-900/50 rounded-2xl p-5 border border-white/5">
                         <div className="flex flex-col">
                             <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Total Final</span>
                             <span className="text-2xl font-black text-white leading-none">{formatCurrency(currentTotalWithWait)}</span>
                         </div>
                         <VamoIcon name="credit-card" className="h-6 w-6 text-zinc-700" />
                     </div>

                     {isPanicButtonVisible(ride.status) && (
                         <PanicButton rideId={ride.id} role="passenger" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl border-none" />
                     )}

                     {canPassengerCancel && (
                         <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                             <AlertDialogTrigger asChild>
                                 <button className="w-full h-12 flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-zinc-600 hover:text-white transition-colors">
                                     Cancelar viaje
                                 </button>
                             </AlertDialogTrigger>
                             <AlertDialogContent className="rounded-[2.5rem] p-8 border-zinc-800 bg-zinc-950">
                                 <AlertDialogHeader>
                                     <AlertDialogTitle className="text-2xl font-black uppercase text-center text-white">¿Cancelar?</AlertDialogTitle>
                                     <AlertDialogDescription className="text-zinc-500 text-center font-medium mt-2">
                                         {ride.status === 'driver_arrived'
                                         ? 'Tu conductor ya llegó al punto de encuentro.'
                                         : 'Tu conductor ya está en camino a buscarte.'}
                                     </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <div className="flex flex-col gap-3 mt-8">
                                     <Button variant="destructive" className="rounded-2xl h-14 font-black uppercase tracking-widest" disabled={isCancelling} onClick={handleCancelRide}>
                                         {isCancelling ? <VamoIcon name="loader" className="animate-spin mr-2" /> : 'Confirmar Cancelación'}
                                     </Button>
                                     <Button variant="ghost" className="rounded-2xl h-12 font-bold text-zinc-500" disabled={isCancelling} onClick={() => setIsCancelDialogOpen(false)}>
                                         Volver
                                     </Button>
                                 </div>
                             </AlertDialogContent>
                         </AlertDialog>
                     )}
                 </div>
             </div>
          )}
      </VamoBottomSheet>
      
      {/* IMMEDIATE COMPLETION RECEIPT (Bloque 6) */}
      {ride.status === 'completed' && (
        <div className="fixed inset-0 z-[60] bg-background pointer-events-auto overflow-y-auto px-4 py-8">
            <RideReceipt 
                ride={ride} 
                onClose={onNewRide}
                className="max-w-md mx-auto"
            />
        </div>
      )}
    </div>

    {/* WAIT TIMER DIALOG (Bloque 3/6 Fix) */}
    <WaitTimerDialog
      isOpen={isWaitTimerOpen}
      onOpenChange={setIsWaitTimerOpen}
      waitMinutes={waitMinutes}
      waitCost={formatCurrency(waitCost)}
      currentTotal={formatCurrency(currentTotalWithWait)}
    />

    {/* CHAT OVERLAY (Pasajero) */}
    {isChatOpen && (
      <div className="fixed inset-0 z-[100] flex flex-col justify-end p-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsChatOpen(false)} />
          <div className="relative z-10 w-full max-w-lg mx-auto">
              <ChatContainer 
                  ride={ride}
                  role="passenger"
                  onClose={() => setIsChatOpen(false)}
              />
          </div>
      </div>
    )}
  </>
  );
}
