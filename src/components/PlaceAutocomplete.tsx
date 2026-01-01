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
import { MapPin } from 'lucide-react';

interface PlaceAutocompleteProps {
  onPlaceSelect: (place: Place | null) => void;
  defaultValue?: string;
  className?: string;
}

export function PlaceAutocomplete({ onPlaceSelect, defaultValue = '', className }: PlaceAutocompleteProps) {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: 'AR' }, // Restringe a Argentina
    },
    debounce: 300,
    defaultValue,
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

  return (
    <div ref={wrapperRef} className={cn('w-full relative', className)}>
      <Command shouldFilter={false} className="h-auto rounded-lg border border-input bg-transparent">
        <CommandInput
          value={value}
          onValueChange={setValue}
          disabled={!ready}
          placeholder="Ingresá una dirección..."
          className="h-8"
          onFocus={() => setIsFocused(true)}
        />
        {isFocused && status === 'OK' && (
          <CommandList className="absolute top-full left-0 z-10 w-full mt-1 bg-card border rounded-lg shadow-md">
            {data.map(({ place_id, description }) => (
              <CommandItem key={place_id} onSelect={() => handleSelect(description)}>
                <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
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
