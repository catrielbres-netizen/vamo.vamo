// src/components/PlaceAutocomplete.tsx
'use client';
import { Input } from './ui/input';
import { Place } from '@/lib/types';

interface PlaceAutocompleteProps {
    onPlaceSelect: (place: Place | null) => void;
}

// THIS IS A MOCKED COMPONENT.
// The original uses Google Maps Places API, but it was disabled to avoid API errors.
export function PlaceAutocomplete({ onPlaceSelect }: PlaceAutocompleteProps) {
    
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const address = event.target.value;
        if (address) {
            // Simulate a Place object for the non-maps version
            onPlaceSelect({
                address: address,
                lat: 0, // Mock coordinates
                lng: 0, // Mock coordinates
            });
        } else {
            onPlaceSelect(null);
        }
    };
    
    return (
        <Input
            onChange={handleChange}
            type="text"
            placeholder="Ingresá una dirección"
            className="h-8"
        />
    );
};
