
// @/components/MapSelector.tsx
'use client';
import { useState, useMemo } from 'react';
import { Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { Button } from './ui/button';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';

interface MapSelectorProps {
    onLocationSelect: (place: Place) => void;
}

const formatAddress = (fullAddress: string): string => {
    const parts = fullAddress.split(',');
    if (parts.length > 1) {
        return parts[0];
    }
    return fullAddress;
}

export default function MapSelector({ onLocationSelect }: MapSelectorProps) {
    // Default center to Rawson, Chubut
    const defaultCenter = { lat: -43.3001, lng: -65.1023 }; 
    const [center, setCenter] = useState(defaultCenter);
    const [address, setAddress] = useState('Mové el mapa para seleccionar');

    const handleConfirm = () => {
        onLocationSelect({
            address,
            lat: center.lat,
            lng: center.lng,
        });
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
                    onCenterChanged={(e) => setCenter({ lat: e.detail.center.lat, lng: e.detail.center.lng })}
                >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                         <div className="relative">
                            <VamoIcon name="map-pin" className="h-10 w-10 text-primary drop-shadow-lg" />
                         </div>
                    </div>
                </Map>

                <AddressDisplay center={center} onAddressFound={setAddress} />
            </div>

            <div className="p-4 border-t bg-background">
                <div className="text-center mb-4">
                    <p className="text-sm text-muted-foreground">Dirección seleccionada:</p>
                    <p className="font-semibold">{address}</p>
                </div>
                <Button onClick={handleConfirm} className="w-full" size="lg">
                    Confirmar Destino
                </Button>
            </div>
        </div>
    );
}


function AddressDisplay({ center, onAddressFound }: { center: {lat: number, lng: number}, onAddressFound: (address: string) => void }) {
    const map = useMap();
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

    useState(() => {
        if (map && !geocoder) {
            setGeocoder(new google.maps.Geocoder());
        }
    });

    useMemo(() => {
        if (geocoder && center) {
            geocoder.geocode({ location: center }, (results, status) => {
                if (status === 'OK' && results?.[0]) {
                    onAddressFound(formatAddress(results[0].formatted_address));
                } else {
                    onAddressFound('No se pudo encontrar la dirección');
                }
            });
        }
    }, [geocoder, center, onAddressFound]);

    return null; // This component does not render anything itself
}
