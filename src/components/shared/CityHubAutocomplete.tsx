'use client';

import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useActiveCities, ActiveCity } from '@/hooks/useActiveCities';

interface CityHubAutocompleteProps {
  value: string;
  onChange: (cityKey: string, cityData: ActiveCity | null) => void;
  disabled?: boolean;
}

export function CityHubAutocomplete({ value, onChange, disabled = false }: CityHubAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const { cities, loading } = useActiveCities({ context: 'driver_recruitment' });

  // Add search strings for better matching
  const searchableCities = useMemo(() => {
    return cities.map(city => ({
      ...city,
      searchString: `${city.name.toLowerCase()} ${city.province?.toLowerCase() || ''} ${city.cityKey}`
    }));
  }, [cities]);

  const selectedCity = cities.find((city) => city.cityKey === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          {loading ? (
            <span className="text-muted-foreground">Cargando ciudades...</span>
          ) : selectedCity ? (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{selectedCity.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Seleccionar ciudad...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command filter={(value, search) => {
          const item = searchableCities.find(c => c.cityKey === value);
          if (!item) return 0;
          const match = item.searchString.includes(search.toLowerCase());
          return match ? 1 : 0;
        }}>
          <CommandInput placeholder="Buscar ciudad..." />
          <CommandList>
            <CommandEmpty>No se encontraron ciudades activas.</CommandEmpty>
            <CommandGroup>
              {searchableCities.map((city) => (
                <CommandItem
                  key={city.cityKey}
                  value={city.cityKey}
                  onSelect={(currentValue) => {
                    onChange(currentValue, city);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === city.cityKey ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{city.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {city.province ? `${city.province} • ` : ''}{city.cityKey}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
