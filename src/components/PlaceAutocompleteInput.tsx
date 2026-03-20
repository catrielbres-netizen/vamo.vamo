// @/components/PlaceAutocompleteInput.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Input } from '@/components/ui/input';
import { Place } from '@/lib/types';
import { VamoIcon } from './VamoIcon';

interface PlaceAutocompleteInputProps {
  onPlaceSelect: (place: Place | null) => void;
  defaultValue?: string;
  placeholder?: string;
  iconName: 'map-pin' | 'flag';
  iconClassName: string;
}

// NOTE: This component relies on the Google Maps Places Autocomplete API, which may incur costs.
// It has been implemented as per user request for address suggestion functionality.
// The previous implementation was deprecated to avoid these costs.
export default function PlaceAutocompleteInput({
  onPlaceSelect,
  defaultValue = '',
  placeholder,
  iconName,
  iconClassName
}: PlaceAutocompleteInputProps) {
  const places = useMapsLibrary('places');
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocompleteInstance = new places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry.location', 'name'],
      componentRestrictions: { country: 'ar' }, // Restrict to Argentina
    });
    setAutocomplete(autocompleteInstance);

  }, [places]);

  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const selectedPlace = {
          address: place.formatted_address || place.name || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        setInputValue(selectedPlace.address);
        onPlaceSelect(selectedPlace);
      } else {
        // If user types something that's not an address and hits enter, clear selection
        onPlaceSelect(null);
      }
    });

    return () => listener.remove();
  }, [autocomplete, onPlaceSelect]);
  
  // Update internal input value if the parent's default value changes (e.g. on reset or current location)
  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (e.target.value === '') {
          onPlaceSelect(null);
      }
  }

  return (
    <div className="relative flex items-center w-full">
      <VamoIcon name={iconName} className={`absolute left-3 h-4 w-4 ${iconClassName}`} />
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-9"
      />
    </div>
  );
}
