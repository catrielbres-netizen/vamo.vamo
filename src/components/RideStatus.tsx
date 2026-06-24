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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useFirestore, useFirebaseApp, useDoc, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Ride, isPanicButtonVisible, WithId } from '@/lib/types';
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
import FinishedRideSummary from './FinishedRideSummary';
import { cn } from '@/lib/utils';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import { SafetyToolkit } from './SafetyToolkit';
import { PassengerSharedRoadSheet } from './PassengerSharedRoadSheet';
import { MercadoPagoPaymentButton } from './MercadoPagoPaymentButton';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

const STATUS_CONFIG: Record<string, { title: string; subtitle: string }> = {
    searching: { title: "Buscando conductor", subtitle: "Conectando con un vehículo cercano..." },
    searching_shared: { title: "Buscando conductor", subtitle: "El grupo está listo. Buscando conductor..." },
    pending_driver_assignment: { title: "Buscando conductor", subtitle: "Asignando tu reserva..." },
    driver_assigned: { title: "Conductor en camino", subtitle: "Ya confirmamos tu viaje" },
    driver_assigned_scheduled: { title: "Reserva confirmada", subtitle: "Conductor asignado. Te avisaremos cuando esté en camino" },
    activating: { title: "Viaje próximo", subtitle: "Tu conductor se está preparando" },
    driver_arrived: { title: "Conductor llegó", subtitle: "Te está esperando en el punto de encuentro" },
    in_progress: { title: "Viaje en curso", subtitle: "Dirigiéndote a tu destino" },
    paused: { title: "Viaje en espera", subtitle: "El conductor ha pausado el cronómetro" },
    completed: { title: "Viaje finalizado", subtitle: "Gracias por viajar con VamO" },
    cancelled: { title: "Viaje cancelado", subtitle: "No se pudo concretar el viaje" },
    failed_no_driver: { title: "Sin conductor", subtitle: "No pudimos asignar tu reserva" },
    accepted: { title: "Viaje aceptado", subtitle: "El conductor está organizando la ruta" },
};


export default function RideStatus({ ride, onNewRide, onCancel }: { ride: WithId<Ride>, onNewRide: () => void, onCancel?: () => Promise<void> | void }) {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { profile } = useUser();
  const { toast } = useToast();
  const { mapsAvailable } = useMapsAvailability();
  
  const { waitMinutes, waitCost, isCurrentlyWaiting, hasWaitData, isEarlyArrival } = useWaitTimer(ride);
  const scheduledTimeStr = ride?.scheduledAt ? (ride.scheduledAt as Timestamp).toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
  
  const [isWaitTimerOpen, setIsWaitTimerOpen] = useState(false);
  const [driverEta, setDriverEta] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
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
    if (ride?.status === 'driver_assigned' && driverLocation && ride?.origin) {
        const distance = haversineDistance(driverLocation, ride.origin);
        const etaSeconds = distance / 8.33;
        const etaMinutes = Math.ceil(etaSeconds / 60);

        if (etaMinutes < 1) setDriverEta("Llegando...");
        else if (etaMinutes > 60) setDriverEta(">1 hora");
        else setDriverEta(`~${etaMinutes} min`);
    } else {
        setDriverEta(null);
    }
  }, [driverLocation, ride?.origin, ride?.status]);

  useEffect(() => {
    setIsWaitTimerOpen(isCurrentlyWaiting);
    if (isCurrentlyWaiting) {
      setIsChatOpen(false);
    }
  }, [isCurrentlyWaiting]);

  const handleCancelRide = async () => {
    setIsCancelling(true);
    try {
      if (onCancel) {
          await onCancel();
          setIsCancelDialogOpen(false);
          return;
      }
      if (!ride || !firebaseApp) return;
      const functions = getFunctions(undefined, 'us-central1');
      const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
      await cancelRideV1({ rideId: ride.id, reason: 'cancelled_by_passenger' });
      toast({ title: 'Viaje cancelado correctamente' });
      setIsCancelDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo cancelar el viaje', description: e.message || 'Intenta nuevamente' });
    } finally {
      setIsCancelling(false);
    }
  };

  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [hasClosedReceipt, setHasClosedReceipt] = useState(false);

  // [Bug 2 Fix] Cleanup after receipt closed
  const isMyDropoffCompleted = useMemo(() => {
     if (!ride.isSharedRide || !ride.orderedStops || profile?.role !== 'passenger') return false;
     const myDropoff = ride.orderedStops.find(s => s.passengerId === profile?.uid && s.type === 'dropoff');
     return myDropoff?.status === 'completed';
  }, [ride, profile?.uid, profile?.role]);

  useEffect(() => {
    if ((ride?.status === 'completed' || isMyDropoffCompleted) && hasClosedReceipt) {
      onNewRide();
    }
  }, [ride?.status, isMyDropoffCompleted, hasClosedReceipt, onNewRide]);

  // VOICE SYNTHESIS FOR ARRIVAL
  const hasSpokenArrivalInfo = React.useRef(false);
  useEffect(() => {
     if (ride?.status === 'driver_arrived' && !hasSpokenArrivalInfo.current) {
        hasSpokenArrivalInfo.current = true;
        try {
           if ('speechSynthesis' in window) {
              const utterance = new SpeechSynthesisUtterance("Tu conductor está afuera de tu domicilio");
              utterance.lang = 'es-AR';
              utterance.rate = 1.0;
              window.speechSynthesis.speak(utterance);
           }
        } catch (e) {
           console.warn("Speech synthesis error", e);
        }
     } else if (ride?.status === 'searching' || ride?.status === 'driver_assigned') {
        hasSpokenArrivalInfo.current = false;
     }
  }, [ride?.status]);

  const rideFinancialData = useMemo(() => {
      if (!ride) return null;
      const fin = getRideFinancialSnapshot(ride);
      const isShared = ride.isSharedRide;
      const myData = isShared ? ride.sharedPassengers?.find((p: any) => p.passengerId === profile?.uid) as any : null;
      
      return {
          financial: fin,
          rawTotal: fin.totalFare,
          walletAmount: fin.walletCoveredAmount,
          cashToPay: fin.cashToCollect,
          hasWallet: fin.walletCoveredAmount > 0,
          isShared,
          myData,
          mySharedFare: myData?.sharedFare,
          myIndividualFare: myData?.individualQuotedFare,
          mySavings: myData?.savingsAmount,
          groupTotal: fin.totalFare
      };
  }, [ride, profile?.uid]);

  if (!ride || !rideFinancialData) {
      return null;
  }

  // [VamO PRO] Unified Financial Source
  const financial = getRideFinancialSnapshot(ride);
  const baseCashToPay = financial.cashToCollect;
  const currentTotalWithWait = baseCashToPay + waitCost;
  const showMap = ['searching', 'driver_assigned', 'driver_arrived', 'in_progress', 'paused'].includes(ride.status) && mapsAvailable;
  const canPassengerCancel = ride && ['searching', 'driver_assigned', 'driver_arrived'].includes(ride.status);
  const statusKey = (ride.status === 'searching' && ride.isSharedRide) ? 'searching_shared' 
                    : (ride.status === 'driver_assigned' && ride.isScheduled && ride.activationStatus === 'waiting_scheduled_time') ? 'driver_assigned_scheduled'
                    : ride.status;
  const config = STATUS_CONFIG[statusKey] || { title: "Estado del viaje", subtitle: "Actualizando..." };


  return (
    <>
      <div className="fixed inset-0 z-[100] flex flex-col bg-transparent overflow-hidden"> 
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

      <div className="absolute top-6 inset-x-0 z-50 flex flex-col items-center gap-3 pointer-events-none px-6">
          <div className="glass-morphism premium-shadow rounded-full px-5 py-2 flex items-center gap-2 pointer-events-auto border border-white/5">
              <div className={cn("w-2 h-2 rounded-full", ride.status === 'searching' ? 'bg-indigo-500 animate-pulse' : 'bg-primary')} />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">{config.title}</span>
          </div>

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

      {(ride.status !== 'completed' && !isMyDropoffCompleted) && (
      <VamoBottomSheet
        isOpen={true}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        minHeight={ride.status === 'searching' ? '55vh' : '40vh'}
        maxHeight="75vh"
      >
          {ride.status === 'searching' && ride.isSharedRide ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <span className="text-3xl">🚗</span>
                  </div>
                  <div>
                      <h3 className="text-white font-black text-lg uppercase tracking-widest">Buscando conductor</h3>
                      <p className="text-zinc-400 text-sm mt-1">El grupo está listo. Contactando conductores cercanos...</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'0ms'}} />
                      <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'150ms'}} />
                      <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'300ms'}} />
                  </div>
              </div>
          ) : ride.status === 'searching' ? (
              <PassengerSearchingSheet
                  serviceType={ride.serviceType}
                  estimatedPrice={financial.totalFare}
                  walletCoveredAmount={financial.walletCoveredAmount}
                  cashToCollect={financial.cashToCollect}
                  originAddress={ride.origin?.address || (ride as any).originAddress || "Origen desconocido"}
                  destinationAddress={ride.destination?.address || (ride as any).destinationAddress || "Destino desconocido"}
                  onCancel={handleCancelRide}
                  isCancelling={isCancelling}
                  notifiedCount={ride.notifiedDrivers?.length || 0}
              />
          ) : (ride.status === 'cancelled' || ride.status === 'failed_no_driver' || (['driver_assigned', 'driver_arrived', 'in_progress', 'paused', 'activating'].includes(ride.status) && !ride.driverId)) ? (
             <div className="flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-500">
                 <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                     <VamoIcon name="x-circle" className="w-10 h-10 text-red-500" />
                 </div>
                 <h2 className="text-2xl font-black text-white uppercase mb-2">{ride.status === 'failed_no_driver' ? 'Sin conductor' : 'Viaje Cancelado'}</h2>
                 <p className="text-zinc-500 font-medium mb-8">
                     {ride.status === 'failed_no_driver'
                         ? "No pudimos asignar un conductor para tu reserva programada."
                         : ride.cancelReason === 'expired_no_acceptance' || ride.cancelReason === 'expired_no_drivers'
                             ? "No encontramos conductores disponibles en este momento."
                             : "El viaje no pudo completarse o fue cancelado."}
                 </p>
                 <Button onClick={onNewRide} className="w-full h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase tracking-widest">
                    Volver a intentar
                 </Button>
             </div>
          ) : (
             <div className="flex flex-col animate-in fade-in duration-300">
                 {ride.driverId ? (
                    <PassengerDriverCard 
                        name={ride.driverName || 'Conductor'}
                        rating={ride.driverRating || '5.0'}
                        vamoScore={(ride as any).driverVamoScore ?? undefined}
                        vehicle={ride.driverVehicle || 'Cargando...'}
                        vehicleBrand={ride.driverVehicleBrand || undefined}
                        vehicleModel={ride.driverVehicleModel || undefined}
                        vehicleYear={ride.driverVehicleYear || undefined}
                        vehicleColor={ride.driverVehicleColor || undefined}
                        plate={ride.driverPlate || '...'}
                        vehiclePhoto={ride.driverVehiclePhoto}
                        photoURL={(ride as any).driverPhotoUrl}
                        eta={(ride.status === 'driver_assigned' && ride.activationStatus !== 'waiting_scheduled_time') ? driverEta : null}
                        statusText={(ride.status === 'driver_assigned' && ride.isScheduled && ride.activationStatus === 'waiting_scheduled_time') ? 'RESERVADO' : (ride.status !== 'driver_assigned' ? (ride.status === 'driver_arrived' ? 'ESTÁ AFUERA' : 'EN VIAJE') : null)}
                        isArrived={ride.status === 'driver_arrived'}
                        onChat={() => setIsChatOpen(true)}
                        unreadCount={ride.chatSummary?.unreadCountPassenger || 0}
                        isMunicipal={ride.municipalStatus === 'active'}
                    />
                 ) : (
                    <div className="p-6 text-center text-zinc-500 font-bold uppercase tracking-widest">Actualizando conductor...</div>
                 )}

                 {hasWaitData && waitCost > 0 && (
                     <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border border-orange-500/30 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-lg shadow-orange-500/5">
                         <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                 <VamoIcon name="clock" className="h-4 w-4 text-orange-500" />
                             </div>
                             <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Espera: {waitMinutes} min</span>
                         </div>
                         <span className="text-lg font-black text-orange-400 drop-shadow-sm">+{formatCurrency(waitCost)}</span>
                     </div>
                 )}

                 {isExpanded && !ride.isSharedRide && (
                    <div className="flex flex-col gap-4 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <PassengerTripCard 
                            serviceType={ride.serviceType}
                            estimatedPrice={financial.totalFare}
                            originAddress={ride.origin?.address || (ride as any).originAddress || 'Origen desconocido'}
                            destinationAddress={ride.destination?.address || (ride as any).destinationAddress || 'Destino desconocido'}
                            walletCoveredAmount={financial.walletCoveredAmount}
                            netPassengerPay={financial.cashToCollect}
                            grossFare={financial.totalFare}
                            dynamicSnapshot={ride.pricing?.dynamic}
                        />
                    </div>
                 )}

                  {ride.isSharedRide && ride.orderedStops && (
                      <div className="px-1 mb-4">
                          <PassengerSharedRoadSheet ride={ride} myId={profile?.uid} />
                      </div>
                  )}

                  <div className="flex flex-col gap-3 mt-2">
                       {rideFinancialData.isShared ? (
                                  <div className="bg-zinc-950/90 border border-emerald-500/20 rounded-[2rem] p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden backdrop-blur-md mb-2">
                                     <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[80px]" />
                                     
                                     {rideFinancialData.mySharedFare !== undefined ? (
                                        <>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">Tu tarifa compartida</span>
                                                <span className="text-4xl font-black tracking-tighter leading-none text-white italic drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] mt-1">
                                                    {formatCurrency(rideFinancialData.mySharedFare)}
                                                </span>
                                            </div>
                                            {(rideFinancialData.mySavings ?? 0) > 0 && (
                                                <div className="flex justify-between items-center text-xs px-1">
                                                    <span className="font-bold text-emerald-400/80 uppercase tracking-tight">Ahorraste</span>
                                                    <span className="font-black text-emerald-400">{formatCurrency(rideFinancialData.mySavings || 0)}</span>
                                                </div>
                                            )}
                                            {(rideFinancialData.myIndividualFare ?? 0) > 0 && (
                                                <div className="flex justify-between items-center text-xs px-1 mt-1 border-t border-white/5 pt-2">
                                                    <span className="font-bold text-zinc-500 uppercase tracking-tight">Costo individual original</span>
                                                    <span className="font-bold text-zinc-500 line-through">{formatCurrency(rideFinancialData.myIndividualFare || 0)}</span>
                                                </div>
                                            )}
                                        </>
                                     ) : (
                                        <div className="flex items-center gap-2">
                                            <VamoIcon name="loader" className="w-4 h-4 animate-spin text-emerald-500" />
                                            <span className="text-xs font-bold text-zinc-400">Calculando tu tarifa compartida...</span>
                                        </div>
                                     )}
                                     
                                     <div className="h-px bg-white/5 mx-1 my-1" />
                                     
                                     <div className="flex justify-between items-center text-[10px] px-1">
                                         <span className="font-bold text-zinc-500 uppercase tracking-widest">Total del grupo</span>
                                         <span className="font-black text-zinc-400">{formatCurrency(rideFinancialData.groupTotal)}</span>
                                     </div>
                                     <p className="text-[8px] text-zinc-600 px-1 italic leading-tight">Suma de los aportes de todos los pasajeros. El conductor cobra este total.</p>
                                  </div>
                       ) : (
                               <div className="bg-zinc-950/90 border border-white/5 rounded-[2rem] p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden backdrop-blur-md mb-2">
                                  {/* Subtle glow effect */}
                                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px]" />
                                  
                                  <div className="flex justify-between items-center text-xs px-1">
                                      <span className="font-bold text-zinc-500 uppercase tracking-[0.2em]">Tarifa del viaje</span>
                                      <span className="font-black text-white/90">{formatCurrency(rideFinancialData.rawTotal)}</span>
                                  </div>
                                  
                                  {rideFinancialData.hasWallet && (
                                     <div className="flex justify-between items-center text-xs px-1 animate-in slide-in-from-right-2 duration-500">
                                         <div className="flex items-center gap-2 text-emerald-400">
                                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                             <span className="font-black uppercase tracking-widest text-[9px]">VamO Pay aplicado</span>
                                         </div>
                                         <span className="font-black text-emerald-400">-{formatCurrency(rideFinancialData.walletAmount)}</span>
                                     </div>
                                  )}

                                  {waitCost > 0 && (
                                     <div className="flex justify-between items-center text-xs px-1 animate-in slide-in-from-right-2 duration-500 text-orange-400">
                                         <div className="flex items-center gap-2">
                                             <VamoIcon name="clock" className="w-3 h-3" />
                                             <span className="font-black uppercase tracking-widest text-[9px]">Espera acumulada ({waitMinutes}m)</span>
                                         </div>
                                         <span className="font-black">+{formatCurrency(waitCost)}</span>
                                     </div>
                                  )}
                                  
                                  <div className="h-px bg-white/5 mx-1" />
                                  
                                  <div className="flex justify-between items-end p-2">
                                      <div className="flex flex-col gap-1">
                                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] leading-none italic">Total efectivo</span>
                                          <span className="text-[8px] font-medium text-zinc-600 uppercase tracking-widest">A pagar al conductor</span>
                                      </div>
                                      <div className="flex flex-col items-end">
                                          <span className="text-4xl font-black tracking-tighter leading-none text-white italic drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                                              {formatCurrency(rideFinancialData.cashToPay)}
                                          </span>
                                      </div>
                                  </div>
                              </div>
                       )}
                       {/* [MP_SINGLE_DRIVER_MODE] Mercado Pago Button */}
                       <div className="px-1">
                           <MercadoPagoPaymentButton ride={ride as any} amount={getRideFinancialSnapshot(ride).cashToCollect} />
                       </div>
                      <div className="flex flex-col gap-2 pb-4 mt-2">
                        <Button 
                            variant="outline"
                            onClick={() => setIsMapModalOpen(true)}
                            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest border-white/5 bg-white/[0.03] text-zinc-400 hover:text-white"
                        >
                            <VamoIcon name="map" className="mr-2 h-5 w-5 text-indigo-500" />
                            Ver Recorrido
                        </Button>

                        <Button 
                            variant="outline"
                            onClick={() => {
                                const shareUrl = `${window.location.origin}/share/${ride.id}`;
                                if (navigator.share) {
                                  navigator.share({
                                    title: 'Seguí mi viaje en VamO',
                                    text: `Hola! Estoy viajando con VamO. Seguí mi recorrido en tiempo real acá:`,
                                    url: shareUrl,
                                  }).catch(console.error);
                                } else {
                                  navigator.clipboard.writeText(shareUrl);
                                  toast({ title: "Enlace copiado", description: "Compartilo con quien quieras para que siga tu viaje." });
                                }
                            }}
                            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest border-white/5 bg-white/[0.03] text-zinc-400 hover:text-white"
                        >
                            <VamoIcon name="share-2" className="mr-2 h-5 w-5 text-indigo-500" />
                            Compartir Trayecto
                        </Button>

                        <SafetyToolkit ride={ride} role="passenger" className="mt-2" />

                        {isPanicButtonVisible(ride.status) && (
                            <PanicButton rideId={ride.id} role="passenger" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl border-none" />
                        )}
                      </div>
                     {canPassengerCancel && (
                         <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                             <AlertDialogTrigger asChild>
                                 <button className="w-full h-12 flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-zinc-600 hover:text-white transition-colors">Cancelar viaje</button>
                             </AlertDialogTrigger>
                             <AlertDialogContent className="rounded-[2.5rem] p-8 border-zinc-800 bg-zinc-950">
                                 <AlertDialogHeader>
                                     <AlertDialogTitle className="text-2xl font-black uppercase text-center text-white">¿Cancelar?</AlertDialogTitle>
                                     <AlertDialogDescription className="text-zinc-500 text-center font-medium mt-2">
                                         {ride.status === 'driver_arrived' ? 'Tu conductor ya llegó.' : 'Tu conductor ya está en camino.'}
                                     </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <div className="flex flex-col gap-3 mt-8">
                                     <Button variant="destructive" className="rounded-2xl h-14 font-black uppercase tracking-widest" disabled={isCancelling} onClick={handleCancelRide}>
                                         {isCancelling ? <VamoIcon name="loader" className="animate-spin mr-2" /> : 'Confirmar'}
                                     </Button>
                                     <Button variant="ghost" className="rounded-2xl h-12 font-bold text-zinc-500" disabled={isCancelling} onClick={() => setIsCancelDialogOpen(false)}>Volver</Button>
                                 </div>
                             </AlertDialogContent>
                         </AlertDialog>
                     )}
                  </div>
             </div>
          )}
      </VamoBottomSheet>
      )}
      
      {(ride.status === 'completed' || isMyDropoffCompleted) && !hasClosedReceipt && (
          <div className="fixed inset-0 z-[60] bg-background overflow-y-auto pointer-events-auto pt-safe pb-8">
            <div className="max-w-md mx-auto">
                <FinishedRideSummary 
                    ride={ride} 
                    userRole="passenger"
                    onClose={() => {
                        setHasClosedReceipt(true);
                    }}
                />
            </div>
          </div>
      )}
    </div>

    <WaitTimerDialog
      isOpen={isWaitTimerOpen}
      onOpenChange={setIsWaitTimerOpen}
      waitMinutes={waitMinutes}
      waitCost={formatCurrency(waitCost)}
      currentTotal={formatCurrency(currentTotalWithWait)}
      isEarlyArrival={isEarlyArrival}
      scheduledTime={scheduledTimeStr}
    />

    {/* [VamO PRO] In-app Trip Map Modal */}
    <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
      <DialogContent className="max-w-md w-[95vw] p-0 overflow-hidden rounded-[2.5rem] bg-zinc-950 border-white/5 shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
            <VamoIcon name="map" className="text-indigo-500" />
            Recorrido del Viaje
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-xs font-medium uppercase tracking-widest">
            Desde {(ride.origin?.address || (ride as any).originAddress || "Origen no disponible").split(',')[0]} hasta {(ride.destination?.address || (ride as any).destinationAddress || "Destino no disponible").split(',')[0]}
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative h-[35vh] w-full border-y border-white/5">
          {mapsAvailable ? (
            <Map
              defaultCenter={ride.origin}
              defaultZoom={13}
              gestureHandling={'greedy'}
              disableDefaultUI={true}
              mapId="passenger-modal-map"
            >
              <RideMap 
                status={ride.status}
                origin={ride.origin}
                destination={ride.destination}
                driverLocation={driverLocation}
                isExpanded={true}
              />
            </Map>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-500">
               <VamoIcon name="loader" className="animate-spin" />
               <span className="text-[10px] font-bold uppercase tracking-widest">Actualizando ubicación...</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-zinc-900/50">
           <Button 
             variant="ghost" 
             onClick={() => setIsMapModalOpen(false)}
             className="w-full h-12 rounded-xl text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:text-white"
           >
             Cerrar Mapa
           </Button>
        </div>
      </DialogContent>
    </Dialog>

    {isChatOpen && (
      <div className="fixed inset-0 z-[100] flex flex-col justify-end p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsChatOpen(false)} />
          <div className="relative z-10 w-full max-w-lg mx-auto">
              <ChatContainer ride={ride} role="passenger" onClose={() => setIsChatOpen(false)} />
          </div>
      </div>
    )}
  </>
  );
}
