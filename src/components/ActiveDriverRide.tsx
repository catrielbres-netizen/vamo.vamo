'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride, isPanicButtonVisible } from '@/lib/types';
import { PanicButton } from './PanicButton';
import { WithId } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import RideMap from './RideMap';
import { useMapsAvailability } from '@/components/MapsProvider';
import { TripCard } from './TripCard';
import { useWaitTimer } from '@/hooks/useWaitTimer';
import { VamoBottomSheet } from './VamoBottomSheet';
import { WaitTimerDialog } from './WaitTimerDialog';
import { cn } from '@/lib/utils';
import FinishedRideSummary from './FinishedRideSummary';
import { Sparkles } from 'lucide-react';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import { ChatContainer } from './Chat/ChatContainer';
import { SafetyToolkit } from './SafetyToolkit';
import SharedRideManager from './SharedRideManager';
import Logger from '@/lib/telemetry/logger';

export default function ActiveDriverRide({ 
  ride: activeRide,
  onClose
}: { 
  ride: WithId<Ride> | null | undefined,
  onClose?: () => void
}) {
  // --- 1. HOOKS DECLARATIONS (STRICT ORDER) ---
  const firestore = useFirestore();
  const { user, profile } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const router = useRouter();
  const { mapsAvailable } = useMapsAvailability();
  
  const [finalRide, setFinalRide] = useState<WithId<Ride> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isWaitTimerOpen, setIsWaitTimerOpen] = useState(false);

  const [isNavigating, setIsNavigating] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [lastEta, setLastEta] = useState<number | null>(null);
  const [hasClosedReceipt, setHasClosedReceipt] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // [VamO PRO] Force update when settlement data arrives
    if (activeRide?.status === 'completed' && !hasClosedReceipt) {
      const hasSettledData = !!activeRide.completedRide;
      const isStale = !finalRide || (!finalRide.completedRide && hasSettledData);
      
      if (isStale) {
        Logger.logInfo("[RECEIPT_SYNC] Settlement detected, updating state...");
        setFinalRide({ ...activeRide }); // Spread to force new identity
      }
    }
  }, [activeRide, finalRide, hasClosedReceipt]);

  // Combined state reference
  const ride = finalRide || activeRide;

  // [DIAGNOSTIC] Chat State Tracking
  useEffect(() => {
    Logger.logDebug("[CHAT_STATE]", { isChatOpen, rideId: ride?.id });
  }, [isChatOpen, ride?.id]);

  const { waitMinutes, waitCost, hasWaitData, isCurrentlyWaiting, waitChargeApplied, isEarlyArrival } = useWaitTimer(ride);
  const scheduledTimeStr = ride?.scheduledAt ? (ride.scheduledAt as Timestamp).toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

  useEffect(() => {
    if (ride) {
      Logger.logInfo(`[ACTIVE_RIDE_AUDIT] status=${ride.status} rideId=${ride.id}`);
    }
  }, [ride?.id, ride?.status]);

  useEffect(() => {
    setIsWaitTimerOpen(isCurrentlyWaiting);
    if (isCurrentlyWaiting) {
      setIsChatOpen(false);
    }
  }, [isCurrentlyWaiting]);

  useEffect(() => {
    const handleFocus = () => Logger.logDebug("[NAV_DEBUG] Driver returned");
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const pricing = useMemo(() => {
    // [VamO PRO] Unified Financial Snapshot
    const financial = getRideFinancialSnapshot(ride);

    return { 
        total: financial.totalFare, 
        wallet: financial.walletCoveredAmount, 
        cash: financial.cashToCollect,
        subsidy: financial.vamoSubsidyAmount
    };
  }, [ride]);

  useEffect(() => {
    if (!activeRide || activeRide.status !== 'driver_assigned' || !activeRide.id || !firestore) return;

    const updateETA = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const lat1 = pos.coords.latitude;
          const lon1 = pos.coords.longitude;
          const lat2 = activeRide.origin.lat;
          const lon2 = activeRide.origin.lng;
          
          const R = 6371; 
          const toRad = (n: number) => n * Math.PI / 180;
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lon2 - lon1);
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          const newEta = Math.max(1, Math.ceil((distance / 30) * 60)); 
          
          if (lastEta === newEta) return;
          setLastEta(newEta);

          await updateDoc(doc(firestore, 'rides', activeRide.id), {
            etaMinutes: newEta,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          Logger.logError("ETA Update failed:", e);
        }
      });
    };

    updateETA();
    const interval = setInterval(updateETA, 45000);
    return () => clearInterval(interval);
  }, [activeRide?.status, activeRide?.id, firestore, lastEta]);

  // --- 2. HANDLERS ---
  const handleOpenMaps = (lat: number, lng: number) => {
    setIsNavigating(true);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  const handleStartRide = async () => {
    if (!firebaseApp || isProcessing || !ride) return;
    setIsProcessing(true);
    Logger.trackRideEvent('ride_start_attempt', { rideId: ride.id });
    try {
      const startRideV1 = httpsCallable(getFunctions(undefined, 'us-central1'), 'startRideV1');
      await startRideV1({ rideId: ride.id });
      Logger.trackRideEvent('ride_start_success', { rideId: ride.id });
      toast({ title: '¡Viaje iniciado!' });
    } catch (e: any) {
      Logger.logError('Error starting ride:', e);
      Logger.trackRideEvent('ride_start_error', { rideId: ride.id, error: e.message });
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setIsProcessing(false); }
  };

  const handleArrived = async () => {
    if (!firebaseApp || isProcessing || !ride) return;
    setIsProcessing(true);
    try {
      const driverArrived = httpsCallable(getFunctions(undefined, 'us-central1'), 'driverArrivedV1');
      await driverArrived({ rideId: ride.id });
    } catch (e: any) {
      Logger.logError('Error driver arrived:', e);
      toast({ variant: 'destructive', title: 'Error' });
    } finally { setIsProcessing(false); }
  };

  const handleTogglePause = async () => {
    if (!firebaseApp || isProcessing || !ride) return;
    
    // [VamO PRO] Safety Guard: only toggle if in valid states
    if (ride.status !== 'in_progress' && ride.status !== 'paused') {
      Logger.logWarn("[PAUSE_GUARD] Cannot toggle pause in status:", ride.status);
      return;
    }

    setIsProcessing(true);
    try {
      const togglePauseV1 = httpsCallable(getFunctions(undefined, 'us-central1'), 'togglePauseV1');
      await togglePauseV1({ rideId: ride.id, action: ride.status === 'paused' ? 'resume' : 'pause' });
    } catch (e: any) {
      Logger.logError('Error toggling pause:', e);
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setIsProcessing(false); }
  };

  const handleCompleteRide = async () => {
    if (!firebaseApp || isProcessing || !ride) return;
    setIsProcessing(true);
    Logger.trackRideEvent('ride_finish_attempt', { rideId: ride.id });
    try {
      const finishRideV1 = httpsCallable(getFunctions(undefined, 'us-central1'), 'finishRideV1');
      await finishRideV1({ rideId: ride.id });
      Logger.trackRideEvent('ride_finish_success', { rideId: ride.id });
    } catch (e: any) {
      Logger.logError('Error completing ride:', e);
      Logger.trackRideEvent('ride_finish_error', { rideId: ride.id, error: e.message });
      toast({ variant: 'destructive', title: 'Error' });
    } finally { setIsProcessing(false); }
  };

  // Removed handlePanic in favor of PanicButton component to avoid name mismatch

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
  };

  if (!isMounted || !ride) return null;

  if (ride.rideType === 'shared' || (ride as any).isSharedRide === true) {
    return (
      <SharedRideManager 
        ride={ride as WithId<Ride>} 
        onClose={() => {
            if (onClose) onClose();
            router.replace('/driver/rides');
        }} 
      />
    );
  }

  return (
    <>
      {finalRide ? (
        <FinishedRideSummary 
          ride={finalRide} 
          userRole="driver"
          onClose={() => {
            setHasClosedReceipt(true);
            setFinalRide(null);
            if (onClose) onClose();
            router.replace('/driver/rides');
          }}
        />
      ) : (
        <div className="flex flex-col min-h-screen bg-transparent relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <RideMap 
              status={ride.status}
              origin={ride.origin}
              destination={ride.destination}
              driverLocation={undefined}
              isExpanded={isExpanded}
            />
          </div>

          <div className="absolute top-6 inset-x-0 z-50 flex justify-center pointer-events-none">
              <div className="bg-zinc-900/90 backdrop-blur-md border border-white/10 px-6 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-700 pointer-events-auto">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Viaje en Curso</p>
              </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 p-6 pb-12 animate-in slide-in-from-bottom-6 duration-700 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            <div className="max-w-md mx-auto space-y-4">
                <TripCard 
                    status={ride.status}
                    origin={ride.origin}
                    destination={ride.destination}
                />

                <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 flex flex-col gap-3 shadow-2xl">
                    <div className="flex justify-between items-center text-xs px-1">
                        <span className="font-bold text-white/40 uppercase tracking-tight">Tarifa del viaje</span>
                        <span className="font-black text-white/80">{formatCurrency(pricing.total)}</span>
                    </div>

                    {pricing.wallet > 0 && (
                        <div className="flex justify-between items-center text-xs px-1 text-emerald-400">
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-tight">
                                <Sparkles className="w-3 h-3" />
                                <span>VamO Pay aplicado</span>
                            </div>
                            <span className="font-black">-{formatCurrency(pricing.wallet)}</span>
                        </div>
                    )}

                    {pricing.subsidy > 0 && (
                        <div className="flex justify-between items-center text-xs px-1 text-amber-500">
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-tight">
                                <Sparkles className="w-3 h-3" />
                                <span>Subsidio VamO (Beneficio)</span>
                            </div>
                            <span className="font-black">-{formatCurrency(pricing.subsidy)}</span>
                        </div>
                    )}

                    {waitCost > 0 && (
                        <div className="flex justify-between items-center text-xs px-1 text-orange-400">
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-tight">
                                <VamoIcon name="clock" className="w-3 h-3" />
                                <span>Espera acumulada ({waitMinutes}m)</span>
                            </div>
                            <span className="font-black">+{formatCurrency(waitCost)}</span>
                        </div>
                    )}

                    <div className="h-px bg-white/5 my-1" />

                    <div className="flex justify-between items-center p-4 rounded-2xl bg-zinc-800 shadow-inner border border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.15em] leading-none mb-1">Cobrás en efectivo</span>
                            {pricing.wallet > 0 && (
                                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-tighter italic">VamO Pay Sincronizado</span>
                            )}
                        </div>
                        <span className="text-4xl font-black text-white tracking-tighter leading-none italic">
                            {formatCurrency(pricing.cash + waitChargeApplied)}
                        </span>
                    </div>

                    {/* ACTIONS */}
                    <div className="grid grid-cols-4 gap-2 pt-2">
                        <Button 
                            onClick={() => handleOpenMaps(ride.status === 'driver_assigned' ? ride.origin.lat : ride.destination.lat, ride.status === 'driver_assigned' ? ride.origin.lng : ride.destination.lng)}
                            className="h-16 rounded-[2.5rem] bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                        >
                            <VamoIcon name="navigation" className="w-6 h-6" />
                        </Button>
                        <Button 
                            onClick={ride.status === 'driver_assigned' ? handleArrived : (ride.status === 'driver_arrived' ? handleStartRide : handleCompleteRide)}
                            disabled={isProcessing}
                            className={cn(
                                "col-span-2 h-16 rounded-[2.5rem] text-sm font-black uppercase tracking-widest transition-all shadow-xl active:scale-[0.98]",
                                ride.status === 'driver_assigned' ? 'bg-amber-500 hover:bg-amber-400' : 
                                (ride.status === 'driver_arrived' ? 'bg-primary hover:bg-primary/90' : 'bg-emerald-600 hover:bg-emerald-500')
                            )}
                        >
                            {isProcessing ? <VamoIcon name="loader" className="animate-spin w-5 h-5" /> : 
                             (ride.status === 'driver_assigned' ? 'LLEGUÉ' : (ride.status === 'driver_arrived' ? 'INICIAR' : 'TERMINAR'))}
                        </Button>
                        <Button 
                            onClick={() => setIsChatOpen(true)}
                            className={cn(
                                "h-16 rounded-[2.5rem] bg-zinc-800 text-white relative",
                                (ride?.chatSummary?.unreadCountDriver || 0) > 0 && "ring-2 ring-primary animate-pulse"
                            )}
                        >
                            <VamoIcon name="message-square" className="w-6 h-6" />
                            {(ride?.chatSummary?.unreadCountDriver || 0) > 0 && (
                                <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-black px-2 py-0.5 rounded-full border-4 border-zinc-900 shadow-xl">
                                    {ride?.chatSummary?.unreadCountDriver}
                                </div>
                            )}
                        </Button>
                    </div>

                    {/* AUXILIARY ACTIONS (WAIT TIMER - Only for Mid-trip) */}
                    {(ride.status === 'in_progress' || ride.status === 'paused') && (
                        <Button 
                            onClick={handleTogglePause}
                            disabled={isProcessing}
                            className={cn(
                                "w-full h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-3",
                                ride.status === 'paused' 
                                    ? "bg-amber-500 text-black border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]" 
                                    : "bg-zinc-800/50 text-white/60 border border-white/5 hover:text-white"
                            )}
                        >
                            <VamoIcon name="clock" className={cn("w-5 h-5", ride.status === 'paused' && "animate-pulse")} />
                            <span>{ride.status === 'paused' ? 'REANUDAR VIAJE' : 'PONER EN ESPERA'}</span>
                        </Button>
                    )}
                </div>

                <SafetyToolkit ride={ride as WithId<Ride>} role="driver" />

                {isPanicButtonVisible(ride.status) && <PanicButton rideId={ride.id} role="driver" />}
            </div>
          </div>
        </div>
      )}

      {/* VamO PRO: Real-time Chat Overlay (Replaces legacy BottomSheet Branch) */}
      {isChatOpen && (
        <div className="fixed inset-0 z-[150] flex flex-col justify-end p-4 animate-in fade-in duration-300">
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setIsChatOpen(false)} 
            />
            <div className="relative z-10 w-full max-w-lg mx-auto h-[75vh] flex flex-col">
                {ride?.id ? (
                  <ChatContainer 
                    ride={ride as WithId<Ride>} 
                    role="driver" 
                    onClose={() => setIsChatOpen(false)} 
                  />
                ) : (
                   <div className="bg-zinc-900 p-10 rounded-[2.5rem] text-center border border-white/10 shadow-2xl">
                      <VamoIcon name="alert-triangle" className="w-10 h-10 text-amber-500 mx-auto mb-4" />
                      <p className="text-white font-black uppercase tracking-widest text-[10px]">Error: Ride ID Missing</p>
                      <Button 
                        variant="ghost" 
                        onClick={() => setIsChatOpen(false)}
                        className="mt-4 text-zinc-500 hover:text-white uppercase text-[9px] font-bold"
                      >
                        Cerrar
                      </Button>
                   </div>
                )}
            </div>
        </div>
      )}

      <WaitTimerDialog 
        isOpen={isWaitTimerOpen} 
        onOpenChange={setIsWaitTimerOpen}
        waitMinutes={waitMinutes} 
        waitCost={formatCurrency(waitCost)}
        currentTotal={formatCurrency(pricing.cash + waitChargeApplied)}
        isEarlyArrival={isEarlyArrival}
        scheduledTime={scheduledTimeStr}
      />
    </>
  );
}
