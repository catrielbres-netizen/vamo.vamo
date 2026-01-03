// @/components/PlaceAutocompleteInput.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { VamoIcon } from './VamoIcon';
import { Place } from '@/lib/types';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface Props {
  onPlaceSelect: (place: Place | null) => void;
  placeholder?: string;
  value?: string;
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
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  
  useEffect(() => {
    if (places && !geocoder) {
      setGeocoder(new places.Geocoder());
    }
  }, [places, geocoder]);

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
        listener.remove();
    }
  }, [places, onPlaceSelect]);
  
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
        defaultValue={value}
        className={className ? `${className} pl-9` : "pl-9"}
      />
      {icon && onIconClick && (
        <Button variant="ghost" size="icon" className="absolute right-1 h-8 w-8" onClick={onIconClick}>
          {icon}
        </Button>
      )}
    </div>
  );
}