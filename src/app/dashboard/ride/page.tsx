'use client';

import { useState, useEffect, useCallback } from 'react';
import { ServiceSelector } from '@/components/ServiceSelector';
import { PriceDisplay } from '@/components/PriceDisplay';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Ride, Place, ServiceType } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription as AlertDescriptionUI } from '@/components/ui/alert';
import MapSelector from '@/components/MapSelector';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { Label } from '@/components/ui/label';
import { useMapsAvailability } from '@/components/MapsProvider';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import PlaceAutocompleteInput from '@/components/PlaceAutocompleteInput';
import { FINAL_RIDE_STATES, ACTIVE_RIDE_STATES } from '@/lib/ride-status';

function RidePageContent() {
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { user, profile, loading: userIsLoading, error: userError } = useUser();
  const { toast } = useToast();
  
  const { mapsAvailable } = useMapsAvailability();
  const geocodingLib = useMapsLibrary('geocoding');

  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>('premium');
  const [isMapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [mapEditingField, setMapEditingField] = useState<'origin' | 'destination' | null>(null);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isCalculatingFare, setIsCalculatingFare] = useState(false);

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
        const newOriginCoords = { lat: latitude, lng: longitude };
        geocoder.geocode({ location: newOriginCoords }, (results, status) => {
          if (status === 'OK' && results?.[0]) {
            const address = results[0].formatted_address.split(',')[0];
            setOrigin({
              address: address,
              lat: latitude,
              lng: longitude,
            });
            toast({ title: 'Ubicación actual establecida' });
          } else {
            setOrigin({
              address: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`,
              lat: latitude,
              lng: longitude,
            });
            toast({ variant: 'destructive', title: 'No se pudo encontrar la dirección' });
          }
          setIsGeocoding(false);
        });
      },
      () => {
        toast({
          variant: 'destructive',
          title: 'No se pudo obtener la ubicación',
          description: 'Asegurate de tener los permisos de ubicación activados para este sitio.',
        });
        setIsGeocoding(false);
      }
    );
  }, [geocoder, toast]);

  const activeRideRef = useMemoFirebase(() => {
    if (!firestore || !profile?.activeRideId) {
      return null;
    }
    return doc(firestore, 'rides', profile.activeRideId);
  }, [firestore, profile?.activeRideId]);


  const { data: ride, isLoading: rideIsLoading, error: rideError } = useDoc<Ride>(activeRideRef);

  useEffect(() => {
    const calculateFare = async () => {
        if (destination?.lat == null || destination?.lng == null || origin?.lat == null || origin?.lng == null || !firebaseApp) {
            setEstimatedPrice(null);
            return;
        }
        setIsCalculatingFare(true);
        try {
            const functions = getFunctions(firebaseApp, 'us-central1');
            const createRideFunc = httpsCallable(functions, 'createRideV1'); 
            const result = await createRideFunc({ origin, destination, serviceType, dryRun: true });
            const data = result.data as any;
            if(data.estimatedTotal) {
                setEstimatedPrice(data.estimatedTotal);
            }
        } catch (e) {
            console.error("Fare calculation error", e);
            setEstimatedPrice(null);
        } finally {
            setIsCalculatingFare(false);
        }
    }
    calculateFare();
  }, [destination, origin, serviceType, firebaseApp]);
  
  const handleRequestRide = async () => {
    if (isRequesting || !firebaseApp || !user || !profile) return;

    if (origin?.lat == null || origin?.lng == null || destination?.lat == null || destination?.lng == null) {
      toast({ variant: 'destructive', title: 'Error', description: 'Origen y destino son requeridos.' });
      return;
    }

    setIsRequesting(true);

    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const createRide = httpsCallable(functions, 'createRideV1');
        
        const result = await createRide({
            origin,
            destination,
            serviceType,
            dryRun: false
        });

        const data = result.data as { success?: boolean; rideId?: string; error?: any };

        if (!data.success || !data.rideId) {
            throw new Error(data.error?.message || data.error || 'La función del backend no pudo crear el viaje.');
        }

        toast({ title: '¡Buscando conductor!', description: 'Tu pedido fue enviado.' });
    } catch (error: any) {
      console.error("Error requesting ride:", error);
      toast({ 
          variant: 'destructive', 
          title: 'Error al pedir viaje', 
          description: error.message || 'No se pudo solicitar el viaje.' 
      });
    } finally { setIsRequesting(false); }
  };
  
  const handleOpenMapSelector = (field: 'origin' | 'destination') => {
      if (!mapsAvailable) {
          toast({
              variant: 'destructive',
              title: 'Mapas deshabilitados',
              description: 'La funcionalidad de mapas no está disponible por un error de configuración.'
          });
          return;
      }
      setMapEditingField(field);
      setMapSelectorOpen(true);
  };

  const handleMapSelect = (place: Place) => {
      if (mapEditingField === 'origin') {
          setOrigin(place);
      } else if (mapEditingField === 'destination') {
          setDestination(place);
      }
      setMapSelectorOpen(false);
      setMapEditingField(null);
  };
  
  const handleReset = useCallback(() => { 
      setOrigin(null);
      setDestination(null); 
      setEstimatedPrice(null); 
  }, []);

  const loading = userIsLoading || (!!profile && !!profile.activeRideId && rideIsLoading);

  // --- START: ROBUST RENDER LOGIC ---

  // PRIMARY GATE: If there is no user, profile, or active ride ID, show the request form.
  if (!profile || !profile.activeRideId) {
    return (
      <>
        {mapsAvailable && (
          <Dialog open={isMapSelectorOpen} onOpenChange={setMapSelectorOpen}>
            <DialogContent className="max-w-3xl h-[80vh] p-0 gap-0">
              <DialogHeader className="sr-only">
                <DialogTitle>Seleccionar ubicación en el mapa</DialogTitle>
                <DialogDescription>
                  Mové el mapa para ubicar el pin en la dirección deseada y luego confirmá tu selección.
                </DialogDescription>
              </DialogHeader>
              <MapSelector
                  initialLocation={mapEditingField === 'origin' ? origin : destination}
                  onLocationSelect={handleMapSelect}
              />
            </DialogContent>
          </Dialog>
        )}

        {!mapsAvailable && (
          <Alert variant="destructive" className="mb-4">
              <VamoIcon name="alert-triangle" className="h-4 w-4" />
              <AlertTitle>Funcionalidad de Mapas Deshabilitada</AlertTitle>
              <AlertDescriptionUI>
                  La API Key de Google Maps no está configurada correctamente. No se puede seleccionar una ubicación en el mapa. Por favor, revisá la consola del navegador para más detalles y contactá a soporte.
              </AlertDescriptionUI>
          </Alert>
        )}

        <>
          <div className="m-4 p-4 rounded-xl shadow-lg bg-card space-y-4">
              <div className="space-y-2">
                  <Label htmlFor="origin-input">Origen</Label>
                  <div className="flex items-center gap-2">
                      <PlaceAutocompleteInput
                          onPlaceSelect={(place) => setOrigin(place)}
                          defaultValue={origin?.address || ''}
                          placeholder={isGeocoding ? 'Buscando...' : 'Escribe la dirección de origen'}
                          iconName="map-pin"
                          iconClassName="text-green-500"
                      />
                      <Button
                          size="icon"
                          variant="outline"
                          onClick={handleUseCurrentLocation}
                          aria-label="Usar ubicación actual"
                          disabled={isGeocoding}
                      >
                          {isGeocoding ? (
                              <VamoIcon name="loader" className="animate-spin" />
                          ) : (
                              <VamoIcon name="crosshair" className="h-4 w-4" />
                          )}
                      </Button>
                      <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleOpenMapSelector('origin')}
                          aria-label="Elegir en el mapa"
                      >
                          <VamoIcon name="map" className="h-4 w-4" />
                      </Button>
                  </div>
              </div>
              <div className="space-y-2">
                  <Label htmlFor="destination-input">Destino</Label>
                   <div className="flex items-center gap-2">
                      <PlaceAutocompleteInput
                          onPlaceSelect={(place) => setDestination(place)}
                          defaultValue={destination?.address || ''}
                          placeholder="Escribe el destino o elige en el mapa"
                          iconName="flag"
                          iconClassName="text-red-500"
                      />
                      <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleOpenMapSelector('destination')}
                          aria-label="Elegir en el mapa"
                      >
                          <VamoIcon name="map" className="h-4 w-4" />
                      </Button>
                  </div>
              </div>
          </div>
          <ServiceSelector 
              value={serviceType} 
              onChange={(val) => setServiceType(val as ServiceType)}
          />
          <PriceDisplay price={isCalculatingFare ? -1 : estimatedPrice ?? 0} isNight={false} />
        </>

        <div className="m-4">
            <Button onClick={handleRequestRide} className="w-full" size="lg" disabled={origin?.lat == null || origin?.lng == null || destination?.lat == null || destination?.lng == null || isRequesting || !mapsAvailable || isGeocoding || isCalculatingFare}>
              {isRequesting ? 'Enviando...' : 'Pedir Viaje'}
            </Button>
        </div>
      </>
    );
  }

  // If we reach here, we know there IS an activeRideId.
  // Now we can handle loading, error, and different ride states.

  if (loading) {
    return (
      <main className="flex flex-col justify-center items-center h-64">
        <VamoIcon name="car" className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4 text-muted-foreground">Cargando tu viaje...</p>
      </main>
    );
  }

  if (rideError || userError) {
    return (
      <div className="m-4 space-y-4">
        <Alert variant="destructive">
          <VamoIcon name="alert-triangle" className="h-4 w-4" />
          <AlertTitle>Error de Sincronización</AlertTitle>
          <AlertDescriptionUI>
            Hubo un problema al cargar tus datos.
            { (rideError || userError)?.message }
          </AlertDescriptionUI>
        </Alert>
      </div>
    );
  }
  
  if (ride && ride.status === 'completed') {
    return (
      <FinishedRideSummary
        ride={ride}
        onClose={() => {
          handleReset();
          window.location.href = '/dashboard/ride';
        }}
        userRole="passenger"
      />
    );
  }

  if (ride && ACTIVE_RIDE_STATES.includes(ride.status)) {
    return <RideStatus ride={ride} onNewRide={handleReset} />;
  }

  // Si ya no está cargando, existe activeRideId en cliente pero el ride no existe/no llegó,
  // asumimos estado stale y volvemos al formulario normal.
  if (!loading && profile?.activeRideId && !ride) {
    return (
      <>
        {mapsAvailable && (
          <Dialog open={isMapSelectorOpen} onOpenChange={setMapSelectorOpen}>
            <DialogContent className="max-w-3xl h-[80vh] p-0 gap-0">
              <DialogHeader className="sr-only">
                <DialogTitle>Seleccionar ubicación en el mapa</DialogTitle>
                <DialogDescription>
                  Mové el mapa para ubicar el pin en la dirección deseada y luego confirmá tu selección.
                </DialogDescription>
              </DialogHeader>
              <MapSelector
                initialLocation={mapEditingField === 'origin' ? origin : destination}
                onLocationSelect={handleMapSelect}
              />
            </DialogContent>
          </Dialog>
        )}

        {!mapsAvailable && (
          <Alert variant="destructive" className="mb-4">
            <VamoIcon name="alert-triangle" className="h-4 w-4" />
            <AlertTitle>Funcionalidad de Mapas Deshabilitada</AlertTitle>
            <AlertDescriptionUI>
              La API Key de Google Maps no está configurada correctamente. No se puede seleccionar una ubicación en el mapa.
            </AlertDescriptionUI>
          </Alert>
        )}

        <div className="m-4 p-4 rounded-xl shadow-lg bg-card space-y-4">
          <div className="space-y-2">
            <Label htmlFor="origin-input">Origen</Label>
            <div className="flex items-center gap-2">
              <PlaceAutocompleteInput
                onPlaceSelect={(place) => setOrigin(place)}
                defaultValue={origin?.address || ''}
                placeholder={isGeocoding ? 'Buscando...' : 'Escribe la dirección de origen'}
                iconName="map-pin"
                iconClassName="text-green-500"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleUseCurrentLocation}
                aria-label="Usar ubicación actual"
                disabled={isGeocoding}
              >
                {isGeocoding ? (
                  <VamoIcon name="loader" className="animate-spin" />
                ) : (
                  <VamoIcon name="crosshair" className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => handleOpenMapSelector('origin')}
                aria-label="Elegir en el mapa"
              >
                <VamoIcon name="map" className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination-input">Destino</Label>
            <div className="flex items-center gap-2">
              <PlaceAutocompleteInput
                onPlaceSelect={(place) => setDestination(place)}
                defaultValue={destination?.address || ''}
                placeholder="Escribe el destino o elige en el mapa"
                iconName="flag"
                iconClassName="text-red-500"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => handleOpenMapSelector('destination')}
                aria-label="Elegir en el mapa"
              >
                <VamoIcon name="map" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <ServiceSelector
          value={serviceType}
          onChange={(val) => setServiceType(val as ServiceType)}
        />

        <PriceDisplay price={isCalculatingFare ? -1 : estimatedPrice ?? 0} isNight={false} />

        <div className="m-4">
          <Button
            onClick={handleRequestRide}
            className="w-full"
            size="lg"
            disabled={
              origin?.lat == null ||
              origin?.lng == null ||
              destination?.lat == null ||
              destination?.lng == null ||
              isRequesting ||
              !mapsAvailable ||
              isGeocoding ||
              isCalculatingFare
            }
          >
            {isRequesting ? 'Enviando...' : 'Pedir Viaje'}
          </Button>
        </div>
      </>
    );
  }

  // Fallback for unexpected states while an activeRideId exists.
  return (
    <main className="flex flex-col justify-center items-center h-64">
        <VamoIcon name="car" className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4 text-muted-foreground">Sincronizando estado del viaje...</p>
    </main>
  );
}

export default function RidePage() {
    return <RidePageContent />
}
