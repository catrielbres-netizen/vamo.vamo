// src/components/PlaceAutocompleteInput.tsx
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
  className?: string;
  icon?: React.ReactNode;
  onIconClick?: () => void;
  iconTooltip?: string;
  /** Inicializa el mapa con un pin */
  initialLatLng?: { lat: number; lng: number };
}

export default function PlaceAutocompleteInput({
  onPlaceSelect,
  placeholder,
  defaultValue,
  className,
  icon,
  onIconClick,
  initialLatLng,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [marker, setMarker] = useState<google.maps.Marker | null>(null);
  const places = useMapsLibrary('places');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  /** Inicializa Geocoder */
  useEffect(() => {
    if (typeof google !== 'undefined' && !geocoder) {
      setGeocoder(new google.maps.Geocoder());
    }
  }, [geocoder]);

  /** Autocomplete */
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

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Actualiza input + marker en mapa si existe
      if (mapRef.current) {
        if (!marker) {
          const m = new google.maps.Marker({ position: { lat, lng }, map: mapRef.current });
          setMarker(m);
        } else {
          marker.setPosition({ lat, lng });
        }
        mapRef.current.panTo({ lat, lng });
      }

      onPlaceSelect({
        address: place.formatted_address,
        lat,
        lng,
      });
    });

    return () => listener.remove();
  }, [places, onPlaceSelect, marker]);

  /** Inicializa el mapa con un pin si se pasó initialLatLng */
  useEffect(() => {
    if (!initialLatLng || typeof google === 'undefined' || !document.getElementById('place-map')) return;

    const map = new google.maps.Map(document.getElementById('place-map')!, {
      center: initialLatLng,
      zoom: 15,
    });
    mapRef.current = map;

    const m = new google.maps.Marker({ position: initialLatLng, map });
    setMarker(m);

    // Click en mapa → actualizar marker + reverse geocode
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !geocoder) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      // mover marker
      if (marker) {
        marker.setPosition({ lat, lng });
      } else {
        const newMarker = new google.maps.Marker({ position: { lat, lng }, map });
        setMarker(newMarker);
      }

      // reverse geocoding
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        let address = '';
        if (status === 'OK' && results?.[0]) {
          address = results[0].formatted_address;
        }

        // actualizar input y state
        if (inputRef.current) inputRef.current.value = address;
        onPlaceSelect({ address, lat, lng });
      });
    });
  }, [initialLatLng, geocoder, marker, onPlaceSelect]);

  useEffect(() => {
    if (inputRef.current && defaultValue !== undefined) {
      inputRef.current.value = defaultValue;
    }
  }, [defaultValue]);

  return (
    <div className="relative w-full flex flex-col gap-2">
      <div className="relative flex items-center">
        <VamoIcon
          name="search"
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          placeholder={placeholder || 'Ingresá una dirección'}
          defaultValue={defaultValue}
          className={className ? `${className} pl-9` : 'pl-9'}
        />
        {icon && onIconClick && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 h-8 w-8"
            onClick={onIconClick}
          >
            {icon}
          </Button>
        )}
      </div>

      {/* Contenedor del mapa */}
      {initialLatLng && <div
        id="place-map"
        className="w-full h-64 rounded-md border"
      />}
    </div>
  );
}
