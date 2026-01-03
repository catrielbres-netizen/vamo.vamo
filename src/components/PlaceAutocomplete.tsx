'use client';

import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from 'use-places-autocomplete';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import { Place } from '@/lib/types';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { VamoIcon } from './VamoIcon';
import { GOOGLE_MAPS_API_KEY } from '@/lib/googleMaps';
import { Input } from './ui/input';


interface PlaceAutocompleteProps {
  onPlaceSelect: (place: Place | null) => void;
  defaultValue?: string;
  className?: string;
  placeholder?: string;
}

export function PlaceAutocomplete({ onPlaceSelect, defaultValue = '', className, placeholder }: PlaceAutocompleteProps) {
  const apiKey = GOOGLE_MAPS_API_KEY;

  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: 'AR' },
    },
    debounce: 300,
    defaultValue,
    initOnMount: !!apiKey, 
  });

  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const handleSelect = async (address: string) => {
    setValue(address, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0]);
      onPlaceSelect({ address, lat, lng });
    } catch (error) {
      console.error('Error: ', error);
      onPlaceSelect(null);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        clearSuggestions();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef, clearSuggestions]);

  if (!apiKey) {
       return (
         <div className="relative w-full">
            <VamoIcon name="map-pin" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="text"
              placeholder="Buscador no disponible. Falta API Key."
              disabled
              className="pl-9"
            />
         </div>
       )
  }

  return (
    <div ref={wrapperRef} className={cn('w-full relative', className)}>
      <Command shouldFilter={false} className="h-auto rounded-lg border border-input bg-transparent overflow-visible">
        <div className="flex items-center" cmdk-input-wrapper="">
          <VamoIcon name="map-pin" className="mr-2 ml-3 h-4 w-4 shrink-0 opacity-50" />
          <CommandInput
            value={value}
            onValueChange={setValue}
            disabled={!ready}
            placeholder={placeholder || (!ready ? "Cargando..." : "Ingresá una dirección...")}
            className="h-9 border-none focus:ring-0"
            onFocus={() => setIsFocused(true)}
          />
        </div>
        {isFocused && status === 'OK' && (
          <CommandList className="absolute top-full left-0 z-10 w-full mt-1 bg-card border rounded-lg shadow-md">
            {data.map(({ place_id, description }) => (
              <CommandItem key={place_id} onSelect={() => handleSelect(description)}>
                {description}
              </CommandItem>
            ))}
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>
          </CommandList>
        )}
      </Command>
    </div>
  );
}
