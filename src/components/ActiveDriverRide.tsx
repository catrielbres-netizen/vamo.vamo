'use client';

import React, { useEffect, useState } from 'react';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { doc, serverTimestamp, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride, isPanicButtonVisible } from '@/lib/types';
import { PanicButton } from './PanicButton';
import { WithId } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ChatContainer } from './Chat/ChatContainer';
import { ChatTrigger } from './Chat/ChatTrigger';
import FinishedRideSummary from './FinishedRideSummary';
import { useRouter } from 'next/navigation';
import { Map } from '@vis.gl/react-google-maps';
import RideMap from './RideMap';
import { useMapsAvailability } from '@/components/MapsProvider';
import { TripCard } from './TripCard';
import { useWaitTimer } from '@/hooks/useWaitTimer';
import { VamoBottomSheet } from './VamoBottomSheet';
import { WaitTimerDialog } from './WaitTimerDialog';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
}

export default function ActiveDriverRide({ ride }: { ride: WithId<Ride> }) {
  const firestore = useFirestore();
  const { user, profile } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const router = useRouter();
  const { mapsAvailable } = useMapsAvailability();
  
  const { waitMinutes, waitCost, hasWaitData, isCurrentlyWaiting } = useWaitTimer(ride);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Bloque 4: Summary Preview Logic
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isWaitTimerOpen, setIsWaitTimerOpen] = useState(false);
  
  const isFemale = profile?.gender === 'female';
  
  useEffect(() => {
    setIsWaitTimerOpen(isCurrentlyWaiting);
  }, [isCurrentlyWaiting]);

  const fetchPreview = async () => {
    if (!firebaseApp || isLoadingPreview) return;
    setIsLoadingPreview(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const getPreview = httpsCallable(functions, 'getRideSummaryPreviewV1');
      const result = await getPreview({ rideId: ride.id });
      if (result.data && (result.data as any).success) {
        setPreviewData((result.data as any).summary);
      }
    } catch (error: any) {
      console.error('Error fetching preview:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo obtener el resumen del viaje.' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (isPreviewOpen) {
      fetchPreview();
    }
  }, [isPreviewOpen]);

  useEffect(() => {
    if (profile?.role === 'driver' && profile.activeRideId === null && ride.status === 'completed') {
      // Forzar redirección inmediata y reset de estado garantizado
      window.location.href = '/driver/rides';
    }
  }, [profile?.activeRideId, profile?.role, ride.status]);

  // --- ETA UPDATE LOGIC (Bloque 2) ---
  const [lastEta, setLastEta] = useState<number | null>(null);

  useEffect(() => {
    if (ride.status !== 'driver_assigned' || !firestore) return;

    const updateETA = async () => {
      // Get current driver location
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        const driverLoc = { lat: latitude, lng: longitude };
        
        const toRad = (x: number) => x * Math.PI / 180;
        const R = 6371;
        const dLat = toRad(ride.origin.lat - driverLoc.lat);
        const dLon = toRad(ride.origin.lng - driverLoc.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRad(driverLoc.lat)) * Math.cos(toRad(ride.origin.lat)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = R * c;

        const newEta = Math.max(1, Math.round((distanceKm / 30) * 60));
        
        // --- PERFORMANCE IMPROVEMENT ---
        // Only update if difference is >= 1 minute to save writes and bandwidth
        const currentEtaInDoc = ride.etaMinutes ?? 0;
        if (Math.abs(currentEtaInDoc - newEta) < 1 && lastEta !== null) {
          return;
        }

        console.log(`[ETA_UPDATE] Setting new ETA: ${newEta}min (Distance: ${distanceKm.toFixed(2)}km)`);
        setLastEta(newEta);

        try {
          await updateDoc(doc(firestore, 'rides', ride.id), {
            etaMinutes: newEta,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Failed to update ETA:", e);
        }
      }, (err) => {
        console.warn("Geolocation failed for ETA:", err);
      });
    };

    updateETA();
    const interval = setInterval(updateETA, 45000);
    return () => clearInterval(interval);
  }, [ride.status, ride.id, ride.origin, firestore, ride.etaMinutes, lastEta]);
  // --- END ETA UPDATE LOGIC ---

  const handleStartRide = async () => {
    if (!firebaseApp || !user || isProcessing) return;
    setIsProcessing(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const startRideV1 = httpsCallable(functions, 'startRideV1');
      await startRideV1({ rideId: ride.id });
      toast({ title: '¡Viaje iniciado!', description: 'Que tengas una buena ruta.' });
    } catch (error: any) {
      console.error('Error en la transacción de handleStartRide:', error);
      toast({
        variant: 'destructive',
        title: 'No se pudo iniciar el viaje',
        description: error.message || 'Un error inesperado ocurrió.',
        duration: 9000,
      });
    } finally { setIsProcessing(false); }
  };

  const handleArrived = async () => {
    if (!firebaseApp || isProcessing) return;
    setIsProcessing(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const driverArrived = httpsCallable(functions, 'driverArrivedV1');
      await driverArrived({ rideId: ride.id });
      toast({ title: '¡Llegaste!', description: 'El pasajero ha sido notificado.' });
    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
    } finally { setIsProcessing(false); }
  };

  const handleTogglePause = async () => {
    if (!firebaseApp || isProcessing) return;
    setIsProcessing(true);
    const isCurrentlyPaused = ride.status === 'paused';
    const action = isCurrentlyPaused ? 'resume' : 'pause';

    try {
      const functions = getFunctions(undefined, 'us-central1');
      const togglePauseV1 = httpsCallable(functions, 'togglePauseV1');
      await togglePauseV1({ rideId: ride.id, action });
      toast({ title: isCurrentlyPaused ? 'Viaje reanudado' : 'Viaje en espera' });
    } catch (error: any) {
      console.error('Error al pausar/reanudar:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally { setIsProcessing(false); }
  };

  const handleCompleteRide = async () => {
    if (!firebaseApp || isProcessing) {
      if (!firebaseApp) toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para completar el viaje.' });
      return;
    }

    setIsProcessing(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const finishRideV1 = httpsCallable(functions, 'finishRideV1');
      await finishRideV1({ rideId: ride.id });
      toast({ title: '¡Viaje completado!', description: 'Procesando la liquidación final...' });
    } catch (error: any) {
      console.error('Error completando el viaje:', error);
      toast({
        variant: 'destructive',
        title: 'Error al finalizar el viaje',
        description: error.message || 'No se pudo marcar el viaje como completado.',
      });
    } finally { setIsProcessing(false); }
  };

  const handleCancelRide = async () => {
    if (!firebaseApp || !user || isProcessing) return;
    setIsProcessing(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
      await cancelRideV1({ rideId: ride.id, reason: 'cancelled_by_driver' });
      toast({ title: 'Viaje cancelado' });
    } catch (error: any) {
      console.error('Error calling cancelRideV1:', error);
      toast({ variant: 'destructive', title: 'Error al cancelar', description: error.message });
    } finally { setIsProcessing(false); }
  };

  const renderContent = () => {
    if (ride.status === 'completed') {
      return (
        <div className="fixed inset-0 z-[60] bg-background overflow-auto pointer-events-auto">
          <FinishedRideSummary
            ride={ride}
            userRole="driver"
            onClose={() => {
              window.location.href = '/driver/rides';
            }}
          />
        </div>
      );
    }

    const baseEstimated = ride.pricing?.estimated?.total ?? (ride.pricing as any)?.estimatedTotal ?? 0;
    const finalTotalWithWait = baseEstimated + waitCost;

    let PrimaryAction = null;
    let SecondaryAction = null;
    let title = '';

    switch (ride.status) {
      case 'driver_assigned':
        title = 'Yendo al origen';
        PrimaryAction = (
          <Button onClick={handleArrived} disabled={isProcessing} className="w-full h-16 rounded-2xl text-xl font-black bg-primary text-primary-foreground shadow-2xl" size="lg">
             LO TENGO: LLEGUÉ
          </Button>
        );
        SecondaryAction = (
          <Button
            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.origin.lat},${ride.origin.lng}`, '_blank')}
            className="w-full h-12 rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 font-bold"
            variant="outline"
          >
            <VamoIcon name="route" className="mr-2 h-4 w-4" /> NAVEGAR MAPS
          </Button>
        );
        break;

      case 'driver_arrived':
        title = 'Esperando al pasajero';
        PrimaryAction = (
          <Button onClick={handleStartRide} disabled={isProcessing} className="w-full h-16 rounded-2xl text-xl font-black bg-green-600 hover:bg-green-700 text-white shadow-[0_0_40px_rgba(22,163,74,0.3)]" size="lg">
             INICIAR VIAJE
          </Button>
        );
        break;

      case 'in_progress':
      case 'paused':
        const isPaused = ride.status === 'paused';
        title = isPaused ? 'Pausa activa' : 'Viaje en curso';
        PrimaryAction = (
          <Button 
              onClick={() => setIsPreviewOpen(true)} 
              disabled={isPaused || isProcessing} 
              className="w-full h-16 rounded-2xl text-xl font-black bg-primary text-primary-foreground shadow-2xl" 
              size="lg"
          >
              VIAJE FINALIZADO
          </Button>
        );
        SecondaryAction = (
          <div className="grid grid-cols-2 gap-3 mt-2">
              <Button onClick={handleTogglePause} disabled={isProcessing} className="h-14 rounded-2xl font-black text-xs uppercase bg-zinc-900 border border-white/5 text-zinc-400">
                  {isPaused ? 'REANUDAR' : 'PAUSAR'}
              </Button>
              <Button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.destination.lat},${ride.destination.lng}`, '_blank')} className="h-14 rounded-2xl font-black text-xs uppercase bg-zinc-900 border border-white/5 text-zinc-400">
                  NAVEGAR
              </Button>
          </div>
        );
        break;
        
      default:
        return null;
    }

    return (
      <main className="fixed inset-0 z-50 bg-background overflow-hidden">
        
        {/* MAP BACKGROUND */}
        {mapsAvailable && (
            <div className="absolute inset-0 z-0">
                <Map
                    defaultCenter={ride.origin}
                    defaultZoom={16}
                    gestureHandling="greedy"
                    disableDefaultUI={true}
                    clickableIcons={false}
                    mapId="active-driver-map"
                >
                    <RideMap 
                        status={ride.status}
                        origin={ride.origin}
                        destination={ride.destination}
                        driverLocation={null}
                        isExpanded={isExpanded}
                    />
                </Map>
            </div>
        )}

        {/* WAIT TIMER DIALOG (Bloque 3/6 Fix) */}
        <WaitTimerDialog
            isOpen={isWaitTimerOpen}
            onOpenChange={setIsWaitTimerOpen}
            waitMinutes={waitMinutes}
            waitCost={formatCurrency(waitCost)}
            currentTotal={formatCurrency(finalTotalWithWait)}
        />

        {/* TOP STATUS OVERLAY (MINIMAL) */}
        <div className="absolute top-6 inset-x-0 z-50 flex justify-center pointer-events-none">
            <div className={cn("glass-morphism premium-shadow rounded-full px-5 py-2 flex items-center gap-2 pointer-events-auto border", isFemale ? "bg-pink-900/40 border-pink-500/30" : "border-white/5 whitespace-nowrap")}>
                <div className={cn("w-2 h-2 rounded-full", title.includes('curso') ? 'bg-green-500 animate-pulse' : (isFemale ? 'bg-pink-500' : 'bg-primary'))} />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">{title}</span>
            </div>
        </div>

        {/* UNIFIED VAMO SHEET */}
        <VamoBottomSheet
          isOpen={true}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          minHeight="40vh"
          maxHeight="75vh"
        >
             <div className="flex flex-col animate-in fade-in duration-300">
                 {/* PASSENGER OVERVIEW */}
                 <div className={cn("flex items-center justify-between gap-3 p-4 rounded-[1.5rem] border mb-4", isFemale ? "bg-pink-900/20 border-pink-500/20" : "bg-zinc-900/40 border-white/5")}>
                     <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center border border-white/5 text-zinc-600">
                           <VamoIcon name="user" className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-white leading-none mb-1">{ride.passengerName || 'Pasajero'}</p>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight font-black">EN EL PUNTO DE ENCUENTRO</p>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        {isPanicButtonVisible(ride.status) && (
                            <PanicButton 
                                rideId={ride.id} 
                                role="driver" 
                                variant="minimal"
                                className="w-10 h-10 rounded-full bg-red-600/20 text-red-600 shadow-none border border-red-600/20" 
                            />
                        )}
                        <ChatTrigger 
                            ride={ride}
                            role="driver"
                            onClick={() => setIsChatOpen(true)}
                            className="w-10 h-10 rounded-full bg-zinc-900 border border-white/5 shadow-none"
                        />
                        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="rounded-full h-8 w-8 text-zinc-600 hover:text-white">
                            <VamoIcon name={isExpanded ? "chevron-down" : "chevron-up"} className="h-5 w-5" />
                        </Button>
                     </div>
                 </div>

                 {/* EXPANDABLE TRIP DATA */}
                 {isExpanded && (
                    <div className="space-y-4 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className={cn("rounded-2xl p-4 border", isFemale ? "bg-pink-900/10 border-pink-500/10" : "bg-zinc-900/30 border-border/50")}>
                            <TripCard status={ride.status} origin={ride.origin} destination={ride.destination} />
                        </div>
                        
                        <div className={cn("flex flex-col border rounded-2xl overflow-hidden", isFemale ? "bg-pink-900/30 border-pink-500/30" : "bg-zinc-900/50 border-border/60")}>
                            <div className="flex items-center justify-between p-4 px-5">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total a cobrar</span>
                                    <span className={cn("text-2xl font-black leading-none", isFemale ? "text-pink-500" : "text-primary")}>{formatCurrency(finalTotalWithWait)}</span>
                                </div>
                                <VamoIcon name="credit-card" className="h-6 w-6 text-zinc-700" />
                            </div>
                            
                            {hasWaitData && waitMinutes !== '00:00' && (
                                <div className="flex items-center justify-between px-5 py-3 bg-orange-500/10 border-t border-white/5">
                                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Espera: {waitMinutes} min</span>
                                    <span className="text-sm font-black text-orange-500">+{formatCurrency(waitCost)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                 )}
                 
                 {/* PRIMARY ACTIONS */}
                 <div className="flex flex-col gap-3">
                    {PrimaryAction}
                    {SecondaryAction}
                    
                    {/* CANCEL ACTION (SUBTLE) */}
                    {['driver_assigned', 'driver_arrived'].includes(ride.status) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className={cn("mt-2 text-[10px] font-black uppercase tracking-widest transition-colors", isFemale ? "text-pink-500/50 hover:text-pink-400" : "text-zinc-600 hover:text-white")}>Cancelar Viaje</button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2.5rem] p-8 bg-zinc-950 border-zinc-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-2xl font-black uppercase text-center text-white">¿Cancelar?</AlertDialogTitle>
                              <AlertDialogDescription className="text-center text-zinc-500 font-medium mt-2">Cancelar ahora afectará tu tasa de aceptación y nivel.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="flex flex-col gap-3 mt-8">
                              <Button variant="destructive" className="rounded-2xl h-14 font-black uppercase tracking-widest" onClick={handleCancelRide} disabled={isProcessing}>SÍ, CANCELAR</Button>
                              <AlertDialogCancel className="rounded-2xl h-12 bg-transparent border-none text-zinc-500 font-bold">VOLVER</AlertDialogCancel>
                            </div>
                          </AlertDialogContent>
                        </AlertDialog>
                    )}
                 </div>
             </div>

             {/* RIDE SUMMARY PREVIEW MODAL */}
             <AlertDialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <AlertDialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none bg-zinc-950 max-w-[95vw] md:max-w-[450px]">
                    <div className="p-8 pb-4">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-black text-center text-white uppercase tracking-tight">Resumen Final</AlertDialogTitle>
                            <AlertDialogDescription className="text-center text-zinc-500 uppercase text-[10px] font-black tracking-widest mt-2">
                                Cobro automático procesado
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                    </div>

                    <div className="px-8 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
                        {isLoadingPreview ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-4">
                                <VamoIcon name="loader" className={cn("h-10 w-10 animate-spin", isFemale ? "text-pink-500" : "text-primary")} />
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Calculando...</p>
                            </div>
                        ) : previewData ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className={cn("rounded-3xl p-6 border space-y-4", isFemale ? "bg-pink-900/20 border-pink-500/20" : "bg-zinc-900/80 border-white/5")}>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase">Tarifa Base</span>
                                        <span className="font-bold text-white">{formatCurrency(previewData.breakdown?.baseFare || 0)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-zinc-500 uppercase">Recorrido</span>
                                        <span className="font-bold text-white">{formatCurrency(previewData.breakdown?.distanceFare || 0)}</span>
                                    </div>
                                    
                                    {previewData.breakdown && previewData.breakdown.waitingFare > 0 && (
                                        <div className="flex justify-between items-center border-t border-white/5 pt-4">
                                            <span className="text-[10px] font-black text-orange-500 uppercase">Espera ({Math.floor((previewData.waitingSeconds || 0) / 60)} min)</span>
                                            <span className="font-bold text-orange-500">+{formatCurrency(previewData.breakdown.waitingFare)}</span>
                                        </div>
                                    )}

                                    <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                                        <span className="text-base font-black text-white uppercase">Total</span>
                                        <span className={cn("text-3xl font-black", isFemale ? "text-pink-500" : "text-primary")}>{formatCurrency(previewData.totalFare)}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 text-red-500 font-bold uppercase text-xs">Error al cargar resumen</div>
                        )}
                    </div>

                    <div className="p-8 pt-4 bg-zinc-900/30 flex flex-col gap-4">
                        <Button 
                            className={cn("w-full h-16 rounded-2xl text-xl font-black shadow-2xl transition-all active:scale-[0.98]", isFemale ? "bg-pink-600 hover:bg-pink-700 text-white" : "bg-primary text-primary-foreground")} 
                            onClick={handleCompleteRide} 
                            disabled={isProcessing || isLoadingPreview || !previewData}
                        >
                            {isProcessing ? <VamoIcon name="loader" className="animate-spin" /> : 'CONFIRMAR COBRO'}
                        </Button>
                        <AlertDialogCancel className="w-full h-12 rounded-2xl border-none bg-transparent text-zinc-500 font-black text-[10px] uppercase">
                            VOLVER AL VIAJE
                        </AlertDialogCancel>
                    </div>
                </AlertDialogContent>
             </AlertDialog>
        </VamoBottomSheet>

        {/* CHAT OVERLAY (VamO PRO v1.0) */}
        {isChatOpen && (
            <div className="fixed inset-0 z-[100] flex flex-col justify-end p-4 animate-in slide-in-from-bottom-5 duration-300">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsChatOpen(false)} />
                <div className="relative z-10 w-full max-w-lg mx-auto">
                    <ChatContainer 
                        ride={ride}
                        role="driver"
                        onClose={() => setIsChatOpen(false)}
                    />
                </div>
            </div>
        )}
      </main>
    );
  };

  return renderContent();
}
