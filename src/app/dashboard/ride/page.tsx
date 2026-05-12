'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useQuery } from '@tanstack/react-query';
import { doc, updateDoc } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { PassengerSearchingSheet } from "@/components/PassengerSearchingSheet";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Button } from '@/components/ui/button';
import MapSelector from '@/components/MapSelector';
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { RideReceipt } from '@/components/RideReceipt';
import { useMapsAvailability } from '@/components/MapsProvider';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { ACTIVE_RIDE_STATES } from '@/lib/ride-status';
import { resolveCity } from '@/lib/city-resolution';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import PlaceAutocompleteInput from '@/components/PlaceAutocompleteInput';
import { canPassengerRequestRide } from '@/lib/eligibility';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Ride, Place, ServiceType, Promotion } from '@/lib/types';
import { OnlineDriversLayer } from '@/components/OnlineDriversLayer';
import { ShieldCheck, Scale, Map as MapIcon, Flag, Crosshair, Gift, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePromotions } from '@/hooks/usePromotions';
import { PassengerSmallBalance } from '@/components/PassengerSmallBalance';
import { useTelemetry } from '@/lib/telemetry';
import { PassengerDashboardSkeleton } from '@/components/skeletons/PassengerDashboardSkeleton';

function RidePageContent() {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { user, profile, loading: userIsLoading, error: userError } = useUser();
  const telemetry = useTelemetry();
  const [isLoaded, setIsLoaded] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!userIsLoading && profile) {
      if (profile.registrationStatus !== 'active') {
        console.warn("[RIDE_PAGE_GUARD] Unauthorized access to dashboard. Redirecting to onboarding...");
        router.replace('/dashboard/complete-profile');
        return;
      }
      console.log("[RIDE_PAGE_ALLOW_DASHBOARD] Profile active. Rendering ride map.");
      setIsLoaded(true);
    } else if (!userIsLoading && !profile) {
        console.warn("[RIDE_PAGE_BLOCK_DASHBOARD] No profile found. Redirecting...");
        router.replace('/login');
    }
  }, [userIsLoading, profile, router]);
  
  const { mapsAvailable } = useMapsAvailability();
  const geocodingLib = useMapsLibrary('geocoding');

  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>('professional');
  const [dynamicSnapshot, setDynamicSnapshot] = useState<any>(null);
  const [isMapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [preferredDriverGender, setPreferredDriverGender] = useState<'male' | 'female' | null>(null);
  const [mapEditingField, setMapEditingField] = useState<'origin' | 'destination' | null>(null);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isCalculatingFare, setIsCalculatingFare] = useState(false);
  const [isLocalResetting, setIsLocalResetting] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'expanded'>('collapsed');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [isLegalInfoOpen, setIsLegalInfoOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<number | null>(null);
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const fareRequestId = useRef<number>(0);

  const { promotions: ridePromos, bestPromo, isLoading: isPromosLoading } = usePromotions('ride');
  
  const eligibility = useMemo(() => {
    if (!profile) return { isEligible: true };
    return canPassengerRequestRide(profile, user?.emailVerified);
  }, [profile, user?.emailVerified]);

  useEffect(() => {
    if (bestPromo && !selectedPromoId) {
        setSelectedPromoId(bestPromo.id!);
    }
  }, [bestPromo, selectedPromoId]);

  useEffect(() => {
    if (geocodingLib) {
      setGeocoder(new geocodingLib.Geocoder());
    }
  }, [geocodingLib]);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Geolocalización no soportada' });
      return;
    }
    if (!geocoder) {
      toast({ variant: 'destructive', title: 'Servicio no disponible' });
      return;
    }

    setIsGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, async (results, status) => {
          if (status === 'OK' && results?.[0]) {
            const result = results[0];
            const address = result.formatted_address.split(',')[0];
            const resolution = await resolveCity(latitude, longitude, result.address_components, geocoder);

            setOrigin({ 
                address, 
                lat: latitude, 
                lng: longitude,
                city: resolution.city
            });
            toast({ title: 'Ubicación establecida' });
          }
          setIsGeocoding(false);
        });
      },
      () => {
        toast({ variant: 'destructive', title: 'Error de ubicación' });
        setIsGeocoding(false);
      }
    );
  }, [geocoder, toast]);

  const [localRideId, setLocalRideId] = useState<string | null>(null);
  const [pendingRideRequest, setPendingRideRequest] = useState(false);
  const [watchedRideId, setWatchedRideId] = useState<string | null>(null);
  const [completedRideId, setCompletedRideId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.activeRideId) {
      setWatchedRideId(profile.activeRideId);
      setCompletedRideId(null); // Reset if new active ride
    }
  }, [profile?.activeRideId]);

  const activeRideRef = useMemoFirebase(() => {
    const targetId = watchedRideId || completedRideId;
    if (!firestore || !targetId) return null;
    return doc(firestore, 'rides', targetId);
  }, [firestore, watchedRideId, completedRideId]);

  const { data: ride } = useDoc<Ride>(activeRideRef);

  useEffect(() => {
    if (ride?.status === 'completed' && watchedRideId) {
        setCompletedRideId(watchedRideId);
        setWatchedRideId(null);
    }
  }, [ride?.status, watchedRideId]);

  const localRideRef = useMemoFirebase(() => {
    if (!firestore || !localRideId || watchedRideId === localRideId) return null;
    return doc(firestore, 'rides', localRideId);
  }, [firestore, localRideId, watchedRideId]);

  const { data: localRide } = useDoc<Ride>(localRideRef);

  const effectiveRide = ride || localRide;
  const hasActiveRide = !!(watchedRideId || localRideId || pendingRideRequest || completedRideId);

  useEffect(() => {
    if (profile?.activeRideId && (localRideId === profile.activeRideId || pendingRideRequest)) {
       setLocalRideId(null);
       setPendingRideRequest(false);
       setIsLocalResetting(false);
    }
  }, [profile?.activeRideId, localRideId, pendingRideRequest]);

  const getRidePayload = async (isDryRun: boolean) => {
      if (!origin || !destination) throw new Error("Faltan campos");
      return {
          origin,
          destination,
          serviceType,
          promotionId: selectedPromoId,
          paymentMethod,
          ...(isDryRun ? {} : { preferredDriverGender, scheduledAt }),
          dryRun: isDryRun
      };
  };

  useEffect(() => {
    if (!destination || !origin || !firebaseApp) {
        setEstimatedPrice(null);
        return;
    }
    const currentReqId = ++fareRequestId.current;
    const calculateFare = async () => {
        setIsCalculatingFare(true);
        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const createRideFunc = httpsCallable(functions, 'createRideV1'); 
            const payload = await getRidePayload(true);
            const result = await createRideFunc(payload);
            if (fareRequestId.current !== currentReqId) return;
            const data = result.data as any;
            if (data?.estimatedTotal) setEstimatedPrice(data.estimatedTotal);
            if (data?.dynamic) setDynamicSnapshot(data.dynamic);
            else setDynamicSnapshot(null);
        } catch (e) {
            console.error(e);
            setDynamicSnapshot(null);
        } finally {
            if (fareRequestId.current === currentReqId) setIsCalculatingFare(false);
        }
    }
    const timerId = setTimeout(calculateFare, 500);
    return () => clearTimeout(timerId);
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, serviceType, selectedPromoId, firebaseApp]);

  const handleRequestRide = async () => {
    if (isRequesting || !firebaseApp || !user || !profile || !origin || !destination) return;
    const eligibility = canPassengerRequestRide(profile, user.emailVerified);
    if (!eligibility.isEligible) {
        toast({ variant: 'destructive', title: 'Error', description: eligibility.reason });
        return;
    }
    setIsRequesting(true);
    setPendingRideRequest(true);

    telemetry.trackEvent({
        type: 'ride_lifecycle',
        eventName: 'ride_request_initiated',
        metadata: { origin, destination, serviceType, paymentMethod, scheduledAt }
    });

    try {
        const functions = getFunctions(undefined, 'us-central1');
        const createRide = httpsCallable(functions, 'createRideV1');
        const payload = await getRidePayload(false);
        const result = await createRide({ ...payload, clientRequestId: Math.random().toString(36) });
        const data = result.data as any;
        if (data.success && data.rideId) {
            setLocalRideId(data.rideId);
            setPendingRideRequest(false);
            telemetry.trackRideLifecycle(data.rideId, 'request_success', { serviceType });
        }
    } catch (error: any) {
      setLocalRideId(null);
      setPendingRideRequest(false);
      telemetry.trackError('ride_request_failed', error, { origin, destination });
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally { 
        setIsRequesting(false); 
    }
  };

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'automatic'>('automatic');

  // [VamO PRO] Express Benefit Unlock Logic
  const ridesCompleted = profile?.passengerProgress?.ridesThisWeek || 0;
  const isExpressUnlocked = ridesCompleted >= 5 || profile?.role === 'admin';

  // [AUDIT] Safety check: if Express is selected but now blocked (e.g. week reset), fallback to professional
  useEffect(() => {
    if (serviceType === 'express' && !isExpressUnlocked) {
        setServiceType('professional');
    }
  }, [isExpressUnlocked, serviceType]);

  const { data: walletResp } = useQuery({
      queryKey: ['wallet', user?.uid],
      queryFn: async () => {
          if (!firebaseApp) return null;
          const getWallet = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'getMyWalletV1');
          const res = await getWallet();
          return (res.data as any);
      },
      enabled: !!user && !!firebaseApp
  });
  const wallet = walletResp?.wallet;
  
  const savingsSimulation = useMemo(() => {
     if (!estimatedPrice) return null;
     const available = (wallet?.cashBalance || 0) + (wallet?.promoBalance || 0);
     const walletUsed = paymentMethod === 'cash' ? 0 : Math.min(available, estimatedPrice);
     return { benefit: walletUsed, final: estimatedPrice - walletUsed };
  }, [estimatedPrice, wallet, paymentMethod]);

  const [isCancelling, setIsCancelling] = useState(false);

  const handleReset = useCallback(async () => { 
      setOrigin(null);
      setDestination(null); 
      setEstimatedPrice(null);
      setDynamicSnapshot(null);
      setLocalRideId(null);
      setPendingRideRequest(false);
      setIsCancelling(false);
      setWatchedRideId(null);
      setCompletedRideId(null);

      // [VamO PRO] Proactive Firestore Cleanup to avoid hangs
      if (user && firestore && profile?.activeRideId) {
          try {
              const userRef = doc(firestore, 'users', user.uid);
              await updateDoc(userRef, { activeRideId: null });
              console.log("[CLEANUP] activeRideId cleared in Firestore.");
          } catch (e) {
              console.error("[CLEANUP] Failed to clear activeRideId:", e);
          }
      }
  }, [user, firestore, profile?.activeRideId]);

  const handleOpenMapSelector = (field: 'origin' | 'destination') => {
      setMapEditingField(field);
      setMapSelectorOpen(true);
  };

  const handleMapSelect = (place: Place) => {
      if (mapEditingField === 'origin') setOrigin(place);
      else setDestination(place);
      setMapSelectorOpen(false);
  };

  const handleCancelSearching = async () => {
    const rideId = effectiveRide?.id;
    if (rideId && firebaseApp) {
      try {
        setIsCancelling(true);
        const functions = getFunctions(firebaseApp, 'us-central1');
        const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
        await cancelRideV1({ rideId, reason: 'cancelled_by_passenger' });
        telemetry.trackRideLifecycle(rideId, 'cancelled_by_passenger');
        handleReset();
      } catch (e) {
          telemetry.trackError('ride_cancel_failed', e, { rideId });
      } finally { setIsCancelling(false); }
    } else { 
        telemetry.trackEvent({ type: 'ride_lifecycle', eventName: 'ride_reset_without_id' });
        handleReset(); 
    }
  };

  useEffect(() => {
    if (origin && destination) setSheetState('expanded');
  }, [origin, destination]);

  useEffect(() => {
    if (effectiveRide && effectiveRide.status !== 'searching' && effectiveRide.status !== 'completed') {
      setSheetState('expanded');
    }
  }, [effectiveRide?.status]);

  if (userError) return <div className="p-4">Error: {userError.message}</div>;
  if (!isLoaded || !profile) {
    return <PassengerDashboardSkeleton />;
  }

  const isSearching = hasActiveRide && (!effectiveRide || effectiveRide.status === 'searching' || effectiveRide.status === 'scheduled');
  const showRideStatus = hasActiveRide && !isSearching && !!effectiveRide;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0a0a] animate-in fade-in duration-1000 fill-mode-both">
      {mapsAvailable && (
        <div 
          className="absolute inset-0 z-0" 
          onClick={() => !isSearching && setSheetState('collapsed')}
          style={{ display: showRideStatus ? 'none' : 'block' }}
        >
          <Map
            defaultCenter={{ lat: origin?.lat || -43.3002, lng: origin?.lng || -65.1023 }}
            defaultZoom={15}
            disableDefaultUI={true}
            gestureHandling="greedy"
            mapId="passenger-unified-map"
            colorScheme="DARK"
          >
            {origin && (
              <AdvancedMarker position={origin}>
                <div className="rounded-full p-2.5 border-2 border-white bg-indigo-500">
                  <VamoIcon name="map-pin" className="h-4 w-4 text-white" />
                </div>
              </AdvancedMarker>
            )}
            {destination && (
              <AdvancedMarker position={destination}>
                <div className="rounded-full p-2.5 border-2 border-white/30 bg-zinc-900">
                  <VamoIcon name="flag" className="h-4 w-4 text-white" />
                </div>
              </AdvancedMarker>
            )}
            <OnlineDriversLayer 
                origin={origin || effectiveRide?.origin || null} 
                currentOfferedDriverId={effectiveRide?.currentOfferedDriverId} 
                notifiedDrivers={effectiveRide?.notifiedDrivers || []}
                isSearching={isSearching} 
            />
          </Map>
        </div>
      )}

      {!hasActiveRide && (
        <div 
          className="relative z-10 flex flex-col h-full w-full p-4 pointer-events-none"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}
        >
            {/* FLOATING TOP SECTION */}
            <div 
              className="absolute inset-x-0 z-20 pointer-events-none flex flex-col gap-3 px-4 pt-4 pb-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
              style={{ top: 'env(safe-area-inset-top, 0px)' }}
            >
                <div className="flex items-center justify-between pointer-events-auto">
                    <PassengerSmallBalance />
                </div>
                
                {/* BLOQUE A: INPUTS PULIDOS AL INICIO DE TODO */}
                <div className="flex flex-col gap-2 mt-2 pointer-events-auto bg-[#1a1a1a] p-4 rounded-3xl border border-white/10 shadow-2xl">
                    <div className="relative bg-white/5 border border-white/10 rounded-2xl transition-all focus-within:border-indigo-500/50">
                        <PlaceAutocompleteInput 
                            onPlaceSelect={setOrigin} 
                            defaultValue={origin?.address || ''} 
                            placeholder="Punto de partida" 
                            iconName="map-pin" 
                            iconClassName="text-indigo-400"
                        />
                        <button 
                            onClick={() => handleOpenMapSelector('origin')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/30 hover:text-white/80 transition-colors"
                        >
                            <VamoIcon name="map" className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="relative bg-white/5 border border-white/10 rounded-2xl transition-all focus-within:border-indigo-500/50">
                        <PlaceAutocompleteInput 
                            onPlaceSelect={setDestination} 
                            defaultValue={destination?.address || ''} 
                            placeholder="¿A dónde vas?" 
                            iconName="flag" 
                            iconClassName="text-emerald-400"
                        />
                        <button 
                            onClick={() => handleOpenMapSelector('destination')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/30 hover:text-white/80 transition-colors"
                        >
                            <VamoIcon name="map" className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <button
                onClick={handleUseCurrentLocation}
                disabled={isGeocoding}
                className="absolute right-4 z-20 w-12 h-12 rounded-full bg-[#1a1a1a] border border-white/10 shadow-xl flex items-center justify-center pointer-events-auto text-white/80 hover:text-white transition-colors"
                style={{ top: 'calc(env(safe-area-inset-top, 16px) + 210px)' }}
            >
                {isGeocoding ? <VamoIcon name="loader" className="animate-spin h-5 w-5" /> : <VamoIcon name="crosshair" className="h-5 w-5" />}
            </button>

            {sheetState === 'expanded' && (
              <div className="mt-auto pointer-events-auto bg-[#1a1a1a] border border-white/10 rounded-t-3xl p-5 pb-8 flex flex-col gap-4 text-white animate-in slide-in-from-bottom-5 duration-300 shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.5)]">
                 <h1 className="text-base font-bold text-white/90 px-1 italic uppercase tracking-wider">Detalles del Viaje</h1>
                 
                 {/* BLOQUE: SELECTOR DE SERVICIO (VamO PRO) */}
                 <div className={cn(
                      "grid gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl",
                      isExpressUnlocked ? "grid-cols-2" : "grid-cols-1"
                  )}>
                    <button 
                        onClick={() => setServiceType('professional')} 
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-xl transition-all border",
                            serviceType === 'professional' 
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" 
                                : "bg-transparent border-transparent text-white/40 hover:text-white/60"
                        )}
                    >
                        <VamoIcon name="award" className={cn("w-5 h-5 mb-1", serviceType === 'professional' ? "text-white" : "text-zinc-600")} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Profesional</span>
                        <span className="text-[8px] font-bold opacity-60 mt-1">Taxi / Remis</span>
                    </button>
                    
                    {isExpressUnlocked && (
                        <button 
                            onClick={() => setServiceType('express')} 
                            className={cn(
                                "flex flex-col items-center justify-center py-3 rounded-xl transition-all border",
                                serviceType === 'express' 
                                    ? "bg-amber-600 border-amber-500 text-white shadow-lg" 
                                    : "bg-transparent border-transparent text-white/40 hover:text-white/60"
                            )}
                        >
                            <VamoIcon name="zap" className={cn("w-5 h-5 mb-1", serviceType === 'express' ? "text-white" : "text-zinc-600")} />
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">Express</span>
                            <span className="text-[8px] font-bold opacity-60 mt-1">Beneficio Desbloqueado</span>
                        </button>
                    )}
                 </div>

                 {!isExpressUnlocked && (
                     <div className="px-2 py-3 bg-zinc-900/50 rounded-2xl border border-dashed border-white/5 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                             <VamoIcon name="lock" className="w-3.5 h-3.5 text-zinc-600" />
                         </div>
                         <div className="flex-1">
                             <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Beneficios Express</p>
                             <p className="text-[10px] text-zinc-600 italic">Completá {5 - ridesCompleted} viajes esta semana para desbloquear descuentos.</p>
                         </div>
                     </div>
                 )}

                 {/* BLOQUE B: SELECTOR DE PAGO SOBRIO */}
                    <div className="flex gap-1.5 p-1.5 bg-white/5 border border-white/5 rounded-2xl">
                        <button onClick={() => setPaymentMethod('cash')} className={cn("flex-1 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-tight", paymentMethod === 'cash' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/70')}>Efectivo</button>
                        <button onClick={() => setPaymentMethod('wallet')} className={cn("flex-1 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-tight", paymentMethod === 'wallet' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/70')}>Billetera</button>
                        <button onClick={() => setPaymentMethod('automatic')} className={cn("flex-1 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-tight", paymentMethod === 'automatic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/70')}>Auto</button>
                    </div>

                     {/* BLOQUE C: DESGLOSE COMPLETO VamO (ESTÁNDAR UNIFICADO) */}
                     {savingsSimulation && (
                       <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3 shadow-inner">
                          {/* DYNAMIC PRICING BREAKDOWN */}
                          {dynamicSnapshot?.applied ? (
                             <>
                                <div className="flex items-center gap-2 mb-1">
                                   <div className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                                       <Sparkles className="w-2.5 h-2.5" />
                                       <span className="text-[8px] font-black uppercase tracking-widest leading-none">Tarifa Dinámica VamO</span>
                                   </div>
                                </div>
                                <div className="flex justify-between items-center text-xs px-1">
                                    <span className="font-bold text-white/40 uppercase tracking-tight">Tarifa municipal</span>
                                    <span className="font-black text-white/60">${dynamicSnapshot.municipalBaseFare}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs px-1">
                                    <div className="flex items-center gap-1.5 font-bold text-indigo-400 uppercase tracking-tight">
                                        <span>Descuento VamO</span>
                                    </div>
                                    <span className="font-black text-indigo-400">-${dynamicSnapshot.appliedDiscountAmount}</span>
                                </div>
                             </>
                          ) : (
                             <div className="flex justify-between items-center text-xs px-1">
                                 <span className="font-bold text-white/40 uppercase tracking-tight">Tarifa estimada</span>
                                 <span className="font-black text-white/80">${estimatedPrice}</span>
                             </div>
                          )}
  
                          {/* FILA 2: VamO Pay aplicado (Saldo Billetera) */}
                          {savingsSimulation.benefit > 0 && (
                             <div className="flex justify-between items-center text-xs px-1">
                                 <div className="flex items-center gap-1.5 font-bold text-emerald-400 uppercase tracking-tight">
                                     <ShieldCheck className="w-3 h-3" />
                                     <span>Saldo Billetera</span>
                                 </div>
                                 <span className="font-black text-emerald-400">-${savingsSimulation.benefit}</span>
                             </div>
                          )}
  
                          <div className="h-px bg-white/5 my-1" />
  
                          {/* FILA 3: TOTAL EN EFECTIVO (DESTACADA) */}
                          <div className="flex flex-col gap-2">
                             <div className="flex justify-between items-center bg-zinc-900 shadow-inner p-4 rounded-xl border border-white/10">
                                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest italic">Total final</span>
                                <div className="flex flex-col items-end">
                                    {savingsSimulation.final === 0 ? (
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-3xl font-black text-emerald-400 italic tracking-tighter leading-none">$0</span>
                                            <div className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1 animate-pulse">
                                                <ShieldCheck className="w-2.5 h-2.5" />
                                                <span className="text-[8px] font-black uppercase tracking-widest">Pagado 100% con VamO Pay</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-3xl font-black text-white tracking-tighter leading-none italic">
                                            ${savingsSimulation.final}
                                        </span>
                                    )}
                                </div>
                             </div>
                             
                             {dynamicSnapshot?.applied && (
                                <div className="px-1 space-y-1">
                                   <p className="text-[9px] text-zinc-500 italic leading-tight">
                                      Precio promocional dentro del rango autorizado. La tarifa municipal es el máximo oficial.
                                   </p>
                                   <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-tight">
                                      Este precio queda congelado al confirmar el viaje.
                                   </p>
                                </div>
                             )}
                          </div>
                       </div>
                     )}

                    {/* BLOQUE D: ACCIÓN SOBRIA */}
                    <div className="pt-1 flex gap-2">
                        <Button 
                            onClick={() => setIsSchedulingOpen(true)}
                            variant="outline"
                            className="w-14 h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white"
                        >
                            <VamoIcon name="calendar" className="w-6 h-6" />
                        </Button>
                        <Button 
                            onClick={handleRequestRide} 
                            disabled={!origin || !destination || isRequesting} 
                            className="flex-1 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black text-lg transition-all active:scale-[0.98] shadow-md border-t border-white/10"
                        >
                            {isRequesting ? 'PROCESANDO...' : 'SOLICITAR VamO'}
                        </Button>
                    </div>
              </div>
            )}
        </div>
      )}

      {/* MAP SELECTOR DIALOG */}
      <Dialog open={isMapSelectorOpen} onOpenChange={setMapSelectorOpen}>
          <DialogContent className="max-w-3xl h-[85vh] p-0 gap-0 sm:rounded-[2rem] overflow-hidden bg-[#1a1a1a] border-white/10">
              <DialogHeader className="sr-only">
                  <DialogTitle>Seleccionar ubicación</DialogTitle>
                  <DialogDescription>
                      Mueve el mapa para seleccionar el punto exacto de origen o destino.
                  </DialogDescription>
              </DialogHeader>
              <MapSelector initialLocation={mapEditingField === 'origin' ? origin : destination} onLocationSelect={handleMapSelect} />
          </DialogContent>
      </Dialog>

      {/* SCHEDULE DIALOG */}
      <Dialog open={isSchedulingOpen} onOpenChange={setIsSchedulingOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-[400px] bg-[#1a1a1a] border-white/10 text-white rounded-[2rem] p-8">
              <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase italic">Programar Viaje</DialogTitle>
                  <DialogDescription className="text-zinc-500 font-medium">Seleccioná cuándo querés que busquemos tu conductor.</DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-6">
                  {/* Presets */}
                  <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 pl-1">Accesos rápidos</Label>
                      <div className="grid grid-cols-3 gap-2">
                          <Button variant="outline" className="rounded-xl h-10 bg-white/5 border-white/10 text-white text-xs font-bold hover:bg-white/10" onClick={() => setScheduledAt(Date.now() + 35 * 60 * 1000)}>En 35 min</Button>
                          <Button variant="outline" className="rounded-xl h-10 bg-white/5 border-white/10 text-white text-xs font-bold hover:bg-white/10" onClick={() => setScheduledAt(Date.now() + 60 * 60 * 1000)}>En 1 hora</Button>
                          <Button variant="outline" className="rounded-xl h-10 bg-white/5 border-white/10 text-white text-xs font-bold hover:bg-white/10" onClick={() => setScheduledAt(Date.now() + 120 * 60 * 1000)}>En 2 horas</Button>
                      </div>
                  </div>

                  <div className="space-y-2 relative">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 pl-1">O elegir fecha y hora exacta</Label>
                      <Input 
                          type="datetime-local" 
                          className="bg-white/5 border-white/10 h-14 rounded-2xl text-white font-bold w-full [color-scheme:dark]"
                          value={scheduledAt ? new Date(scheduledAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                          onChange={(e) => {
                              if (e.target.value) {
                                  setScheduledAt(new Date(e.target.value).getTime());
                              } else {
                                  setScheduledAt(null);
                              }
                          }}
                          min={new Date(Date.now() + 30 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} 
                      />
                  </div>

                  {scheduledAt && (
                      <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center animate-in fade-in zoom-in-95 duration-200">
                          <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1">Viaje programado para:</p>
                          <p className="text-lg font-black text-white capitalize">{new Date(scheduledAt).toLocaleString('es-AR', { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} hs</p>
                      </div>
                  )}

                  <p className="text-[10px] text-zinc-600 font-medium italic pl-1 leading-relaxed border-l-2 border-zinc-800">
                      * Empezaremos a buscar conductor 15 minutos antes de la hora seleccionada. Debés estar atento a las notificaciones.
                  </p>
              </div>
              <div className="flex flex-col gap-3 mt-4">
                  <Button 
                    onClick={() => {
                        if (!scheduledAt) return;
                        handleRequestRide();
                        setIsSchedulingOpen(false);
                    }} 
                    disabled={!scheduledAt || isRequesting}
                    className="w-full rounded-2xl h-14 bg-indigo-600 hover:bg-indigo-500 font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-900/20"
                  >
                      {isRequesting ? <VamoIcon name="loader" className="animate-spin mr-2" /> : null}
                      Confirmar Reserva
                  </Button>
                  <Button variant="ghost" onClick={() => setIsSchedulingOpen(false)} className="w-full rounded-2xl h-12 text-zinc-500 font-bold hover:bg-white/5">
                      Cerrar
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      {hasActiveRide && isSearching && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-[#1a1a1a] p-5 pb-10 rounded-t-3xl shadow-2xl">
            {(() => {
                const financial = effectiveRide ? getRideFinancialSnapshot(effectiveRide) : {
                    totalFare: estimatedPrice,
                    walletCoveredAmount: savingsSimulation?.benefit,
                    cashToCollect: savingsSimulation?.final
                };
                return (
                    <PassengerSearchingSheet 
                        serviceType={effectiveRide?.serviceType || serviceType} 
                        estimatedPrice={financial.totalFare} 
                        walletCoveredAmount={financial.walletCoveredAmount}
                        cashToCollect={financial.cashToCollect}
                        paymentMethod={effectiveRide?.paymentMethod || paymentMethod}
                        originAddress={origin?.address || effectiveRide?.origin?.address || ''} 
                        destinationAddress={destination?.address || effectiveRide?.destination?.address || ''} 
                        onCancel={handleCancelSearching} 
                        isCancelling={isCancelling}
                        status={effectiveRide?.status}
                        scheduledAt={effectiveRide?.scheduledAt}
                        interestedDriversCount={effectiveRide?.interestedDriversCount}
                        dynamicSnapshot={effectiveRide?.pricing?.dynamic || dynamicSnapshot}
                    />
                );
            })()}
        </div>
      )}

      {showRideStatus && effectiveRide && (
         <RideStatus ride={effectiveRide} onNewRide={handleReset} />
      )}
      {(profile?.role === 'passenger' && profile?.hasSeenTutorial !== true && !tutorialDismissed) && (
        <TutorialOverlay 
          onComplete={async () => {
            setTutorialDismissed(true); // Instant local dismissal
            if (user?.uid && firestore) {
              try {
                const userRef = doc(firestore, 'users', user.uid);
                await updateDoc(userRef, {
                  hasSeenTutorial: true,
                  tutorialSeenAt: new Date()
                });
                console.log("[TUTORIAL] marked as seen at:", new Date().toISOString());
              } catch (e) {
                console.error("[TUTORIAL_ERROR] Failed to save seen state:", e);
              }
            }
          }} 
        />
      )}
    </div>
  );
}

export default function RidePage() {
    return <RidePageContent />;
}
