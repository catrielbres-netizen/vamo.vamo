'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useQuery } from '@tanstack/react-query';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { PassengerSearchingSheet } from "@/components/PassengerSearchingSheet";
import { PassengerCityLaunchGate } from '@/components/PassengerCityLaunchGate';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Switch } from '@/components/ui/switch';
import { getWeekIdentifierART } from '@/lib/timeUtils';
import { Button } from '@/components/ui/button';
import MapSelector from '@/components/MapSelector';
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { RideReceipt } from '@/components/RideReceipt';
import { useMapsAvailability } from '@/components/MapsProvider';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { ACTIVE_RIDE_STATES } from '@/lib/ride-status';
import { resolveCity, getCityDefaultLocation } from '@/lib/city-resolution';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import PlaceAutocompleteInput from '@/components/PlaceAutocompleteInput';
import { canPassengerRequestRide } from '@/lib/eligibility';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Ride, Place, ServiceType, Promotion } from '@/lib/types';
import { OnlineDriversLayer } from '@/components/OnlineDriversLayer';
import { ShieldCheck, Scale, Map as MapIcon, Flag, Crosshair, Gift, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { usePromotions } from '@/hooks/usePromotions';
import { PassengerSmallBalance } from '@/components/PassengerSmallBalance';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import { PassengerDashboardSkeleton } from '@/components/skeletons/PassengerDashboardSkeleton';
import { useSharedRideConfig } from '@/hooks/useSharedRideConfig';
import { SharedRideLegalGate } from '@/components/shared-ride/SharedRideLegalGate';
import { useSharedRide } from '@/hooks/useSharedRide';
import { SharedRideFormingScreen } from '@/components/shared-ride/SharedRideFormingScreen';
import { MercadoPagoLinkCard } from '@/components/MercadoPagoLinkCard';
import { featureFlags } from '@/config/features';
import { ExpressProgressWidget } from '@/components/ExpressProgressWidget';
import { SharedRideSuggestionModal } from '@/components/shared-ride/SharedRideSuggestionModal';
import { SharedSeatSelector, SeatId } from '@/components/shared-ride/SharedSeatSelector';

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
  const [expressDiscountAmount, setExpressDiscountAmount] = useState<number>(0);
  const [dynamicSnapshot, setDynamicSnapshot] = useState<any>(null);
  const [serviceType, setServiceType] = useState<ServiceType>('professional');
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
  const [isCreatingSharedRequest, setIsCreatingSharedRequest] = useState(false);
  const [isLegalGateOpen, setIsLegalGateOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<number | null>(null);
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const [isMpBlockOpen, setIsMpBlockOpen] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<SeatId[]>([]);
  
  // Shared Suggestion States
  const [suggestionData, setSuggestionData] = useState<any>(null);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [hasDeclinedSuggestion, setHasDeclinedSuggestion] = useState(false);
  const [isPreRequesting, setIsPreRequesting] = useState(false);
  const [stuckRideDetails, setStuckRideDetails] = useState<{ activeRideId?: string | null, activeSharedGroupId?: string | null, activeSharedRequestId?: string | null, isRecoverable?: boolean } | null>(null);
  
  const fareRequestId = useRef<number>(0);

  const { promotions: ridePromos, bestPromo, isLoading: isPromosLoading } = usePromotions('ride');

  const {
    request: sharedRequest,
    group: sharedGroup,
    cancelRequest,
    requestNewGroup,
    isCancelling: isSharedCancelling,
    setOverrideRequestId,
    setOverrideGroupId
  } = useSharedRide();

  const hasActiveSharedRequest = useMemo(() => {
    return !!(sharedRequest && !['cancelled', 'completed', 'expired', 'no_show', 'undeclared_companion', 'rejected'].includes(sharedRequest.status));
  }, [sharedRequest]);
  
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
      setCompletedRideId(null);
    } else if (profile?.activeSharedRideId) {
      setWatchedRideId(profile.activeSharedRideId);
      setCompletedRideId(null);
    } else if ((sharedGroup as any)?.finalRideId) {
      // Segundo pasajero: el grupo ya tiene rideId pero profile.activeRideId
      // aún no llegó del backend. Lo tomamos directo del grupo.
      setWatchedRideId((sharedGroup as any).finalRideId);
    }
  }, [profile?.activeRideId, profile?.activeSharedRideId, (sharedGroup as any)?.finalRideId]);


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
  // Incluir sharedGroup.finalRideId para que hasActiveRide sea true
  // antes de que profile.activeRideId llegue del backend (segundo pasajero)
  const hasActiveRide = !!(watchedRideId || localRideId || pendingRideRequest || completedRideId || (sharedGroup as any)?.finalRideId);

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
            if (data?.estimatedTotal) {
                setEstimatedPrice(data.estimatedTotal);
                setExpressDiscountAmount(data.expressDiscountAmount || 0);
            }
            if (data?.dynamic) setDynamicSnapshot(data.dynamic);
            else setDynamicSnapshot(null);
        } catch (e) {
            console.error(e);
            setDynamicSnapshot(null);
            setEstimatedPrice(null);
            setExpressDiscountAmount(0);
            toast({ variant: 'destructive', title: 'Error de tarifa', description: 'No se pudo calcular la tarifa. Verificá origen, destino o tarifario de la ciudad.' });
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
        const payload = await getRidePayload(false);
        const clientRequestId = Math.random().toString(36);

        if (serviceType === 'shared') {
            const requestSharedRide = httpsCallable(functions, 'requestSharedRideV1');
            const result = await requestSharedRide({ ...payload, clientRequestId, individualFareReference: estimatedPrice, cityKey: origin.city || '', sharedRideNoticeAccepted: true });
            const data = result.data as any;
            if (data.ok && data.requestId) {
                setPendingRideRequest(false);
                setOverrideRequestId?.(data.requestId);
                setOverrideGroupId?.(data.groupId);
                telemetry.trackRideLifecycle(data.requestId, 'request_success', { serviceType });
                toast({ title: "Buscando pasajeros compatibles para compartir tu viaje." });
            }

        } else {
            const createRide = httpsCallable(functions, 'createRideV1');
            const result = await createRide({ ...payload, clientRequestId });
            const data = result.data as any;
            if (data.success && data.rideId) {
                setLocalRideId(data.rideId);
                setPendingRideRequest(false);
                telemetry.trackRideLifecycle(data.rideId, 'request_success', { serviceType });
            }
        }
    } catch (error: any) {
      setLocalRideId(null);
      setPendingRideRequest(false);
      telemetry.trackError('ride_request_failed', error, { origin, destination });
      if (error?.code === 'already-exists') {
          setStuckRideDetails(error.details || { isRecoverable: true });
          return;
      }
      // Detectar bloqueo por Mercado Pago no vinculado
      const isMpBlock = error?.code === 'failed-precondition' &&
        (error?.message?.toLowerCase().includes('mercado pago') ||
         error?.message?.toLowerCase().includes('mercadopago'));
      if (isMpBlock) {
        setIsMpBlockOpen(true);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
      }
    } finally { 
        setIsRequesting(false); 
    }
  };

  const handlePreRequestRide = async () => {
    if (!isOperative) {
        setShowCityInactiveModal(true);
        return;
    }

    if (!isOperative) {
        setShowCityInactiveModal(true);
        return;
    }

    // Si la sugerencia fue rechazada antes, pasamos directo al flujo correspondiente
    if (!isSharedEnabled || hasDeclinedSuggestion || !origin || !destination || !firebaseApp) {
        if (serviceType === 'shared') return setIsLegalGateOpen(true);
        return handleRequestRide();
    }
    
    setIsPreRequesting(true);
    let handled = false;
    
    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const listNearby = httpsCallable(functions, 'listNearbySharedRideGroupsV1');
        
        // Timeout de 2 segundos para no bloquear la UX
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));
        const apiPromise = listNearby({
            origin,
            destination,
            cityKey: origin.city || profile?.cityKey
        });

        const result: any = await Promise.race([apiPromise, timeoutPromise]);
        
        if (result.data?.groups?.length > 0) {
            const bestGroup = result.data.groups[0]; // Ya vienen ordenados por compatibilidad
            
            // Re-calcular estimación de compartición para este pasajero
            // Factor base: 60% (2 pax), 55% (3 pax), 50% (4 pax).
            let factor = 0.60;
            if (bestGroup.passengerCount === 2) factor = 0.55;
            if (bestGroup.passengerCount === 3) factor = 0.50;
            
            const sharedFareEstimate = Math.ceil(((estimatedPrice || 0) * factor) / 100) * 100; 
            const savingsAmount = (estimatedPrice || 0) - sharedFareEstimate;

            if (savingsAmount > 0 && bestGroup.passengerCount < bestGroup.maxPassengers) {
                setSuggestionData({
                    ...bestGroup,
                    individualFare: estimatedPrice,
                    sharedFareEstimate,
                    savingsAmount,
                });
                setIsSuggestionModalOpen(true);
                handled = true;
            }
        }
    } catch (e: any) {
        console.warn("[SHARED_SUGGESTION] Fetch failed or timeout:", e.message);
    } finally {
        setIsPreRequesting(false);
    }

    if (!handled) {
        if (serviceType === 'shared') {
            setIsLegalGateOpen(true);
        } else {
            handleRequestRide();
        }
    }
  };

  const handleJoinSuggestedGroup = async () => {
      if (!suggestionData || !firebaseApp || !origin || !destination || !profile) return;
      setIsRequesting(true);
      try {
          const functions = getFunctions(firebaseApp, 'us-central1');
          const joinGroup = httpsCallable(functions, 'joinSharedRideGroupV1');
          const result = await joinGroup({
              groupId: suggestionData.groupId,
              origin,
              destination,
              cityKey: origin.city || profile.cityKey,
              individualFareReference: estimatedPrice,
              sharedRideNoticeAccepted: true,
              selectedSeats  // ← enviar asientos seleccionados por el segundo pasajero
          });
          const data = result.data as any;
          if (data.ok && data.requestId) {
              // Setear watchedRideId INMEDIATAMENTE sin esperar profile.activeRideId del backend.
              // El ID del ride compartido es siempre shared_${groupId} (determinístico).
              const predictedRideId = `shared_${data.groupId}`;
              setWatchedRideId(predictedRideId);
              setPendingRideRequest(false);
              setOverrideRequestId?.(data.requestId);
              setOverrideGroupId?.(data.groupId);
              setIsSuggestionModalOpen(false);
              setSelectedSeats([]);
              toast({ title: "Te has unido al viaje compartido." });
          }
      } catch (e: any) {
          console.error(e);
          if (e?.code === 'already-exists') {
              setIsSuggestionModalOpen(false);
              setStuckRideDetails(e.details || { isRecoverable: true });
              return;
          }
          toast({ variant: 'destructive', title: 'Error al unirse', description: e.message });
      } finally {
          setIsRequesting(false);
      }
  };

  const handleDeclineSuggestion = () => {
      setHasDeclinedSuggestion(true);
      setIsSuggestionModalOpen(false);
      if (serviceType === 'shared') {
          setIsLegalGateOpen(true);
      } else {
          handleRequestRide();
      }
  };

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'automatic'>('automatic');

  // [VamO PRO] Express Benefit Unlock Logic
  const currentWeekId = getWeekIdentifierART(new Date());
  const isCurrentWeek = profile?.passengerProgress?.weekIdentifier === currentWeekId;
  const ridesCompleted = isCurrentWeek ? (profile?.passengerProgress?.ridesThisWeek || 0) : 0;
  // FASE B: Desbloqueado con 5 viajes.
  const isExpressUnlocked = ridesCompleted >= 5 || profile?.role === 'admin';
  const expressUses = isCurrentWeek ? (profile?.passengerProgress?.expressUsesThisWeek || 0) : 0;
  const expressHasUsesLeft = expressUses < 3;
  
  // Opciones de advertencia para el usuario si está desbloqueado pero agotado
  const expressLabel = !expressHasUsesLeft 
      ? 'Límite semanal alcanzado (3/3)' 
      : 'Beneficio Desbloqueado';

  useEffect(() => {
    if (serviceType === 'express' && (!isExpressUnlocked || !expressHasUsesLeft)) {
        setServiceType('professional');
    }
  }, [isExpressUnlocked, expressHasUsesLeft, serviceType]);

  // [COMPARTIDO] Feature flag
  const { isEnabled: isSharedEnabled } = useSharedRideConfig();

  // Estimación client-side: factor 0.68 (2 pasajeros), redondeado a $100
  const estimatedSharedFare = useMemo(() => {
    if (!estimatedPrice) return null;
    return Math.ceil((estimatedPrice * 0.68) / 100) * 100;
  }, [estimatedPrice]);
    
  const sharedFareCalculation = useMemo(() => {
      if (!estimatedPrice) return null;
      const baseFare = Math.round((estimatedPrice * 0.60) / 100) * 100;
      const seatMultiplier = selectedSeats.length >= 2 ? 1.10 : 1.00;
      return Math.round((baseFare * seatMultiplier) / 100) * 100;
  }, [estimatedPrice, selectedSeats]);

  // Solo mostrar si hay ahorro real vs tarifa normal visible
  const sharedOffersRealSaving = estimatedSharedFare !== null && estimatedSharedFare < (estimatedPrice ?? Infinity);

  // Safety fallback: si Compartido se deshabilita mientras estaba seleccionado
  useEffect(() => {
    if (serviceType === 'shared' && !isSharedEnabled) {
      setServiceType('professional');
    }
  }, [isSharedEnabled, serviceType]);

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
     if (!estimatedPrice) return { benefit: 0, final: 0 };
     
     // Si es compartido, usamos tarifa plana (sin descuento express ni dinámica, usando base del cálculo compartido)
     const baseCalculationPrice = serviceType === 'shared' && sharedFareCalculation ? sharedFareCalculation : estimatedPrice;
     
     // El precio base para restar billetera es después de Express (solo si no es compartido)
     const appliedExpressDiscount = serviceType === 'shared' ? 0 : (expressDiscountAmount || 0);
     const priceAfterExpress = Math.max(0, baseCalculationPrice - appliedExpressDiscount);

     if (paymentMethod === 'cash') {
         return { benefit: 0, final: priceAfterExpress };
     }
     
     const currentBalance = profile?.currentBalance || 0;
     const benefit = Math.min(priceAfterExpress, currentBalance);
     const final = Math.max(0, priceAfterExpress - benefit);
     return { benefit, final };
  }, [estimatedPrice, expressDiscountAmount, profile?.currentBalance, paymentMethod, serviceType, sharedFareCalculation]);

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
      setSheetState('collapsed');
      setOverrideRequestId?.(null);

      if (serviceType === 'shared') {
          setOverrideGroupId?.(null);
      }

      // [VamO PRO] Proactive Firestore Cleanup to avoid hangs
      if (user && firebaseApp && (profile?.activeRideId || profile?.activeSharedRideId)) {
          try {
              const functions = getFunctions(firebaseApp, 'us-central1');
              const clearRide = httpsCallable(functions, 'clearPassengerActiveRideV1');
              await clearRide();
              console.log("[CLEANUP] active ride pointers cleared in Firestore.");
          } catch (e) {
              console.error("[CLEANUP] Failed to clear active ride pointers:", e);
          }
      }
    }, [user, firestore, profile?.activeRideId, (profile as any)?.activeSharedRideId, serviceType, setOverrideRequestId, setOverrideGroupId]);

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
      } catch (e: any) {
          telemetry.trackError('ride_cancel_failed', e, { rideId });
          // If the ride is already cancelled or not found in backend, force a local reset to unstick the UI
          if (e.code === 'failed-precondition' || e.code === 'not-found' || e.message?.includes('cancelled') || e.message?.includes('cancelado')) {
              handleReset();
          }
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

  // Detect dismantled group
  const isGroupDismantled = sharedRequest?.status === 'cancelled' && sharedRequest?.cancelReason === 'group_dismantled_1_pax_left';
  const [showDismantledAlert, setShowDismantledAlert] = useState(false);
  useEffect(() => {
      if (isGroupDismantled) {
          setShowDismantledAlert(true);
      }
  }, [isGroupDismantled]);

  // Detect driver cancellation
  const prevRideStatus = useRef<string | null>(null);
  useEffect(() => {
      if (effectiveRide) {
          if (
              prevRideStatus.current &&
              prevRideStatus.current !== 'searching' &&
              effectiveRide.status === 'searching' &&
              effectiveRide.dispatchReason === 'urgent_driver_relaunch'
          ) {
              toast({
                  title: 'El conductor canceló',
                  description: 'Estamos buscando otro conductor para tu grupo.',
                  variant: 'default',
              });
          }
          prevRideStatus.current = effectiveRide.status;
      }
  }, [effectiveRide?.status, effectiveRide?.dispatchReason, toast]);

  if (userError) return <div className="p-4">Error: {userError.message}</div>;
  if (!isLoaded || !profile) {
    return <PassengerDashboardSkeleton />;
  }

  const handleConfirmSharedTerms = async () => {
    if (isCreatingSharedRequest) return;
    
    // Validaciones obligatorias
    if (!isSharedEnabled) {
      toast({ variant: 'destructive', title: 'Error', description: 'El servicio compartido no está habilitado.' });
      return;
    }
    if (!origin || !destination) {
      toast({ variant: 'destructive', title: 'Error', description: 'Faltan coordenadas de origen o destino.' });
      return;
    }
    if (!estimatedPrice || estimatedPrice <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Es necesario calcular la tarifa estimada primero.' });
      return;
    }
    const cityKey = profile?.cityKey;
    if (!cityKey) {
      toast({ variant: 'destructive', title: 'Error', description: 'No pudimos detectar tu ciudad para Compartido.' });
      return;
    }

    setIsCreatingSharedRequest(true);
    setIsLegalGateOpen(false);
    
    try {
      const res = await requestNewGroup({
        origin,
        destination,
        cityKey,
        individualFareReference: estimatedPrice,
        sharedRideNoticeAccepted: true,
        selectedSeats
      });
      
      if (res && res.ok) {
        toast({
          title: '🚀 Solicitud Creada',
          description: 'Estamos buscando compañeros de viaje para tu grupo compartido.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: res?.error || 'No se pudo crear la solicitud compartida.',
        });
      }
    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e.message || 'Error al iniciar viaje compartido.',
      });
    } finally {
      setIsCreatingSharedRequest(false);
    }
  };

  const isPendingShared = (isRequesting || pendingRideRequest || isCreatingSharedRequest) && serviceType === 'shared';
  // Segundo pasajero: el ride compartido puede estar asignado aunque effectiveRide aún no cargó
  const isSharedGroupDispatched = !!(sharedGroup?.finalRideId || sharedGroup?.driverId || sharedGroup?.status === 'driver_assigned' || sharedGroup?.status === 'searching_driver');
  const isRideAssigned = (!!effectiveRide && !['searching', 'scheduled', 'cancelled'].includes(effectiveRide.status)) || isSharedGroupDispatched;
  const showSharedScreen = (hasActiveSharedRequest || isPendingShared) && !isRideAssigned;


  // Para rides compartidos NO mostramos PassengerSearchingSheet (isSearching=false)
  // el ride compartido en estado 'searching' lo maneja SharedRideFormingScreen
  const isSearchingShared = !!effectiveRide?.isSharedRide && effectiveRide.status === 'searching';
  const isSearching = hasActiveRide && (!effectiveRide || effectiveRide.status === 'searching' || effectiveRide.status === 'scheduled') && !showSharedScreen && !isSharedGroupDispatched && !isSearchingShared;
  // showRideStatus: siempre que haya un ride cargado y NO estemos en SharedRideFormingScreen
  const showRideStatus = !!effectiveRide && !showSharedScreen;

  // Pantalla de conexión: cubre el gap entre el join y que Firestore propague el ride.
  // watchedRideId se setea INMEDIATAMENTE al unirse, antes de que effectiveRide cargue.
  const isConnectingSharedRide = !!watchedRideId && !effectiveRide && !showSharedScreen;


  const handleContinueAsIndividual = async () => {
      setShowDismantledAlert(false);
      setServiceType('professional');
      handleReset(); // Limpia y deja listo para pedir
  };

  const handleCancelDismantled = () => {
      setShowDismantledAlert(false);
      handleReset();
  };

  return (
    
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0a0a] animate-in fade-in duration-1000 fill-mode-both">
      {mapsAvailable && (
        <div 
          className="absolute inset-0 z-0" 
          onClick={() => !isSearching && setSheetState('collapsed')}
          style={{ display: showRideStatus ? 'none' : 'block' }}
        >
          <Map
            defaultCenter={origin ? { lat: origin.lat, lng: origin.lng } : getCityDefaultLocation(profile?.cityKey)}
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

      {!hasActiveRide && !hasActiveSharedRequest && (
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
                
                <div className="pointer-events-auto mt-2 cursor-pointer" onClick={() => router.push('/dashboard/profile')}>
                    <ExpressProgressWidget profile={profile} compact />
                </div>

                {/* BLOQUE A: INPUTS DE BÚSQUEDA MOVIDOS ARRIBA */}
                <div className="flex flex-col gap-2 mt-2 pointer-events-auto shadow-2xl">
                    <div className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl transition-all focus-within:border-indigo-500/50 shadow-lg">
                        <PlaceAutocompleteInput 
                            onPlaceSelect={setOrigin} 
                            defaultValue={origin?.address || ''} 
                            placeholder="Punto de partida" 
                            iconName="map-pin" 
                            iconClassName="text-indigo-400"
                            cityKey={profile?.cityKey}
                        />
                        <button 
                            onClick={() => handleOpenMapSelector('origin')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/30 hover:text-white/80 transition-colors"
                        >
                            <VamoIcon name="map" className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl transition-all focus-within:border-indigo-500/50 shadow-lg">
                        <PlaceAutocompleteInput 
                            onPlaceSelect={setDestination} 
                            defaultValue={destination?.address || ''} 
                            placeholder="¿A dónde vas?" 
                            iconName="flag" 
                            iconClassName="text-emerald-400"
                            cityKey={profile?.cityKey}
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
                style={{ top: 'calc(env(safe-area-inset-top, 16px) + 120px)' }}
            >
                {isGeocoding ? <VamoIcon name="loader" className="animate-spin h-5 w-5" /> : <VamoIcon name="crosshair" className="h-5 w-5" />}
            </button>

            <div className="mt-auto pointer-events-auto bg-[#1a1a1a] border border-white/10 rounded-t-3xl p-5 flex flex-col gap-4 text-white shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.5)] max-h-[85dvh] overflow-y-auto overscroll-contain transition-all duration-300 z-30"
                 style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 20px)' }}>

                 {sheetState === 'expanded' && (
                   <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-5 duration-300 mt-2">
                     <h1 className="text-base font-bold text-white/90 px-1 italic uppercase tracking-wider">Detalles del Viaje</h1>
                     
                     {/* NUEVO SELECTOR PRINCIPAL: INDIVIDUAL VS COMPARTIDO */}
                 <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl">
                    <button
                        onClick={() => {
                           if (serviceType === 'shared') setServiceType('professional');
                        }}
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-xl transition-all border",
                            serviceType !== 'shared' 
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" 
                                : "bg-transparent border-transparent text-white/40 hover:text-white/60"
                        )}
                    >
                        <VamoIcon name="user" className={cn("w-5 h-5 mb-1", serviceType !== 'shared' ? "text-white" : "text-zinc-600")} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">VIAJE INDIVIDUAL</span>
                    </button>
                    
                    <button
                        onClick={() => setServiceType('shared')}
                        className={cn(
                            "flex flex-col items-center justify-center py-3 rounded-xl transition-all border",
                            serviceType === 'shared' 
                                ? "bg-emerald-600 border-emerald-500 text-white shadow-lg" 
                                : "bg-transparent border-transparent text-white/40 hover:text-white/60"
                        )}
                    >
                        <VamoIcon name="users" className={cn("w-5 h-5 mb-1", serviceType === 'shared' ? "text-white" : "text-zinc-600")} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">VAMO COMPARTIDO</span>
                    </button>
                 </div>

                 {/* SUB-SELECTOR PARA VIAJE INDIVIDUAL */}
                 {serviceType !== 'shared' && (
                     <>
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
                                    onClick={() => expressHasUsesLeft && setServiceType('express')} 
                                    className={cn(
                                        "flex flex-col items-center justify-center py-3 rounded-xl transition-all border",
                                        serviceType === 'express' 
                                            ? "bg-amber-600 border-amber-500 text-white shadow-lg" 
                                            : "bg-transparent border-transparent text-white/40 hover:text-white/60",
                                        !expressHasUsesLeft && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <VamoIcon name="zap" className={cn("w-5 h-5 mb-1", serviceType === 'express' ? "text-white" : "text-zinc-600")} />
                                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">Express</span>
                                    <span className="text-[8px] font-bold opacity-60 mt-1">{expressLabel}</span>
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
                     </>
                 )}

                 {/* BLOQUE DE INFORMACIÓN COMPARTIDO */}
                 {serviceType === 'shared' && (
                     <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col gap-3">
                         <div className="border-b border-emerald-500/20 pb-3 mb-1">
                             <div className="flex items-center gap-2 mb-2">
                                 <VamoIcon name="users" className="w-5 h-5 text-emerald-400" />
                                 <h3 className="font-black text-emerald-400 uppercase tracking-widest text-sm">VAMO COMPARTIDO</h3>
                             </div>
                             <p className="text-xs text-emerald-100/80 leading-relaxed font-medium">
                                 Compartí el viaje con pasajeros cercanos, <span className="font-bold text-white">pagá menos</span> y ayudá a que el conductor <span className="font-bold text-white">gane más</span>.
                             </p>
                         </div>
                         <div>
                             <p className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Tu ahorro posible</p>
                             <p className="text-[10px] text-emerald-100/80 mb-2 font-medium">Si se suman pasajeros compatibles, tu precio baja automáticamente.</p>
                             <SharedSeatSelector
                               selectedSeats={selectedSeats}
                               onSeatsChange={setSelectedSeats}
                             />

                             <div className="bg-emerald-500/20 rounded-xl p-3 flex flex-col items-center justify-center border border-emerald-500/30 text-center mt-2">
                                 {selectedSeats.length > 0 ? (
                                   <>
                                     <span className="text-[10px] text-emerald-100/70 font-bold leading-tight mb-1">
                                       {selectedSeats.length === 1 ? 'Por 1 asiento' : 'Por vos + 1 acompañante'}
                                     </span>
                                     {estimatedPrice && sharedFareCalculation ? (() => {
                                         const saving = estimatedPrice - sharedFareCalculation;
                                         return (
                                           <>
                                             <span className="text-sm sm:text-base font-black text-white">Pagás ${sharedFareCalculation.toLocaleString('es-AR')}</span>
                                             <span className="text-[10px] font-bold text-emerald-300">Ahorrás ${saving.toLocaleString('es-AR')} vs individual</span>
                                           </>
                                         );
                                     })() : null}
                                   </>
                                 ) : (
                                   <span className="text-[11px] font-bold text-emerald-300">Seleccioná tus asientos para ver el precio</span>
                                 )}
                             </div>

                             <p className="text-[9px] text-emerald-100/50 mt-2 font-medium italic text-center">
                                 Cada pasajero paga según su propio recorrido. El conductor cobra la suma de todos los aportes.
                             </p>
                         </div>
                         <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                             <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><VamoIcon name="info" className="w-3 h-3" /> Reglas de Compatibilidad</p>
                             <ul className="list-disc list-inside space-y-1 text-emerald-100/70 text-[11px] font-medium ml-1">
                                 <li>Orígenes dentro de 1.000 metros.</li>
                                 <li>Destinos dentro de 30 cuadras.</li>
                             </ul>
                         </div>
                     </div>
                 )}

                 {/* BLOQUE B: SELECTOR DE PAGO SOBRIO */}
                 {scheduledAt ? (
                     <div className="flex flex-col gap-1.5 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center">
                         <span className="text-[11px] font-black uppercase text-indigo-400">Reserva Programada</span>
                         <span className="text-[10px] text-indigo-300 font-medium">Las reservas se abonan únicamente en <b className="font-black text-white">Efectivo</b> al finalizar el viaje.</span>
                     </div>
                 ) : (
                    <div className="flex gap-1.5 p-1.5 bg-white/5 border border-white/5 rounded-2xl">
                        <button onClick={() => setPaymentMethod('cash')} className={cn("flex-1 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-tight", paymentMethod === 'cash' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/70')}>Efectivo</button>
                        <button onClick={() => setPaymentMethod('wallet')} className={cn("flex-1 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-tight", paymentMethod === 'wallet' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/70')}>Billetera</button>
                        <button onClick={() => setPaymentMethod('automatic')} className={cn("flex-1 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-tight", paymentMethod === 'automatic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/70')}>Mercado Pago</button>
                    </div>
                 )}

                     {/* BLOQUE C: DESGLOSE COMPLETO VamO (ESTÁNDAR UNIFICADO) */}
                     {savingsSimulation && (
                       <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3 shadow-inner">
                          {/* DYNAMIC PRICING BREAKDOWN */}
                          {serviceType === 'shared' ? (
                             <>
                                 <div className="flex justify-between items-center text-xs px-1">
                                     <span className="font-bold text-white/40 uppercase tracking-tight">Tarifa compartida base</span>
                                     <span className="font-black text-emerald-400">
                                         ${sharedFareCalculation}
                                     </span>
                                 </div>
                             </>
                          ) : (
                             <>
                                 <div className="flex justify-between items-center text-xs px-1">
                                     <span className="font-bold text-white/40 uppercase tracking-tight">Tarifa reconocida</span>
                                     <span className={cn("font-black", expressDiscountAmount > 0 ? "line-through text-white/40" : "text-white/80")}>
                                         ${estimatedPrice}
                                     </span>
                                 </div>
                                 {expressDiscountAmount > 0 && (
                                     <div className="flex justify-between items-center text-xs px-1 mt-1">
                                         <div className="flex items-center gap-1.5 font-bold text-amber-400 uppercase tracking-tight">
                                             <VamoIcon name="zap" className="w-3 h-3" />
                                             <span>Beneficio Express VamO</span>
                                         </div>
                                         <span className="font-black text-amber-400">-${expressDiscountAmount}</span>
                                     </div>
                                 )}
                             </>
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
                                </div>
                             )}
                             {serviceType === 'professional' && !dynamicSnapshot?.applied && (
                                <div className="px-1 pt-1 border-t border-white/5">
                                   <p className="text-[10px] text-zinc-400 italic font-medium leading-snug">
                                      Tarifa estimada según tarifario profesional configurado para esta ciudad.
                                   </p>
                                </div>
                             )}
                          </div>
                       </div>
                     )}

                    {/* BLOQUE D: ACCIÓN SOBRIA */}
                    <div className="sticky bottom-0 bg-[#1a1a1a] pt-3 pb-1 flex gap-2 z-20 border-t border-white/5 mt-auto">
                        <Button 
                            onClick={() => setIsSchedulingOpen(true)}
                            variant="outline"
                            className="w-14 h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white shrink-0"
                        >
                            <VamoIcon name="calendar" className="w-6 h-6" />
                        </Button>
                        <Button 
                            onClick={() => {
                                handlePreRequestRide();
                            }}
                            disabled={!origin || !destination || isRequesting || !estimatedPrice} 
                            className={cn(
                                "flex-1 h-14 rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-md border-t border-white/10",
                                serviceType === 'shared' 
                                    ? "bg-emerald-600 hover:bg-emerald-500 text-white" 
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                            )}
                        >
                            {isRequesting ? 'PROCESANDO...' : 
                             serviceType === 'shared' ? 'CONFIRMAR COMPARTIDO' : 'SOLICITAR VamO'}
                        </Button>
                    </div>
                  </div>
                 )}
              </div>
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
              <MapSelector 
                  onLocationSelect={handleMapSelect} 
                  initialLocation={mapEditingField === 'origin' ? origin : destination} 
                  cityKey={profile?.cityKey}
              />
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
                    disabled={!scheduledAt || isRequesting || isPreRequesting}
                    onClick={() => {
                        handlePreRequestRide();
                        setIsSchedulingOpen(false);
                    }} 
                    className="w-full rounded-2xl h-14 bg-indigo-600 hover:bg-indigo-500 font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-900/20"
                  >
                      {isRequesting || isPreRequesting ? <VamoIcon name="loader" className="animate-spin mr-2" /> : null}
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
         <RideStatus 
           ride={effectiveRide} 
           onNewRide={handleReset} 
           onCancel={effectiveRide.isSharedRide ? cancelRequest : handleCancelSearching}
         />
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

      {/* Pantalla de conexión: tapa el layout mientras Firestore propaga el ride (gap de timing) */}
      {isConnectingSharedRide && (
        <div className="fixed inset-0 z-[100] bg-[#0d0d0d] flex flex-col items-center justify-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <span className="text-4xl">🚗</span>
            </div>
            <div className="text-center">
                <h3 className="text-white font-black text-xl uppercase tracking-widest">Conectando</h3>
                <p className="text-zinc-400 text-sm mt-2">Uniéndote al viaje compartido...</p>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'0ms'}} />
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'150ms'}} />
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'300ms'}} />
            </div>
        </div>
      )}

      {/* Pantalla de grupo en formación compartida (Fase 3) */}
      {showSharedScreen && (
        <div className="fixed inset-0 z-[100] bg-[#0d0d0d] overflow-y-auto flex flex-col"
             style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 20px)' }}>
             <SharedRideFormingScreen 
                 request={sharedRequest as any}
                 group={sharedGroup || undefined}
                 onCancel={cancelRequest}
                 isCancelling={isSharedCancelling}
             />
        </div>
      )}


      <SharedRideLegalGate
        isOpen={isLegalGateOpen}
        onClose={() => setIsLegalGateOpen(false)}
        onConfirm={handleConfirmSharedTerms}
      />

      <AlertDialog open={showDismantledAlert} onOpenChange={setShowDismantledAlert}>
          <AlertDialogContent className="bg-[#1a1a1a] border border-white/10 text-white rounded-2xl max-w-[90vw] sm:max-w-md">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-black uppercase text-amber-400">El grupo se desarmó</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400 font-medium text-sm">
                      Lamentablemente, los demás pasajeros cancelaron y quedaste solo en el grupo. Como ya no cumple los requisitos para ser un viaje compartido, el grupo ha sido cancelado.
                      <br /><br />
                      ¿Querés continuar y solicitar este mismo viaje como individual?
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-6 flex-col sm:flex-row gap-2">
                  <AlertDialogCancel onClick={handleCancelDismantled} className="bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl flex-1 mt-0">
                      Cancelar Viaje
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleContinueAsIndividual} className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 rounded-xl flex-1 m-0 shadow-lg shadow-indigo-900/20">
                      Continuar como Individual
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {/* MERCADO PAGO BLOCK MODAL */}
      <Dialog open={isMpBlockOpen} onOpenChange={setIsMpBlockOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-[400px] bg-[#1a1a1a] border-white/10 text-white rounded-[2rem] p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                  <DialogTitle>Vincular Mercado Pago</DialogTitle>
                  <DialogDescription>Para solicitar viajes necesitás vincular tu cuenta de Mercado Pago.</DialogDescription>
              </DialogHeader>
              {/* Header visual */}
              <div className="bg-gradient-to-br from-blue-600/30 to-indigo-900/40 p-6 border-b border-white/5 flex flex-col items-center text-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-500/20 flex items-center justify-center">
                      <VamoIcon name="link" className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                      <h2 className="text-xl font-black text-white">Vinculá Mercado Pago</h2>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          Para solicitar viajes necesitás vincular Mercado Pago y validar tu identidad.
                      </p>
                  </div>
              </div>
              <div className="p-6 space-y-4">
                  <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
                      <div className="flex items-start gap-2">
                          <VamoIcon name="shield-check" className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                          <span>Validamos tu identidad de forma segura a través de Mercado Pago.</span>
                      </div>
                      <div className="flex items-start gap-2">
                          <VamoIcon name="credit-card" className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                          <span>Podés pagar viajes con tu cuenta o con efectivo igualmente.</span>
                      </div>
                      <div className="flex items-start gap-2">
                          <VamoIcon name="lock" className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                          <span>Tus tokens nunca son visibles en la app. Solo se usan internamente.</span>
                      </div>
                  </div>
                  <MercadoPagoLinkCard
                      mpAccountStatus={profile?.mpAccountStatus}
                      mpLinkedAt={(profile as any)?.mpLinkedAt}
                      compact
                  />
                  <Button
                      variant="ghost"
                      onClick={() => setIsMpBlockOpen(false)}
                      className="w-full rounded-2xl h-12 text-zinc-500 font-bold hover:bg-white/5 text-sm"
                  >
                      Cerrar
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      {/* MODAL DE SUGERENCIA DE VAMO COMPARTIDO */}
      {suggestionData && (
          <SharedRideSuggestionModal
              open={isSuggestionModalOpen}
              onOpenChange={setIsSuggestionModalOpen}
              individualFare={suggestionData.individualFare}
              sharedFareEstimate={suggestionData.sharedFareEstimate}
              savingsAmount={suggestionData.savingsAmount}
              passengerCount={suggestionData.passengerCount}
              maxPassengers={suggestionData.maxPassengers ?? 2}
              onJoin={handleJoinSuggestedGroup}
              onContinueIndividual={handleDeclineSuggestion}
              isLoading={isRequesting}
              suggestingForSharedMode={serviceType === 'shared'}
              selectedSeats={selectedSeats}
              onSeatsChange={setSelectedSeats}
              occupiedSeats={(suggestionData.occupiedSeats ?? []) as SeatId[]}
          />
      )}

      {/* MODAL DE VIAJE TRABADO / ALREADY-EXISTS */}
      <AlertDialog open={!!stuckRideDetails} onOpenChange={() => setStuckRideDetails(null)}>
          <AlertDialogContent className="bg-[#1a1a1a] border border-white/10 text-white rounded-2xl max-w-[90vw] sm:max-w-md">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-black uppercase text-amber-400">TENÉS UN VIAJE COMPARTIDO ACTIVO</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400 font-medium text-sm">
                      El sistema detecta que ya estás en un viaje o grupo compartido. No podés crear ni unirte a uno nuevo hasta que finalice o sea cancelado.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2 mt-4">
                  <Button 
                      onClick={() => {
                          setStuckRideDetails(null);
                          if (stuckRideDetails?.activeRideId) setOverrideRequestId?.(stuckRideDetails.activeRideId);
                          else if (stuckRideDetails?.activeSharedRequestId) setOverrideRequestId?.(stuckRideDetails.activeSharedRequestId);
                      }} 
                      className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold"
                  >
                      Volver a mi viaje
                  </Button>
                  
                  <Button 
                      onClick={async () => {
                          setStuckRideDetails(null);
                          toast({ title: 'Intentando cancelar viaje anterior...' });
                          await handleCancelSearching(); 
                          await cancelRequest();
                      }} 
                      variant="outline" 
                      className="h-12 rounded-xl border-white/10 text-zinc-300 hover:bg-white/5 font-bold"
                  >
                      Cancelar solicitud anterior
                  </Button>

                  <Button 
                      onClick={async () => {
                          setStuckRideDetails(null);
                          if (user && firestore) {
                              try {
                                  const userRef = doc(firestore, 'users', user.uid);
                                  await updateDoc(userRef, { 
                                      activeRideId: null, 
                                      activeSharedRideId: null, 
                                      activeSharedGroupId: null, 
                                      activeSharedRequestId: null 
                                  });
                                  toast({ title: 'Perfil liberado (Limpieza Alpha)' });
                              } catch (e) {
                                  console.error(e);
                              }
                          }
                      }} 
                      variant="outline" 
                      className="h-12 rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold"
                  >
                      Forzar Limpieza (Solo Alpha)
                  </Button>
                  
                  <Button 
                      onClick={() => {
                          setStuckRideDetails(null);
                          // El usuario puede decidir qué hacer
                      }} 
                      variant="ghost" 
                      className="h-12 rounded-xl text-zinc-500 hover:bg-white/5 font-bold"
                  >
                      Cerrar
                  </Button>
              </div>
          </AlertDialogContent>
      </AlertDialog>

    </div>
    

  );
}

export default function RidePage() {
    return <RidePageContent />;
}
