// @/components/PlaceAutocompleteInput.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Input } from '@/components/ui/input';
import { Place } from '@/lib/types';
import { VamoIcon } from './VamoIcon';
import { resolveCity, getCityDefaultLocation } from '@/lib/city-resolution';

interface PlaceAutocompleteInputProps {
  onPlaceSelect: (place: Place | null) => void;
  defaultValue?: string;
  placeholder?: string;
  iconName: string;
  iconClassName?: string;
  className?: string;
  onFocus?: () => void;
  cityKey?: string;
}

// NOTE: This component relies on the Google Maps Places Autocomplete API, which may incur costs.
// It has been implemented as per user request for address suggestion functionality.
// The previous implementation was deprecated to avoid these costs.
export default function PlaceAutocompleteInput({
  onPlaceSelect,
  defaultValue = '',
  placeholder,
  iconName,
  iconClassName = '',
  className = '',
  onFocus,
  cityKey,
}: PlaceAutocompleteInputProps) {
  const places = useMapsLibrary('places');
  const maps = useMapsLibrary('maps');
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    if (!places || !inputRef.current || !maps) return;

    const autocompleteInstance = new places.Autocomplete(inputRef.current, {
      fields: ['formatted_address', 'geometry.location', 'name', 'address_components'],
      componentRestrictions: { country: 'ar' }, // Restrict to Argentina
    });

    if (cityKey && maps) {
        const center = getCityDefaultLocation(cityKey);
        const circle = new maps.Circle({
            center: center,
            radius: 20000, // 20km bias
        });
        autocompleteInstance.setBounds(circle.getBounds());
    }

    setAutocomplete(autocompleteInstance);
    setGeocoder(new google.maps.Geocoder());

  }, [places, maps]);

  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener('place_changed', async () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        
        const resolution = await resolveCity(lat, lng, (place.address_components as google.maps.GeocoderAddressComponent[]) || undefined, geocoder || undefined);

        const selectedPlace: Place = {
          address: place.formatted_address || place.name || '',
          lat,
          lng,
          city: resolution.city
        };
        setInputValue(selectedPlace.address);
        onPlaceSelect(selectedPlace);
      } else {
        // If user types something that's not an address and hits enter, clear selection
        onPlaceSelect(null);
      }
    });

    return () => listener.remove();
  }, [autocomplete, onPlaceSelect, geocoder]);
  
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
    <div className={`relative flex items-center w-full ${className}`}>
      <VamoIcon name={iconName} className={`absolute left-3 h-4 w-4 ${iconClassName}`} />
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-9 bg-transparent border-none shadow-none focus-visible:ring-0"
        onFocus={onFocus}
      />
    </div>
  );
}
