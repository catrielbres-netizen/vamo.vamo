// src/components/PlaceAutocomplete.tsx
'use client';
import { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Input } from './ui/input';
import { Place } from '@/lib/types';

interface PlaceAutocompleteProps {
    onPlaceSelect: (place: Place | null) => void;
}

export function PlaceAutocomplete({ onPlaceSelect }: PlaceAutocompleteProps) {
    const places = useMapsLibrary('places');
    const inputRef = useRef<HTMLInputElement>(null);
    const autocomplete = useRef<google.maps.places.Autocomplete>();

    useEffect(() => {
        if (!places || !inputRef.current) return;

        const options = {
            fields: ['geometry', 'name', 'formatted_address'],
        };

        autocomplete.current = new places.Autocomplete(inputRef.current, options);
        
        autocomplete.current.addListener('place_changed', () => {
            const place = autocomplete.current?.getPlace();
            if (place?.geometry?.location && place.formatted_address) {
                onPlaceSelect({
                    address: place.formatted_address,
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                });
            } else {
                onPlaceSelect(null);
            }
        });
        
        return () => {
             // Clear listeners on cleanup
            if (autocomplete.current) {
                google.maps.event.clearInstanceListeners(autocomplete.current);
            }
        }

    }, [places, onPlaceSelect]);
    
    return (
        <Input
            ref={inputRef}
            type="text"
            placeholder="Ingresá una dirección"
            className="h-8"
        />
    );
};
