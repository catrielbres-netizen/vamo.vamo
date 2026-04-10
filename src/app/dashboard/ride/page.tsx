'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import PlaceAutocompleteInput from '@/components/PlaceAutocompleteInput';
import { canPassengerRequestRide } from '@/lib/eligibility';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Ride, Place, ServiceType, Promotion } from '@/lib/types';
import { ShieldCheck, Scale, Map as MapIcon, Flag, Crosshair, Gift, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePromotions } from '@/hooks/usePromotions';

function RidePageContent() {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { user, profile, loading: userIsLoading, error: userError } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  
  const { mapsAvailable } = useMapsAvailability();
  const geocodingLib = useMapsLibrary('geocoding');

  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [useExpress, setUseExpress] = useState(false);
  const [isMapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [preferredDriverGender, setPreferredDriverGender] = useState<'male' | 'female' | null>(null);
  const [mapEditingField, setMapEditingField] = useState<'origin' | 'destination' | null>(null);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isCalculatingFare, setIsCalculatingFare] = useState(false);
  const [localRideId, setLocalRideId] = useState<string | null>(null);
  const [pendingRideRequest, setPendingRideRequest] = useState(false);
  const [isLocalResetting, setIsLocalResetting] = useState(false);
  const [lastCompletedRide, setLastCompletedRide] = useState<Ride | null>(null);
  const [sheetState, setSheetState] = useState<'collapsed' | 'expanded'>('collapsed');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [isLegalInfoOpen, setIsLegalInfoOpen] = useState(false);
  const fareRequestId = useRef<number>(0);

  const { promotions: ridePromos, bestPromo, isLoading: isPromosLoading } = usePromotions('ride');

  // PROACTIVE UX: Calculate eligibility beforehand to block button if needed
  const eligibility = useMemo(() => {
    if (!profile) return { isEligible: true }; // Let it pass if still loading profile
    return canPassengerRequestRide(profile, user?.emailVerified);
  }, [profile, user?.emailVerified]);

  // Auto-select best promo if none selected
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
      toast({ variant: 'destructive', title: 'Geolocalización no soportada', description: 'Tu navegador no permite obtener la ubicación.' });
      return;
    }
    if (!geocoder) {
      toast({ variant: 'destructive', title: 'Servicio no disponible', description: 'El servicio de mapas no está listo. Intenta de nuevo.' });
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
            toast({ title: 'Ubicación actual establecida' });
          } else {
            setOrigin({ address: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`, lat: latitude, lng: longitude });
          }
          setIsGeocoding(false);
        });
      },
      () => {
        toast({ variant: 'destructive', title: 'No se pudo obtener la ubicación' });
        setIsGeocoding(false);
      }
    );
  }, [geocoder, toast]);

  const activeRideRef = useMemoFirebase(() => {
    if (!firestore || !profile?.activeRideId) return null;
    return doc(firestore, 'rides', profile.activeRideId);
  }, [firestore, profile?.activeRideId]);

  const { data: ride } = useDoc<Ride>(activeRideRef);

  const localRideRef = useMemoFirebase(() => {
    if (!firestore || !localRideId || profile?.activeRideId === localRideId) return null;
    return doc(firestore, 'rides', localRideId);
  }, [firestore, localRideId, profile?.activeRideId]);

  const { data: localRide } = useDoc<Ride>(localRideRef);

  const effectiveRide = ride || localRide;
  // hasActiveRide should be true if we have any indicator of an ongoing or requested ride
  // PRIORITY: Firestore is the single source of truth. Local states are only bridges.
  const hasActiveRide = !!(profile?.activeRideId || localRideId || pendingRideRequest);

  // Sync effect: Reset pending/local states once Firestore profile catch up with the active ride
  useEffect(() => {
    if (profile?.activeRideId && (localRideId === profile.activeRideId || pendingRideRequest)) {
       console.log('🔄 [SYNC] Profile updated with activeRideId. Clearing local pending states.', { rideId: profile.activeRideId });
       setLocalRideId(null);
       setPendingRideRequest(false);
       setIsLocalResetting(false);
    }
  }, [profile?.activeRideId, localRideId, pendingRideRequest]);

  // BUG 2 — Robust Capture: Ensure we capture completed rides even if the backend clears activeRideId quickly
  useEffect(() => {
    if (effectiveRide?.status === 'completed') {
      console.log('🏁 [COMPLETION_CAPTURE] Capturing ride for persistent receipt:', effectiveRide.id);
      setLastCompletedRide((prev: Ride | null) => {
        // Only update if it's a newer version or first time capturing this ride
        if (!prev || prev.id !== effectiveRide.id || (effectiveRide.updatedAt as any)?.seconds > (prev.updatedAt as any)?.seconds) {
           return effectiveRide;
        }
        return prev;
      });
    }
  }, [effectiveRide]);


  const getRidePayload = async (isDryRun: boolean) => {
      if (!origin || !destination) throw new Error("Faltan origen o destino");
      
      let resolvedCity = origin.city;
      if (!resolvedCity) {
          const geocoder = new google.maps.Geocoder();
          const resolution = await resolveCity(origin.lat, origin.lng, undefined, geocoder);
          resolvedCity = resolution.city;
      }
  
      return {
          origin: { ...origin, city: resolvedCity },
          destination,
          serviceType: useExpress ? 'express' : 'normal',
          promotionId: selectedPromoId,
          ...(isDryRun ? {} : { preferredDriverGender }),
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
            
            if (fareRequestId.current !== currentReqId) return;

            const result = await createRideFunc(payload);
            
            if (fareRequestId.current !== currentReqId) return;

            const data = result.data as any;
            if (data && typeof data.estimatedTotal === 'number') {
                setEstimatedPrice(data.estimatedTotal);
            }
        } catch (e) {
            console.error("Fare calculation error", e);
            if (fareRequestId.current === currentReqId) {
                setEstimatedPrice(null);
            }
        } finally {
            if (fareRequestId.current === currentReqId) {
                setIsCalculatingFare(false);
            }
        }
    }
    
    // Debounce de 500ms
    const timerId = setTimeout(() => {
        calculateFare();
    }, 500);

    return () => {
        clearTimeout(timerId);
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, useExpress, selectedPromoId, firebaseApp]);

  const handleRequestRide = async () => {
    if (isRequesting || !firebaseApp || !user || !profile) return;
    if (!origin || !destination) return;

    const eligibility = canPassengerRequestRide(profile, user.emailVerified);
    if (!eligibility.isEligible) {
        toast({ 
            variant: 'destructive', 
            title: 'No podés pedir un viaje', 
            description: eligibility.reason 
        });
        
        if (eligibility.code === 'PROFILE_INCOMPLETE' || eligibility.code === 'MISSING_NAME' || eligibility.code === 'MISSING_PHONE') {
            router.push('/dashboard/complete-profile');
        }
        return;
    }

    setIsRequesting(true);
    setPendingRideRequest(true);

    try {
        const functions = getFunctions(undefined, 'us-central1');
        const createRide = httpsCallable(functions, 'createRideV1');
        
        const payload = await getRidePayload(false);

        console.log('🚀 [RIDE_REQUEST] Parameters:', payload);

        const result = await createRide(payload);
        
        const data = result.data as any;
        console.log('✅ [RIDE_REQUEST] Server Response:', data);

        if (data.success && data.rideId) {
            // CRITICAL: Set localRideId first, then release pending so hasActiveRide stays true
            console.log('🚀 [RIDE_UI] Transitioning to searching with rideId:', data.rideId);
            setLocalRideId(data.rideId);
            setPendingRideRequest(false);
            toast({ title: '¡Buscando conductor!' });
        } else {
            throw new Error(data.error || 'Error al crear el viaje');
        }
    } catch (error: any) {
      console.error('❌ [RIDE_REQUEST] Error:', error);
      setLocalRideId(null);
      setPendingRideRequest(false);
      toast({ variant: 'destructive', title: 'Error al pedir viaje', description: error.message });
    } finally { 
        setIsRequesting(false); 
    }
  };

  const handleOpenMapSelector = (field: 'origin' | 'destination') => {
      setMapEditingField(field);
      setMapSelectorOpen(true);
  };

  const handleMapSelect = (place: Place) => {
      if (mapEditingField === 'origin') setOrigin(place);
      else setDestination(place);
      setMapSelectorOpen(false);
  };
  
  const [isCancelling, setIsCancelling] = useState(false);

  const handleReset = useCallback(() => { 
      console.log('🏁 [RECEIPT_CLOSE] Resetting ride state and clearing lastCompletedRide');
      console.log('🏁 [RIDE_PAGE_RESET] Clearing all local trip state');
      setIsLocalResetting(true);
      setOrigin(null);
      setDestination(null); 
      setEstimatedPrice(null);
      setLocalRideId(null);
      setPendingRideRequest(false);
      setIsCancelling(false);
      setLastCompletedRide(null); 
  }, []);

  const handleEmergencyReset = async () => {
    if (!firestore || !user?.uid) return;
    try {
      setIsRequesting(true);
      await updateDoc(doc(firestore, 'users', user.uid), { activeRideId: null });
      handleReset();
      toast({ title: 'Estado de viaje reiniciado (DEV Mode)' });
    } catch (e: any) {
      console.error("Reset error", e);
      toast({ variant: 'destructive', title: 'Error al reiniciar estado', description: e.message });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCancelSearching = async () => {
    const rideId = effectiveRide?.id;
    if (rideId && firebaseApp) {
      try {
        setIsCancelling(true);
        const functions = getFunctions(firebaseApp, 'us-central1');
        const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
        await cancelRideV1({ rideId, reason: 'cancelled_by_passenger' });
        toast({ title: 'Búsqueda cancelada' });
        handleReset(); // Reset on success
      } catch (e: any) {
        console.error("Error cancelling ride:", e);
        toast({ variant: 'destructive', title: 'Error al cancelar', description: e.message });
      } finally {
        setIsCancelling(false);
      }
    } else {
        // If no rideId but in searching state (ghost ride or pending), still reset local UI
        handleReset();
    }
  };

  useEffect(() => {
    if (origin && destination) setSheetState('expanded');
  }, [origin, destination]);

  // Auto-expand the ride panel when driver accepts (status leaves 'searching')
  useEffect(() => {
    if (effectiveRide && effectiveRide.status !== 'searching' && effectiveRide.status !== 'completed' && !lastCompletedRide) {
      setSheetState('expanded');
    }
  }, [effectiveRide?.status, lastCompletedRide]);

  if (userError) return <div className="p-4"><VamoIcon name="alert-triangle" /> Error: {userError.message}</div>;

  // UX: Block initial form flash while profile is loading
  if (userIsLoading && !hasActiveRide) {
    return (
        <div className="h-[100dvh] w-full flex items-center justify-center bg-[#121212]">
            <VamoIcon name="loader" className="h-8 w-8 animate-spin text-indigo-500/50" />
        </div>
    );
  }

  // Use the persisted completed ride to render the receipt
  if (lastCompletedRide) {
    console.log('🏁 [RIDE_PAGE_BRANCH] Branch: PERSISTENT_RECEIPT', { id: lastCompletedRide.id });
    return (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4 overflow-y-auto">
            <RideReceipt 
                ride={lastCompletedRide} 
                onClose={() => { 
                    console.log('🏁 [RECEIPT_CLOSE] Close button clicked');
                    handleReset(); 
                    // SPA Navigation to avoid re-initializing the whole session via layout spinner
                    router.replace('/dashboard/ride');
                }} 
                className="max-w-md"
            />
        </div>
    );
  }

  if (hasActiveRide) {
    console.log('🏁 [RIDE_PAGE_BRANCH] Branch: ACTIVE_RIDE', { id: effectiveRide?.id || 'pending', status: effectiveRide?.status || 'searching' });
  } else {
    // If no active ride and no receipt, we MUST land here (Initial Form)
    console.log('🏁 [RIDE_PAGE_BRANCH] Branch: INITIAL_FORM');
  }

  const isSearching = hasActiveRide && (!effectiveRide || effectiveRide.status === 'searching');
  const hasExpressBenefit = profile?.benefits?.expressAvailable === true;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden" style={{ backgroundColor: '#121212' }}>
      {/* ─── DEBUG EMERGENCY RESET (DEV ONLY) ─── */}
      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={handleEmergencyReset}
          className="fixed top-4 left-4 z-[100] px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-[10px] font-bold text-red-500/50 border border-red-900/20 rounded-lg backdrop-blur-md transition-all active:scale-95"
          title="Reset Active Ride State (DEV ONLY)"
        >
          DEBUG RESET
        </button>
      )}
      
      {/* ─── STABLE MAP COMPONENT ─── */}
      {mapsAvailable && (
        <div className="absolute inset-0 z-0" onClick={() => setSheetState('collapsed')}>
          <Map
            defaultCenter={{ lat: origin?.lat || -43.3002, lng: origin?.lng || -65.1023 }}
            defaultZoom={15}
            disableDefaultUI={true}
            gestureHandling="greedy"
            mapId="passenger-unified-map"
          >
            {(!hasActiveRide || isSearching) && origin && (
              <AdvancedMarker position={origin}>
                <div className="rounded-full p-2.5 shadow-2xl border-2 border-white" style={{ backgroundColor: '#6366f1' }}>
                  <VamoIcon name="map-pin" className="h-4 w-4 text-white" />
                </div>
              </AdvancedMarker>
            )}
            {(!hasActiveRide || isSearching) && destination && (
              <AdvancedMarker position={destination}>
                <div className="rounded-full p-2.5 shadow-2xl border-2 border-white/30" style={{ backgroundColor: '#1a1a1a' }}>
                  <VamoIcon name="flag" className="h-4 w-4 text-white" />
                </div>
              </AdvancedMarker>
            )}

            {hasActiveRide && effectiveRide && <RideStatus ride={effectiveRide} onNewRide={handleReset} />}
          </Map>
        </div>
      )}

      {/* ─── BRANCH 1: INITIAL STATE (FORM) ─── */}
      {!hasActiveRide && (
        <>
            <button
                onClick={handleUseCurrentLocation}
                disabled={isGeocoding}
                className="absolute top-[env(safe-area-inset-top,16px)] right-4 z-20 mt-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center border border-white/10 transition-all active:scale-95"
                style={{ backgroundColor: '#1a1a1a' }}
            >
                {isGeocoding ? <VamoIcon name="loader" className="h-5 w-5 animate-spin text-white/70" /> : <VamoIcon name="crosshair" className="h-5 w-5 text-white/70" />}
            </button>

            <Dialog open={isMapSelectorOpen} onOpenChange={setMapSelectorOpen}>
                <DialogContent className="max-w-3xl h-[85vh] p-0 gap-0 sm:rounded-[2rem] overflow-hidden">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Seleccionar ubicación</DialogTitle>
                        <DialogDescription>
                            Mueve el mapa para seleccionar el punto exacto de origen o destino.
                        </DialogDescription>
                    </DialogHeader>
                    <MapSelector initialLocation={mapEditingField === 'origin' ? origin : destination} onLocationSelect={handleMapSelect} />
                </DialogContent>
            </Dialog>

            <div
                className="absolute bottom-0 inset-x-0 z-10 flex flex-col prevent-overscroll md:bottom-auto md:top-4 md:left-4 md:right-auto md:w-[400px] md:!max-h-[80vh] md:!rounded-3xl"
                style={{
                    maxHeight: sheetState === 'expanded' ? '72dvh' : '32dvh',
                    transition: 'max-height 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
                    backgroundColor: '#1a1a1a',
                    borderTopLeftRadius: '24px',
                    borderTopRightRadius: '24px',
                    boxShadow: '0 -16px 48px rgba(0,0,0,0.5)',
                }}
            >
                <div className="flex justify-center pt-3 pb-1 cursor-pointer shrink-0 md:hidden" onClick={() => setSheetState(s => s === 'collapsed' ? 'expanded' : 'collapsed')}>
                    <div className="w-12 h-1 rounded-full bg-zinc-700/40" />
                </div>
                <div className="flex items-center justify-between px-5 pb-3 shrink-0">
                    <h1 className="text-xl font-bold text-white tracking-tight">¿A dónde vamos?</h1>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,16px)+16px)] flex flex-col gap-6 text-white">
                    <div className="flex flex-col gap-3">
                        <div className="relative flex items-center group/field">
                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-indigo-500/50" />
                            <PlaceAutocompleteInput 
                                onPlaceSelect={setOrigin} 
                                defaultValue={origin?.address || ''} 
                                placeholder="Punto de partida" 
                                iconName="map-pin" 
                                iconClassName="text-indigo-400 scale-110"
                                className="border-none rounded-xl h-14 pl-12 shadow-none text-white bg-white/[0.07] placeholder:text-white/25 focus:bg-white/[0.1] transition-all" 
                            />
                            <button 
                                onClick={() => handleOpenMapSelector('origin')}
                                className="absolute right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 transition-all active:scale-95"
                            >
                                <VamoIcon name="map" className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="relative flex items-center group/field">
                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-emerald-500/50" />
                            <PlaceAutocompleteInput 
                                onPlaceSelect={setDestination} 
                                defaultValue={destination?.address || ''} 
                                placeholder="¿A dónde vas?" 
                                iconName="flag" 
                                iconClassName="text-emerald-400 scale-110"
                                className="border-none rounded-xl h-14 pl-12 shadow-none text-white bg-white/[0.07] placeholder:text-white/25 focus:bg-white/[0.1] transition-all" 
                            />
                            <button 
                                onClick={() => handleOpenMapSelector('destination')}
                                className="absolute right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 transition-all active:scale-95"
                            >
                                <VamoIcon name="map" className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {sheetState === 'expanded' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            {hasExpressBenefit && (
                                <div className="p-4 bg-violet-600/10 border border-violet-600/20 rounded-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2">
                                    <div className="bg-violet-600 p-1.5 rounded-lg">
                                    <VamoIcon name="zap" className="h-4 w-4 text-white" />
                                    </div>
                                    <div>
                                    <p className="text-sm font-bold text-white leading-none">Beneficio Express disponible</p>
                                    <p className="text-[10px] text-violet-400 font-medium">Viajá con tarifa reducida</p>
                                    </div>
                                </div>
                                <Button 
                                    variant="outline"
                                    onClick={() => setUseExpress(!useExpress)}
                                    className={cn(
                                    "w-full h-11 rounded-xl font-bold transition-all active:scale-95",
                                    useExpress 
                                        ? "bg-violet-600 border-violet-600 text-white hover:bg-violet-700 shadow-[0_0_20px_rgba(124,58,237,0.3)]" 
                                        : "bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-white"
                                    )}
                                >
                                    {useExpress ? (
                                    <span className="flex items-center gap-2">
                                        <VamoIcon name="check-circle" className="h-4 w-4" />
                                        Beneficio aplicado
                                    </span>
                                    ) : "Aplicar descuento Express"}
                                </Button>
                                </div>
                            )}

                            {/* PREFERENCIA DE GÉNERO */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Preferencia de Conductor</span>
                                <div className="flex gap-2 p-1 bg-zinc-900/60 rounded-2xl border border-white/5">
                                    <button 
                                        type="button"
                                        onClick={() => setPreferredDriverGender(null)}
                                        className={cn(
                                            "flex-1 h-10 rounded-xl text-[11px] font-bold transition-all uppercase tracking-tight",
                                            preferredDriverGender === null ? "bg-zinc-800 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        Cualquiera
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setPreferredDriverGender('male')}
                                        className={cn(
                                            "flex-1 h-10 rounded-xl text-[11px] font-bold transition-all uppercase tracking-tight",
                                            preferredDriverGender === 'male' ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        Hombre
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setPreferredDriverGender('female')}
                                        className={cn(
                                            "flex-1 h-10 rounded-xl text-[11px] font-bold transition-all uppercase tracking-tight",
                                            preferredDriverGender === 'female' ? "bg-pink-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        Mujer
                                    </button>
                                </div>
                            </div>
                            {estimatedPrice && (
                                <div className="flex flex-col items-center py-2 animate-in fade-in zoom-in-95 duration-500">
                                    <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 mb-1 uppercase">Tarifa estimada</span>
                                    <div className="relative">
                                        <div className="absolute inset-0 blur-2xl bg-indigo-500/5 opacity-20" />
                                        <p className="relative text-5xl font-black text-white tracking-tighter">
                                            ${estimatedPrice}
                                            {selectedPromoId && ridePromos.find(p => p.id === selectedPromoId) && (
                                                <span className="absolute -top-1 -right-8 bg-amber-500 text-[8px] px-1.5 py-0.5 rounded-full border border-white/20 animate-bounce font-black uppercase tracking-tighter">
                                                    DESC
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    
                                    {ridePromos.length > 0 && (
                                        <div className="mt-4 w-full space-y-2">
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 ml-1">Promoción Aplicada</span>
                                            {ridePromos.map(promo => (
                                                <button 
                                                    key={promo.id}
                                                    onClick={() => setSelectedPromoId(selectedPromoId === promo.id ? null : promo.id!)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between p-3 rounded-2xl border transition-all active:scale-[0.98]",
                                                        selectedPromoId === promo.id 
                                                            ? "bg-amber-500/10 border-amber-500/50 text-amber-500" 
                                                            : "bg-zinc-900/60 border-white/5 text-zinc-500 hover:border-white/10"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "p-2 rounded-xl",
                                                            selectedPromoId === promo.id ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"
                                                        )}>
                                                            <Gift className="h-3.5 w-3.5" />
                                                        </div>
                                                        <div className="text-left">
                                                            <p className="text-[11px] font-black uppercase tracking-tight leading-none mb-1">{promo.name}</p>
                                                            <p className="text-[9px] font-medium opacity-70 leading-tight">{promo.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-xs font-black">
                                                            {promo.reward.type === 'fixed' ? `$${promo.reward.value}` : `-${promo.reward.value}%`}
                                                        </p>
                                                        {selectedPromoId === promo.id ? (
                                                            <VamoIcon name="check-circle" className="h-3 w-3 mt-1 ml-auto" />
                                                        ) : (
                                                            <div className="w-3 h-3 rounded-full border-2 border-zinc-800 mt-1 ml-auto" />
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {useExpress && (
                                        <div 
                                            onClick={() => setIsLegalInfoOpen(true)}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full cursor-pointer hover:bg-blue-500/20 transition-all mt-4 mb-2"
                                        >
                                            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Asistencia VamO Incluida</span>
                                        </div>
                                    )}
                                    
                                    <Button 
                                        onClick={handleRequestRide} 
                                        disabled={!origin || !destination || isRequesting || !eligibility.isEligible} 
                                        className={cn(
                                            "w-full h-16 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] mt-4",
                                            (!origin || !destination || isRequesting || !eligibility.isEligible)
                                                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50' 
                                                : 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 text-white shadow-[0_12px_40px_rgba(79,70,229,0.3)] border-t border-white/10'
                                        )}
                                    >
                                        {isRequesting ? <VamoIcon name="loader" className="animate-spin mr-2" /> : null}
                                        {isRequesting ? 'Procesando...' : (!eligibility.isEligible ? eligibility.reason : 'Pedir Viaje')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={isLegalInfoOpen} onOpenChange={setIsLegalInfoOpen}>
                <DialogContent className="max-w-md h-[80vh] flex flex-col p-0 gap-0 sm:rounded-[2rem] overflow-hidden bg-zinc-900 border-zinc-800 text-white">
                    <DialogHeader className="p-6 border-b border-white/5 shrink-0 text-left">
                        <div className="flex items-center gap-3 mb-1">
                            <Scale className="h-5 w-5 text-indigo-400" />
                            <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">Marco de Asistencia VamO PRO</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-zinc-500 italic">Vigente: Chubut, Argentina</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-6 text-sm text-zinc-300 space-y-6 leading-relaxed">
                        <section className="space-y-2">
                            <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">Asistencia Express</h3>
                            <p>Para viajes en vehículos particulares (Express), VamO brinda una <strong>asistencia económica limitada por reintegro</strong> ante lesiones accidentales. No es un seguro formal.</p>
                        </section>
                        <section className="space-y-2">
                             <p>Este beneficio ya está incluido en tu viaje por haber aceptado los Términos y Condiciones generales de la plataforma al momento de tu registro.</p>
                        </section>
                    </div>
                    <div className="p-6 bg-zinc-900/80 backdrop-blur-md border-t border-white/5 shrink-0">
                        <Button 
                            onClick={() => setIsLegalInfoOpen(false)}
                            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold h-12 rounded-xl"
                        >
                            Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
      )}

      {/* ─── BRANCH 2: ACTIVE RIDE / SEARCHING (UNIFIED BOTTOM SHEET) ─── */}
      {hasActiveRide && (
        <div
          className="absolute inset-x-0 bottom-0 md:bottom-auto md:top-4 md:left-4 md:right-auto md:w-[400px] z-10"
          style={{
            maxHeight: sheetState === 'collapsed' ? '56px' : '72dvh',
            transition: 'max-height 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
            overflow: 'hidden',
            backgroundColor: '#1a1a1a',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            boxShadow: '0 -16px 48px rgba(0,0,0,0.5)',
          }}
        >
          {/* Drag handle — tap to expand/collapse */}
          <div
            className="flex justify-center items-center pt-3 pb-2 cursor-pointer md:hidden"
            onClick={() => setSheetState(s => s === 'collapsed' ? 'expanded' : 'collapsed')}
          >
            <div className="w-12 h-1 rounded-full bg-zinc-700/60" />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(72dvh - 32px)' }}>
            {isSearching ? (
               <PassengerSearchingSheet 
                 serviceType={useExpress ? 'express' : 'normal'} 
                 estimatedPrice={estimatedPrice} 
                 originAddress={origin?.address || effectiveRide?.origin?.address || ''} 
                 destinationAddress={destination?.address || effectiveRide?.destination?.address || ''} 
                 onCancel={handleCancelSearching} 
                 isCancelling={isCancelling}
               />
            ) : (
               effectiveRide ? <RideStatus ride={effectiveRide} onNewRide={handleReset} /> : null
            )}
          </div>
        </div>
      )}

    </main>
  );
}

export default function RidePage() {
    return <RidePageContent />
}
