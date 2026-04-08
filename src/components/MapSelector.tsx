
// @/components/MapSelector.tsx
'use client';
import React from 'react';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Button } from './ui/button';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';
import { useDebounce } from '@/hooks/use-debounce';

interface MapSelectorProps {
    onLocationSelect: (place: Place) => void;
    initialLocation?: Place | null;
}

const formatAddress = (fullAddress: string): string => {
    const parts = fullAddress.split(',');
    return parts.length > 1 ? parts[0] : fullAddress;
}

export default function MapSelector({ onLocationSelect, initialLocation }: MapSelectorProps) {
    const defaultCenter = { lat: -43.3002, lng: -65.1023 };
    const center = initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : defaultCenter;
    const [pinLocation, setPinLocation] = useState(center);
    const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
    const [isMoving, setIsMoving] = useState(false);

    const handleConfirm = () => {
        if (selectedPlace) {
            onLocationSelect(selectedPlace);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0d0d0d]">
            <div className="flex-1 relative overflow-hidden">
                <Map
                    defaultCenter={center}
                    defaultZoom={15}
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    mapId="map-selector-map"
                    onCenterChanged={(e) => setPinLocation({ lat: e.detail.center.lat, lng: e.detail.center.lng })}
                    onDragstart={() => setIsMoving(true)}
                    onIdle={() => setIsMoving(false)}
                >
                    {/* Fixed Center Pin */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
                        {/* The Pin Icon */}
                        <div
                            className={`transition-all duration-300 ease-out transform ${isMoving ? '-translate-y-12 scale-110 drop-shadow-2xl' : '-translate-y-8 scale-100'
                                }`}
                        >
                            <div className="relative">
                                {/* Glow effect */}
                                <div className={`absolute inset-0 bg-indigo-500 blur-xl opacity-0 transition-opacity duration-300 ${isMoving ? 'opacity-40' : ''}`} />

                                <div className="relative bg-[#121212] p-2 rounded-2xl border-2 border-indigo-500/50 shadow-2xl">
                                    <VamoIcon name="map-pin" className="h-8 w-8 text-indigo-400" />
                                </div>
                                {/* The "Tip" of the pin */}
                                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#121212] border-r-2 border-b-2 border-indigo-500/50 rotate-45" />
                            </div>
                        </div>

                        {/* The Shadow on the ground */}
                        <div
                            className={`w-6 h-1.5 bg-black/40 rounded-full blur-sm transition-all duration-300 ${isMoving ? 'scale-50 opacity-20' : 'scale-100 opacity-60'
                                }`}
                        />
                    </div>
                </Map>

                <ReverseGeocoder center={pinLocation} onPlaceFound={setSelectedPlace} />

                {/* Floating controls inside map if needed */}
                <div className="absolute bottom-6 right-4 flex flex-col gap-2">
                    <button
                        onClick={() => { }} // Could add my location here
                        className="w-12 h-12 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-95 transition-all"
                    >
                        <VamoIcon name="crosshair" className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="p-6 border-t border-white/5 bg-[#121212] backdrop-blur-2xl">
                <div className="space-y-1 mb-6">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest text-center">Punto de Partida</p>
                    <div className="flex items-center justify-center gap-2">
                        {isMoving ? (
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                <span className="text-zinc-600 text-sm font-medium">Buscando dirección...</span>
                            </div>
                        ) : (
                            <p className="text-white text-lg font-bold tracking-tight text-center truncate max-w-xs transition-all animate-in fade-in duration-500">
                                {selectedPlace?.address || 'Elegí una ubicación'}
                            </p>
                        )}
                    </div>
                </div>
                <Button
                    onClick={handleConfirm}
                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98]"
                    size="lg"
                    disabled={!selectedPlace || isMoving}
                >
                    PROXIMO PASO
                </Button>
            </div>
        </div>
    );
}

function ReverseGeocoder({ center, onPlaceFound }: { center: { lat: number, lng: number }, onPlaceFound: (place: Place) => void }) {
    const map = useMap();
    const geocodingLib = useMapsLibrary('geocoding');
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
    const debouncedCenter = useDebounce(center, 500); // Debounce to avoid excessive API calls

    useEffect(() => {
        // GUARD: Ensure geocoding library and its services are fully loaded.
        if (geocodingLib && geocodingLib.Geocoder && !geocoder) {
            setGeocoder(new geocodingLib.Geocoder());
        }
    }, [geocodingLib, geocoder]);

    const lastRequestId = useRef(0);

    const performGeocode = useCallback(() => {
        if (geocoder && debouncedCenter) {
            const currentId = ++lastRequestId.current;

            geocoder.geocode({ location: debouncedCenter }, (results, status) => {
                if (currentId !== lastRequestId.current) return;

                if (status === 'OK' && results?.[0]) {
                    const result = results[0];
                    const city = result.address_components.find(c => 
                        c.types.includes('locality') || 
                        c.types.includes('administrative_area_level_2')
                    )?.long_name;

                    onPlaceFound({
                        address: formatAddress(result.formatted_address),
                        lat: result.geometry.location.lat(),
                        lng: result.geometry.location.lng(),
                        city
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
