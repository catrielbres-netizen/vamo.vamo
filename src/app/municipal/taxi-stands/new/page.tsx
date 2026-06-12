'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, setDoc, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { v4 as uuidv4 } from 'uuid';
import { MapsProvider } from '@/components/MapsProvider';
import { Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Helper component to render coverage radius Circle
function MapCircle({ center, radius }: { center: { lat: number, lng: number }, radius: number }) {
    const map = useMap();
    const circleRef = useRef<google.maps.Circle | null>(null);

    useEffect(() => {
        if (!map) return;

        if (!circleRef.current) {
            circleRef.current = new google.maps.Circle({
                map,
                strokeColor: '#1D7CFF',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#1D7CFF',
                fillOpacity: 0.15,
                center,
                radius,
            });
        } else {
            circleRef.current.setCenter(center);
            circleRef.current.setRadius(radius);
        }

        return () => {
            if (circleRef.current) {
                circleRef.current.setMap(null);
                circleRef.current = null;
            }
        };
    }, [map, center, radius]);

    return null;
}

// Google Places Autocomplete component
function PlacesAutocomplete({
    onPlaceSelect,
    defaultValue = '',
    placeholder = 'Buscar dirección en Google Maps...',
    className = '',
    onUserType
}: {
    onPlaceSelect: (address: string, lat: number, lng: number, placeId?: string) => void;
    defaultValue?: string;
    placeholder?: string;
    className?: string;
    onUserType: () => void;
}) {
    const placesLib = useMapsLibrary('places');
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState(defaultValue);
    const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

    useEffect(() => {
        setInputValue(defaultValue);
    }, [defaultValue]);

    useEffect(() => {
        if (!placesLib || !inputRef.current) return;

        const autocompleteInstance = new placesLib.Autocomplete(inputRef.current, {
            fields: ['formatted_address', 'geometry.location', 'name', 'place_id'],
            componentRestrictions: { country: 'ar' },
        });

        setAutocomplete(autocompleteInstance);
    }, [placesLib]);

    useEffect(() => {
        if (!autocomplete) return;

        const listener = autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry?.location) {
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                const address = place.formatted_address || place.name || '';
                const placeId = place.place_id || '';

                setInputValue(address);
                onPlaceSelect(address, lat, lng, placeId);
            }
        });

        return () => {
            listener.remove();
        };
    }, [autocomplete, onPlaceSelect]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        onUserType();
    };

    return (
        <div className="relative flex items-center w-full">
            <VamoIcon name="search" className="absolute left-3.5 h-4 w-4 text-zinc-500" />
            <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder={placeholder}
                className={className}
            />
        </div>
    );
}

// Inner Form Component
function NewTaxiStandForm() {
    const { user } = useUser();
    const { cityKey, cityName, cityCenter } = useMunicipalContext();
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();

    const defaultCoords = getCityDefaultLocation(profile?.cityKey);

    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [placeId, setPlaceId] = useState('');
    const [geocoded, setGeocoded] = useState(false);
    const [radiusMeters, setRadiusMeters] = useState(500);
    const [representativeName, setRepresentativeName] = useState('');
    const [representativePhone, setRepresentativePhone] = useState('');
    const [representativeEmail, setRepresentativeEmail] = useState('');
    const [status, setStatus] = useState<'active' | 'pending' | 'suspended'>('active');
    const [saving, setSaving] = useState(false);

    // Map centering & marker positioning states
    const [mapCenter, setMapCenter] = useState(defaultCoords);
    const [markerPosition, setMarkerPosition] = useState(defaultCoords);

    const geocodingLib = useMapsLibrary('geocoding');
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

    useEffect(() => {
        if (geocodingLib && !geocoder) {
            setGeocoder(new geocodingLib.Geocoder());
        }
    }, [geocodingLib, geocoder]);

    // Pre-populate coordinates with city center when loaded
    useEffect(() => {
        if (cityCenter) {
            const coords = { lat: cityCenter.lat, lng: cityCenter.lng };
            setMapCenter(coords);
            setMarkerPosition(coords);
            setLat(cityCenter.lat.toString());
            setLng(cityCenter.lng.toString());
            setGeocoded(true); // City center is naturally a geocoded reference
        }
    }, [cityCenter]);

    const handlePlaceSelect = (selectedAddress: string, selectedLat: number, selectedLng: number, selectedPlaceId?: string) => {
        setAddress(selectedAddress);
        setLat(selectedLat.toString());
        setLng(selectedLng.toString());
        setPlaceId(selectedPlaceId || '');
        setGeocoded(true);

        const newCoords = { lat: selectedLat, lng: selectedLng };
        setMapCenter(newCoords);
        setMarkerPosition(newCoords);
    };

    const handleUserType = () => {
        setGeocoded(false);
    };

    const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            const newLat = e.latLng.lat();
            const newLng = e.latLng.lng();

            setLat(newLat.toString());
            setLng(newLng.toString());
            setMarkerPosition({ lat: newLat, lng: newLng });

            if (geocoder) {
                geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results, statusResult) => {
                    if (statusResult === 'OK' && results?.[0]) {
                        const formatted = results[0].formatted_address;
                        const pId = results[0].place_id;
                        setAddress(formatted);
                        setPlaceId(pId);
                        setGeocoded(true);
                        toast({
                            title: 'Ubicación ajustada',
                            description: `Dirección actualizada: ${formatted}`
                        });
                    }
                });
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !cityKey || !user) return;

        // Validations
        if (!geocoded || !lat || !lng) {
            toast({
                variant: 'destructive',
                title: 'Dirección no geocodificada',
                description: 'Seleccioná una dirección válida del mapa para ubicar la parada.'
            });
            return;
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            toast({
                variant: 'destructive',
                title: 'Coordenadas inválidas',
                description: 'Latitud y longitud deben ser números válidos.'
            });
            return;
        }

        if (radiusMeters <= 0) {
            toast({
                variant: 'destructive',
                title: 'Radio inválido',
                description: 'El radio de cobertura debe ser mayor a 0 metros.'
            });
            return;
        }

        setSaving(true);
        const standId = 'stand_' + uuidv4().substring(0, 8);

        try {
            await setDoc(doc(firestore, 'taxi_stands', standId), {
                cityKey,
                name,
                address,
                location: new GeoPoint(latitude, longitude),
                placeId: placeId || null,
                geocodedBy: 'google_places',
                radiusMeters,
                status,
                representativeName,
                representativePhone,
                representativeEmail,
                createdByMunicipalUid: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            toast({
                title: '¡Parada creada!',
                description: `La parada "${name}" se creó correctamente en ${cityName}.`
            });
            router.push('/municipal/taxi-stands');
        } catch (err: any) {
            console.error("Error creating taxi stand:", err);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo guardar la parada digital en la base de datos.'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl">
                <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                    <CardTitle className="text-lg text-white">Datos de la Parada</CardTitle>
                    <CardDescription>Información general y ubicación de control geográfico</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-zinc-400 text-xs font-bold uppercase">Nombre de la Parada</Label>
                        <Input
                            id="name"
                            required
                            placeholder="Ej: Parada Terminal Rawson, Parada Hospital"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:ring-[#1D7CFF]"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-bold uppercase">Buscar dirección en Google Maps</Label>
                        <PlacesAutocomplete
                            defaultValue={address}
                            onPlaceSelect={handlePlaceSelect}
                            onUserType={handleUserType}
                            className="w-full h-12 pl-10 pr-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#1D7CFF] text-sm"
                        />
                        <p className="text-xs text-zinc-500 italic mt-1">
                            La ubicación exacta define qué viajes entran al panel de esta parada.
                        </p>
                    </div>

                    {/* Google Map Preview */}
                    <div className="w-full h-80 rounded-xl overflow-hidden border border-white/10 relative mt-4">
                        <Map
                            defaultZoom={15}
                            center={mapCenter}
                            gestureHandling="greedy"
                            disableDefaultUI={true}
                            mapId="muni-new-stand-map"
                        >
                            <Marker
                                position={markerPosition}
                                draggable={true}
                                onDragEnd={handleMarkerDragEnd}
                            />
                            <MapCircle center={markerPosition} radius={radiusMeters} />
                        </Map>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="latitude" className="text-zinc-400 text-xs font-bold uppercase">Latitud</Label>
                            <Input
                                id="latitude"
                                required
                                readOnly
                                placeholder="-43.3000"
                                value={lat}
                                className="h-12 bg-white/[0.02] border-white/5 text-zinc-400 focus:ring-0 font-mono select-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="longitude" className="text-zinc-400 text-xs font-bold uppercase">Longitud</Label>
                            <Input
                                id="longitude"
                                required
                                readOnly
                                placeholder="-65.1000"
                                value={lng}
                                className="h-12 bg-white/[0.02] border-white/5 text-zinc-400 focus:ring-0 font-mono select-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="radius" className="text-zinc-400 text-xs font-bold uppercase">Radio de Cobertura (metros)</Label>
                            <Input
                                id="radius"
                                type="number"
                                required
                                min="50"
                                max="2000"
                                value={radiusMeters}
                                onChange={e => setRadiusMeters(parseInt(e.target.value) || 500)}
                                className="h-12 bg-white/5 border-white/10 text-white focus:ring-[#1D7CFF]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status" className="text-zinc-400 text-xs font-bold uppercase">Estado Inicial</Label>
                            <select
                                id="status"
                                value={status}
                                onChange={e => setStatus(e.target.value as any)}
                                className="w-full h-12 bg-white/5 border border-white/10 rounded-lg px-3 text-white text-sm focus:ring-[#1D7CFF] focus:outline-none"
                            >
                                <option value="active" className="bg-zinc-900 text-white">Activo</option>
                                <option value="pending" className="bg-zinc-900 text-white">Pendiente</option>
                                <option value="suspended" className="bg-zinc-900 text-white">Suspendido</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl">
                <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                    <CardTitle className="text-lg text-white">Representante de la Parada</CardTitle>
                    <CardDescription>Persona de contacto o encargado</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rep_name" className="text-zinc-400 text-xs font-bold uppercase">Nombre Completo</Label>
                        <Input
                            id="rep_name"
                            placeholder="Ej: Juan Pérez"
                            value={representativeName}
                            onChange={e => setRepresentativeName(e.target.value)}
                            className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:ring-[#1D7CFF]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="rep_phone" className="text-zinc-400 text-xs font-bold uppercase">Teléfono</Label>
                            <Input
                                id="rep_phone"
                                placeholder="Ej: +54 280 4123456"
                                value={representativePhone}
                                onChange={e => setRepresentativePhone(e.target.value)}
                                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:ring-[#1D7CFF]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rep_email" className="text-zinc-400 text-xs font-bold uppercase">Email</Label>
                            <Input
                                id="rep_email"
                                type="email"
                                placeholder="Ej: juan.perez@email.com"
                                value={representativeEmail}
                                onChange={e => setRepresentativeEmail(e.target.value)}
                                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:ring-[#1D7CFF]"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <Button
                    type="button"
                    onClick={() => router.push('/municipal/taxi-stands')}
                    variant="ghost"
                    className="h-12 px-6 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5"
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    disabled={saving}
                    className="h-12 px-8 bg-[#1D7CFF] hover:bg-[#1D7CFF]/90 text-white font-black rounded-xl shadow-lg shadow-[#1D7CFF]/20 transition-all active:scale-[0.98]"
                >
                    {saving ? (
                        <><VamoIcon name="loader" className="mr-2 h-5 w-5 animate-spin" /> Guardando...</>
                    ) : (
                        <><VamoIcon name="save" className="mr-2 h-5 w-5" /> Crear Parada</>
                    )}
                </Button>
            </div>
        </form>
    );
}

// Main Page Wrapper
export default function NewTaxiStandPage() {
    const { cityName } = useMunicipalContext();

    return (
        <MapsProvider>
            <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Nueva Parada</h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Cargá una nueva parada digital oficial para la ciudad de <span className="text-indigo-400 font-bold">{cityName}</span>
                    </p>
                </div>

                <NewTaxiStandForm />
            </div>
        </MapsProvider>
    );
}
