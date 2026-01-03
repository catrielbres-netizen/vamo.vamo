'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';

interface Props {
  onPlaceSelect: (place: Place | null) => void;
  placeholder?: string;
  className?: string;
}

export function PlaceAutocomplete({ onPlaceSelect, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!window.google || !inputRef.current) return;

    autocompleteRef.current = new google.maps.places.Autocomplete(
      inputRef.current,
      {
        componentRestrictions: { country: 'AR' },
        fields: ['formatted_address', 'geometry'],
      }
    );

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace();
      if (!place?.geometry?.location || !place.formatted_address) {
        onPlaceSelect(null);
        return;
      }

      onPlaceSelect({
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    });

    // Cleanup listener on unmount
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    }
  }, [onPlaceSelect]);

  return (
    <div className="relative w-full">
      <VamoIcon
        name="map-pin"
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        placeholder={placeholder || 'Ingresá una dirección'}
        className={`pl-9 ${className}`}
      />
    </div>
  );
}
