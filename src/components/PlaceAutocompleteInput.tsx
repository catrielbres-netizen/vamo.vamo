
// @/components/PlaceAutocompleteInput.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Button } from './ui/button';

interface Props {
  onPlaceSelect: (place: Place | null) => void;
  placeholder?: string;
  value?: string; // Changed from defaultValue to value for controlled component
  className?: string;
  icon?: React.ReactNode;
  onIconClick?: () => void;
  iconTooltip?: string;
}

const formatAddress = (fullAddress: string): string => {
    const parts = fullAddress.split(',');
    if (parts.length > 1) {
        return parts[0];
    }
    return fullAddress;
}

export default function PlaceAutocompleteInput({ 
  onPlaceSelect, 
  placeholder, 
  value, 
  className,
  icon,
  onIconClick
}: Props) {
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
        address: formatAddress(place.formatted_address),
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    });

    return () => {
      if (listener) {
          listener.remove();
      }
    }
  }, [places, onPlaceSelect]);
  
  // This effect ensures the input field updates if the `value` prop changes
  // (e.g., when a location is selected from the map).
  useEffect(() => {
    if (inputRef.current && value !== undefined) {
      inputRef.current.value = value;
    }
  }, [value]);


  return (
    <div className="relative flex items-center">
      <VamoIcon
        name="search"
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        placeholder={placeholder || 'Ingresá una dirección'}
        defaultValue={value} // Use defaultValue to set initial text
        className={className ? `${className} pl-9` : "pl-9"}
        // The `onChange` is handled by the Places API, so we don't need a React one
      />
      {icon && onIconClick && (
        <Button variant="ghost" size="icon" className="absolute right-1 h-8 w-8" onClick={onIconClick}>
          {icon}
        </Button>
      )}
    </div>
  );
}

