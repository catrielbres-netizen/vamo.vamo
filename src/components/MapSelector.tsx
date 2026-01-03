
// @/components/MapSelector.tsx
'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Map, useMap } from '@vis.gl/react-google-maps';
import { Button } from './ui/button';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';
import { useDebounce } from '@/hooks/use-debounce';

interface MapSelectorProps {
    onLocationSelect: (place: Place) => void;
}

const formatAddress = (fullAddress: string): string => {
    const parts = fullAddress.split(',');
    return parts.length > 1 ? parts[0] : fullAddress;
}

export default function MapSelector({ onLocationSelect }: MapSelectorProps) {
    const defaultCenter = { lat: -43.3001, lng: -65.1023 }; 
    const [pinLocation, setPinLocation] = useState(defaultCenter);
    const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

    const handleConfirm = () => {
        if (selectedPlace) {
            onLocationSelect(selectedPlace);
        }
    };
    
    return (
        <div className="flex-1 flex flex-col h-full">
            <div className="flex-1 relative">
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={15}
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    mapId="map-selector-map"
                    onCenterChanged={(e) => setPinLocation({ lat: e.detail.center.lat, lng: e.detail.center.lng })}
                >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <VamoIcon name="map-pin" className="h-10 w-10 text-primary drop-shadow-lg" />
                    </div>
                </Map>

                <ReverseGeocoder center={pinLocation} onPlaceFound={setSelectedPlace} />
            </div>

            <div className="p-4 border-t bg-background">
                <div className="text-center mb-4 min-h-[3rem]">
                    <p className="text-sm text-muted-foreground">Dirección seleccionada:</p>
                    <p className="font-semibold">{selectedPlace?.address || 'Moviendo el mapa...'}</p>
                </div>
                <Button onClick={handleConfirm} className="w-full" size="lg" disabled={!selectedPlace}>
                    Confirmar Destino
                </Button>
            </div>
        </div>
    );
}

function ReverseGeocoder({ center, onPlaceFound }: { center: {lat: number, lng: number}, onPlaceFound: (place: Place) => void }) {
    const map = useMap();
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
    const debouncedCenter = useDebounce(center, 500); // Debounce to avoid excessive API calls

    useEffect(() => {
        if (map && !geocoder) {
            setGeocoder(new google.maps.Geocoder());
        }
    }, [map, geocoder]);

    const performGeocode = useCallback(() => {
        if (geocoder && debouncedCenter) {
            geocoder.geocode({ location: debouncedCenter }, (results, status) => {
                if (status === 'OK' && results?.[0]) {
                    onPlaceFound({
                        address: formatAddress(results[0].formatted_address),
                        lat: debouncedCenter.lat,
                        lng: debouncedCenter.lng
                    });
                } else {
                    console.error('Geocode was not successful for the following reason: ' + status);
                }
            });
        }
    }, [geocoder, debouncedCenter, onPlaceFound]);

    useEffect(() => {
        performGeocode();
    }, [performGeocode]);

    return null; // This component does not render anything itself
}

