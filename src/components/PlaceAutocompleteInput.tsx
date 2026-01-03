
'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface Props {
  onPlaceSelect: (place: Place | null) => void;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
}

export default function PlaceAutocompleteInput({ onPlaceSelect, placeholder, defaultValue, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');
  
  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'AR' },
        fields: ['formatted_address', 'geometry'],
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location || !place.formatted_address) {
        onPlaceSelect(null);
        return;
      }

      onPlaceSelect({
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    });

    return () => {
      // It's important to remove the listener when the component unmounts
      // to avoid memory leaks.
      if (listener) {
          listener.remove();
      }
    }
  }, [places, onPlaceSelect]);

  return (
    <div className="relative">
      <VamoIcon
        name="map-pin"
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        placeholder={placeholder || 'Ingresá una dirección'}
        defaultValue={defaultValue}
        className={className ? `${className} pl-9` : "pl-9"}
      />
    </div>
  );
}
