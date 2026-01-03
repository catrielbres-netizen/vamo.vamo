
'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const newAutocomplete = new places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'AR' },
        fields: ['formatted_address', 'geometry'],
    });

    setAutocomplete(newAutocomplete);
  }, [places]);

  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
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

    return () => {
        if(listener) {
            listener.remove();
        }
    }
  }, [autocomplete, onPlaceSelect]);

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
        className="pl-9"
      />
    </div>
  );
}
