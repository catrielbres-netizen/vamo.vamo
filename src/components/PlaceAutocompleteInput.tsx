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
  defaultValue?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  icon?: React.ReactNode;
  onIconClick?: () => void;
  iconTooltip?: string;
}

export default function PlaceAutocompleteInput({
  onPlaceSelect,
  placeholder,
  defaultValue,
  value,
  onChange,
  className,
  icon,
  onIconClick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'AR' }, // Restrict to Argentina
      fields: ['formatted_address', 'geometry.location'],
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

    return () => listener.remove();
  }, [places, onPlaceSelect]);
  
  useEffect(() => {
    if (inputRef.current && value !== undefined && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);


  return (
    <div className="relative w-full">
      <VamoIcon
        name="search"
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        placeholder={placeholder || 'Ingresá una dirección'}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        className={className ? `${className} pl-9` : 'pl-9'}
      />
      {icon && onIconClick && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          onClick={onIconClick}
        >
          {icon}
        </Button>
      )}
    </div>
  );
}
