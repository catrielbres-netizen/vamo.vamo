'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, GeoPoint, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { getCityDefaultLocation } from '@/lib/city-resolution';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MapsProvider } from '@/components/MapsProvider';
import { Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

interface TaxiStand {
    id: string;
    cityKey: string;
    name: string;
    address?: string;
    location: GeoPoint;
    placeId?: string;
    geocodedBy?: string;
    radiusMeters: number;
    status: 'active' | 'suspended' | 'pending';
    representativeName?: string;
    representativePhone?: string;
    representativeEmail?: string;
    operatorUid?: string;
    hasOperator?: boolean;
    createdAt?: any;
}

interface LinkedDriver {
    uid: string;
    name: string;
    email?: string;
    phone?: string;
    municipalStatus?: string;
    profileCompleted?: boolean;
}

interface StationRide {
    id: string;
    status: string;
    stationDispatchStatus?: string;
    origin: { address: string };
    destination: { address: string };
    createdAt?: any;
    driverName?: string;
    passengerName?: string;
}

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

// Inner Content Component
function TaxiStandDetailContent() {
    const { profile } = useUser();
    const params = useParams();
    const router = useRouter();
    const firestore = useFirestore();
    const { toast } = useToast();
    const { cityKey: municipalCityKey, isGlobalAdmin, loading: contextLoading } = useMunicipalContext();

    const standId = params.standId as string;

    const [stand, setStand] = useState<TaxiStand | null>(null);
    const [drivers, setDrivers] = useState<LinkedDriver[]>([]);
    const [rides, setRides] = useState<StationRide[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Edit form states
    const [editName, setEditName] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editLat, setEditLat] = useState('');
    const [editLng, setEditLng] = useState('');
    const [editPlaceId, setEditPlaceId] = useState('');
    const [editGeocoded, setEditGeocoded] = useState(true);
    const [editRadius, setEditRadius] = useState(500);
    const [editStatus, setEditStatus] = useState<'active' | 'pending' | 'suspended'>('active');
    const [editHasOperator, setEditHasOperator] = useState<boolean>(true);
    const [editRepName, setEditRepName] = useState('');
    const [editRepPhone, setEditRepPhone] = useState('');
    const [editRepEmail, setEditRepEmail] = useState('');

    // Map states
    const [mapCenter, setMapCenter] = useState(getCityDefaultLocation(profile?.cityKey));
    const [markerPosition, setMarkerPosition] = useState(getCityDefaultLocation(profile?.cityKey));

    // Reverse geocoding services
    const geocodingLib = useMapsLibrary('geocoding');
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

    useEffect(() => {
        if (geocodingLib && !geocoder) {
            setGeocoder(new geocodingLib.Geocoder());
        }
    }, [geocodingLib, geocoder]);

    // Operator generation & management states
    const [operatorEmail, setOperatorEmail] = useState('');
    const [generatingOperator, setGeneratingOperator] = useState(false);
    const [tempCredentials, setTempCredentials] = useState<{
        loginUrl: string;
        email: string;
        password: string;
    } | null>(null);

    const [operatorUser, setOperatorUser] = useState<any | null>(null);
    const [resettingPassword, setResettingPassword] = useState(false);
    const [resetCredentials, setResetCredentials] = useState<{
        loginUrl: string;
        email: string;
        password: string;
    } | null>(null);
    const [togglingSuspension, setTogglingSuspension] = useState(false);

    // Bulletproof coordinates helper functions to prevent rendering crashes
    const getLat = (loc: any) => {
        if (!loc) return 0;
        if (typeof loc.latitude === 'number') return loc.latitude;
        if (typeof loc.lat === 'number') return loc.lat;
        return 0;
    };

    const getLng = (loc: any) => {
        if (!loc) return 0;
        if (typeof loc.longitude === 'number') return loc.longitude;
        if (typeof loc.lng === 'number') return loc.lng;
        return 0;
    };


    const loadData = async () => {
        if (!firestore || !standId) return;
        setLoading(true);
        try {
            // 1. Fetch Taxi Stand
            const standDoc = await getDoc(doc(firestore, 'taxi_stands', standId));
            if (!standDoc.exists()) {
                toast({
                    variant: 'destructive',
                    title: 'No encontrado',
                    description: 'La parada digital especificada no existe.'
                });
                router.push('/municipal/taxi-stands');
                return;
            }
            const standData = standDoc.data() as TaxiStand;

            // Check authorization
            if (!isGlobalAdmin && standData.cityKey?.toLowerCase() !== municipalCityKey?.toLowerCase()) {
                toast({
                    variant: 'destructive',
                    title: 'No autorizado',
                    description: 'No tienes permisos para visualizar paradas de otra ciudad.'
                });
                router.push('/municipal/taxi-stands');
                return;
            }

            setStand({ ...standData, id: standDoc.id });
            setEditName(standData.name || '');
            setEditAddress(standData.address || '');

            const coords = {
                lat: getLat(standData.location) || getCityDefaultLocation(profile?.cityKey).lat,
                lng: getLng(standData.location) || getCityDefaultLocation(profile?.cityKey).lng
            };
            setEditLat(coords.lat.toString());
            setEditLng(coords.lng.toString());
            setEditPlaceId(standData.placeId || '');
            setEditRadius(standData.radiusMeters || 500);
            setEditStatus(standData.status || 'active');
            
            const hasOp = standData.hasOperator !== false; // Fallback to true if missing
            setEditHasOperator(hasOp);
            
            setEditRepName(standData.representativeName || '');
            setEditRepPhone(standData.representativePhone || '');
            setEditRepEmail(standData.representativeEmail || '');
            setOperatorEmail(standData.representativeEmail || '');

            setMapCenter(coords);
            setMarkerPosition(coords);
            setEditGeocoded(true);

            // Fetch Operator User Profile from 'users' collection if operatorUid exists
            if (standData.operatorUid) {
                const opSnap = await getDoc(doc(firestore, 'users', standData.operatorUid));
                if (opSnap.exists()) {
                    setOperatorUser(opSnap.data());
                } else {
                    setOperatorUser(null);
                }
            } else {
                setOperatorUser(null);
            }

            // 2. Fetch Linked Drivers
            const driversSnap = await getDocs(
                query(
                    collection(firestore, 'users'),
                    where('role', '==', 'driver'),
                    where('stationId', '==', standId)
                )
            );
            const loadedDrivers: LinkedDriver[] = [];
            driversSnap.forEach(dDoc => {
                const dData = dDoc.data();
                loadedDrivers.push({
                    uid: dDoc.id,
                    name: dData.name || 'Conductor sin nombre',
                    email: dData.email,
                    phone: dData.phone,
                    municipalStatus: dData.municipalStatus || 'pending',
                    profileCompleted: dData.profileCompleted || false
                });
            });
            setDrivers(loadedDrivers);

            // 3. Real-time Station Rides handled by a separate useEffect
        } catch (e: any) {
            console.error("Error loading stand details:", e);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudieron cargar los datos de la parada.'
            });
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {
        if (firestore && standId && !contextLoading) {
            loadData();
        }
    }, [firestore, standId, contextLoading]);

    // Real-time listener for Station Rides
    useEffect(() => {
        if (!firestore || !standId) return;

        const q = query(
            collection(firestore, 'rides'),
            where('stationId', '==', standId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedRides: StationRide[] = [];
            snapshot.forEach(rDoc => {
                const rData = rDoc.data();
                loadedRides.push({
                    id: rDoc.id,
                    status: rData.status || 'pending',
                    stationDispatchStatus: rData.stationDispatchStatus,
                    origin: rData.origin || { address: 'Sin origen' },
                    destination: rData.destination || { address: 'Sin destino' },
                    driverName: rData.driverName,
                    passengerName: rData.passengerName,
                    createdAt: rData.createdAt
                });
            });
            loadedRides.sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            setRides(loadedRides);
        }, (err) => {
            console.error("Error listening to station rides:", err);
        });

        return () => unsubscribe();
    }, [firestore, standId]);

    // Update map coordinates state when toggling into edit mode
    useEffect(() => {
        if (stand && isEditing) {
            const coords = {
                lat: stand.location?.latitude || getCityDefaultLocation(profile?.cityKey).lat,
                lng: stand.location?.longitude || getCityDefaultLocation(profile?.cityKey).lng
            };
            setMapCenter(coords);
            setMarkerPosition(coords);
            setEditPlaceId(stand.placeId || '');
            setEditGeocoded(true);
        }
    }, [isEditing, stand]);

    const handlePlaceSelect = (selectedAddress: string, selectedLat: number, selectedLng: number, selectedPlaceId?: string) => {
        setEditAddress(selectedAddress);
        setEditLat(selectedLat.toString());
        setEditLng(selectedLng.toString());
        setEditPlaceId(selectedPlaceId || '');
        setEditGeocoded(true);

        const newCoords = { lat: selectedLat, lng: selectedLng };
        setMapCenter(newCoords);
        setMarkerPosition(newCoords);
    };

    const handleUserType = () => {
        setEditGeocoded(false);
    };

    const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            const newLat = e.latLng.lat();
            const newLng = e.latLng.lng();

            setEditLat(newLat.toString());
            setEditLng(newLng.toString());
            setMarkerPosition({ lat: newLat, lng: newLng });

            if (geocoder) {
                geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results, statusResult) => {
                    if (statusResult === 'OK' && results?.[0]) {
                        const formatted = results[0].formatted_address;
                        const pId = results[0].place_id;
                        setEditAddress(formatted);
                        setEditPlaceId(pId);
                        setEditGeocoded(true);
                        toast({
                            title: 'Ubicación ajustada',
                            description: `Dirección actualizada: ${formatted}`
                        });
                    }
                });
            }
        }
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !stand) return;

        // Validations
        if (!editGeocoded || !editLat || !editLng) {
            toast({
                variant: 'destructive',
                title: 'Dirección no geocodificada',
                description: 'Seleccioná una dirección válida del mapa para ubicar la parada.'
            });
            return;
        }

        const latitude = parseFloat(editLat);
        const longitude = parseFloat(editLng);

        if (isNaN(latitude) || isNaN(longitude)) {
            toast({
                variant: 'destructive',
                title: 'Coordenadas inválidas',
                description: 'Latitud y longitud deben ser números válidos.'
            });
            return;
        }

        if (editRadius <= 0) {
            toast({
                variant: 'destructive',
                title: 'Radio inválido',
                description: 'El radio de cobertura debe ser mayor a 0 metros.'
            });
            return;
        }

        setSaving(true);
        try {
            await updateDoc(doc(firestore, 'taxi_stands', stand.id), {
                name: editName,
                address: editAddress,
                location: new GeoPoint(latitude, longitude),
                placeId: editPlaceId || undefined,
                geocodedBy: 'google_places',
                radiusMeters: editRadius,
                status: editStatus,
                hasOperator: editHasOperator,
                operatorUid: editHasOperator ? (stand.operatorUid || null) : null,
                representativeName: editHasOperator ? editRepName : '',
                representativePhone: editHasOperator ? editRepPhone : '',
                representativeEmail: editHasOperator ? editRepEmail : '',
                updatedAt: new Date()
            });

            setStand(prev => prev ? {
                ...prev,
                name: editName,
                address: editAddress,
                location: new GeoPoint(latitude, longitude),
                placeId: editPlaceId || undefined,
                geocodedBy: 'google_places',
                radiusMeters: editRadius,
                status: editStatus,
                hasOperator: editHasOperator,
                operatorUid: editHasOperator ? prev.operatorUid : undefined,
                representativeName: editHasOperator ? editRepName : '',
                representativePhone: editHasOperator ? editRepPhone : '',
                representativeEmail: editHasOperator ? editRepEmail : ''
            } : null);

            setIsEditing(false);
            toast({
                title: 'Parada actualizada',
                description: 'Los cambios fueron guardados exitosamente.'
            });
        } catch (err: any) {
            console.error("Error updating stand:", err);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudieron guardar los cambios en Firestore.'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCreateOperator = async () => {
        const emailToUse = operatorEmail.trim();
        if (!emailToUse || !stand) {
            toast({
                variant: 'destructive',
                title: 'Email requerido',
                description: 'Cargá un email del representante para generar el acceso.'
            });
            return;
        }

        // Email validation regex to satisfy Problem 4
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailToUse)) {
            toast({
                variant: 'destructive',
                title: 'Email inválido',
                description: 'Por favor, ingresá un correo electrónico válido.'
            });
            return;
        }

        setGeneratingOperator(true);
        setTempCredentials(null);

        try {
            const fns = getFunctions(undefined, 'us-central1');
            const createOperatorFn = httpsCallable(fns, 'createTaxiStandOperatorV1');

            const result = await createOperatorFn({
                standId: stand.id,
                email: emailToUse,
                representativeName: stand.representativeName || stand.name || 'Representante'
            });

            const data = result.data as any;
            if (data.success) {
                setTempCredentials({
                    loginUrl: data.loginUrl,
                    email: emailToUse,
                    password: data.password
                });
                setStand(prev => prev ? { ...prev, operatorUid: data.operatorUid, representativeEmail: emailToUse } : null);
                toast({
                    title: 'Operador creado',
                    description: 'Las credenciales de acceso se generaron correctamente.'
                });
                await loadData();
            }
        } catch (err: any) {
            console.error("Error calling createTaxiStandOperatorV1:", err);
            toast({
                variant: 'destructive',
                title: 'Error de creación',
                description: err.message || 'No se pudo crear el operador de la parada.'
            });
        } finally {
            setGeneratingOperator(false);
        }
    };

    const handleResetPassword = async () => {
        if (!stand) return;
        setResettingPassword(true);
        setResetCredentials(null);
        try {
            const fns = getFunctions(undefined, 'us-central1');
            const resetFn = httpsCallable(fns, 'resetTaxiStandOperatorPasswordV1');
            const result = await resetFn({ standId: stand.id });
            const data = result.data as any;
            if (data.success && data.password) {
                setResetCredentials({
                    loginUrl: '/taxi-stand/login',
                    email: stand.representativeEmail || operatorEmail || '—',
                    password: data.password
                });
                toast({
                    title: 'Contraseña restablecida',
                    description: 'Se generó una nueva contraseña temporal exitosamente.'
                });
                await loadData();
            }
        } catch (err: any) {
            console.error("Error calling resetTaxiStandOperatorPasswordV1:", err);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err.message || 'No se pudo restablecer la contraseña.'
            });
        } finally {
            setResettingPassword(false);
        }
    };

    const handleToggleSuspension = async () => {
        if (!stand || !operatorUser) return;
        const suspend = !operatorUser.isSuspended;
        setTogglingSuspension(true);
        try {
            const fns = getFunctions(undefined, 'us-central1');
            const suspendFn = httpsCallable(fns, 'toggleTaxiStandOperatorSuspensionV1');
            const result = await suspendFn({ standId: stand.id, suspend });
            const data = result.data as any;
            if (data.success) {
                toast({
                    title: suspend ? 'Operador suspendido' : 'Operador reactivado',
                    description: suspend ? 'El operador ya no podrá acceder al panel.' : 'El acceso del operador fue reactivado.'
                });
                await loadData();
            }
        } catch (err: any) {
            console.error("Error calling toggleTaxiStandOperatorSuspensionV1:", err);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err.message || 'No se pudo modificar la suspensión.'
            });
        } finally {
            setTogglingSuspension(false);
        }
    };

    const handleCopyCredentials = (email: string, pass: string, url: string) => {
        const text = `Usuario: ${email}\nClave Temporal: ${pass}\nIngreso: ${window.location.origin}${url}`;
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copiado al portapapeles',
            description: 'Las credenciales de acceso fueron copiadas de forma segura.'
        });
    };


    if (loading || contextLoading) {
        return (
            <div className="space-y-6 max-w-6xl mx-auto">
                <Skeleton className="h-10 w-64 bg-white/5" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-[300px] md:col-span-2 bg-white/5 rounded-2xl" />
                    <Skeleton className="h-[300px] bg-white/5 rounded-2xl" />
                </div>
            </div>
        );
    }

    if (!stand) return null;

    const receivedCount = rides.length;
    const assignedCount = rides.filter(r => r.stationDispatchStatus === 'accepted_by_driver' || r.status === 'driver_assigned' || r.status === 'completed').length;
    const releasedCount = rides.filter(r => r.stationDispatchStatus === 'released_to_general_matching').length;

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">{stand.name}</h1>
                        <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border",
                            stand.status === 'active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
                            {stand.status === 'active' ? 'Activo' : 'Suspendido'}
                        </span>
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">ID de Parada: <span className="font-mono text-zinc-400">{stand.id}</span></p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        onClick={() => router.push('/municipal/taxi-stands')}
                        variant="ghost"
                        className="h-12 px-6 rounded-xl text-xs font-bold text-zinc-400 hover:text-white border border-white/5"
                    >
                        ← Volver
                    </Button>
                    <Button
                        onClick={() => setIsEditing(!isEditing)}
                        className="h-12 px-6 bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 font-bold rounded-xl transition-all"
                    >
                        <VamoIcon name="edit" className="mr-2 h-4 w-4" /> {isEditing ? 'Cancelar Edición' : 'Editar Datos'}
                    </Button>
                </div>
            </div>

            {/* Edit / Detail section */}
            {isEditing ? (
                <form onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-white/[0.02] border-white/5 backdrop-blur-xl md:col-span-2">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                            <CardTitle className="text-lg text-white">Editar Datos Generales</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-400 text-xs font-bold uppercase">Nombre</Label>
                                <Input
                                    required
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-zinc-400 text-xs font-bold uppercase">Buscar dirección en Google Maps</Label>
                                <PlacesAutocomplete
                                    defaultValue={editAddress}
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
                                    mapId="muni-edit-stand-map"
                                >
                                    <Marker
                                        position={markerPosition}
                                        draggable={true}
                                        onDragEnd={handleMarkerDragEnd}
                                    />
                                    <MapCircle center={markerPosition} radius={editRadius} />
                                </Map>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-400 text-xs font-bold uppercase">Latitud</Label>
                                    <Input
                                        required
                                        readOnly
                                        value={editLat}
                                        className="h-12 bg-white/[0.02] border-white/5 text-zinc-400 focus:ring-0 font-mono select-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-zinc-400 text-xs font-bold uppercase">Longitud</Label>
                                    <Input
                                        required
                                        readOnly
                                        value={editLng}
                                        className="h-12 bg-white/[0.02] border-white/5 text-zinc-400 focus:ring-0 font-mono select-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-zinc-400 text-xs font-bold uppercase">Radio (metros)</Label>
                                    <Input
                                        type="number"
                                        required
                                        value={editRadius}
                                        onChange={e => setEditRadius(parseInt(e.target.value) || 500)}
                                        className="h-12 bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-zinc-400 text-xs font-bold uppercase">Estado</Label>
                                    <select
                                        value={editStatus}
                                        onChange={e => setEditStatus(e.target.value as any)}
                                        className="w-full h-12 bg-zinc-900 border border-white/10 rounded-lg px-3 text-white text-sm"
                                    >
                                        <option value="active">Activo</option>
                                        <option value="pending">Pendiente</option>
                                        <option value="suspended">Suspendido</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-3 pt-4 border-t border-white/5">
                                <Label className="text-zinc-400 text-xs font-bold uppercase">Tipo de Parada</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setEditHasOperator(true)}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                            editHasOperator
                                                ? 'border-[#1D7CFF] bg-[#1D7CFF]/10 text-[#1D7CFF]'
                                                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <VamoIcon name="user-check" className="h-6 w-6 mb-2" />
                                        <span className="text-sm font-bold">Con Operador</span>
                                        <span className="text-[10px] text-center mt-1 opacity-70">Despacho manual y panel</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditHasOperator(false)}
                                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                            !editHasOperator
                                                ? 'border-[#1D7CFF] bg-[#1D7CFF]/10 text-[#1D7CFF]'
                                                : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <VamoIcon name="map-pin" className="h-6 w-6 mb-2" />
                                        <span className="text-sm font-bold">Sin Operador</span>
                                        <span className="text-[10px] text-center mt-1 opacity-70">Prioridad geográfica</span>
                                    </button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {editHasOperator && (
                    <Card className="bg-white/[0.02] border-white/5 backdrop-blur-xl">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                            <CardTitle className="text-lg text-white">Editar Representante</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-zinc-400 text-xs font-bold uppercase">Nombre Representante</Label>
                                <Input
                                    value={editRepName}
                                    onChange={e => setEditRepName(e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-400 text-xs font-bold uppercase">Teléfono</Label>
                                <Input
                                    value={editRepPhone}
                                    onChange={e => setEditRepPhone(e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-zinc-400 text-xs font-bold uppercase">Email</Label>
                                <Input
                                    type="email"
                                    value={editRepEmail}
                                    onChange={e => setEditRepEmail(e.target.value)}
                                    className="h-12 bg-white/5 border-white/10 text-white"
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={saving}
                                className="w-full h-12 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl shadow-lg active:scale-[0.98]"
                            >
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </Button>
                        </CardContent>
                    </Card>
                    )}
                </form>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Stand Details Card */}
                    <Card className="bg-white/[0.02] border-white/5 backdrop-blur-xl md:col-span-2">
                        <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                            <CardTitle className="text-lg text-white">Información General</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dirección Oficial</p>
                                <p className="text-white font-bold">{stand.address || '—'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Radio Geográfico</p>
                                <p className="text-white font-bold">{stand.radiusMeters} metros</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Coordenadas GPS</p>
                                <p className="text-white font-mono text-xs">
                                    {getLat(stand.location) !== 0 ? getLat(stand.location).toFixed(6) : 'No informado'}, {getLng(stand.location) !== 0 ? getLng(stand.location).toFixed(6) : 'No informado'}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ciudad</p>
                                <p className="text-white font-bold uppercase">{stand.cityKey}</p>
                            </div>
                            
                            {stand.hasOperator !== false && (
                                <>
                                    <div className="h-px bg-white/5 sm:col-span-2" />
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Representante</p>
                                        <p className="text-white font-bold">{stand.representativeName || '—'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Email Representante</p>
                                        <p className="text-white font-bold">{stand.representativeEmail || '—'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Teléfono de Contacto</p>
                                        <p className="text-white font-bold">{stand.representativePhone || '—'}</p>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Operator Access Management */}
                    {stand.hasOperator !== false && (
                    <Card className="bg-white/[0.02] border-white/5 backdrop-blur-xl">
                        <CardHeader className="border-b border-white/5 bg-[#1D7CFF]/5">
                            <CardTitle className="text-lg text-white">Acceso del Operador</CardTitle>
                            <CardDescription>Cuentas autorizadas para despachar</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            {stand.operatorUid ? (
                                <div className="space-y-4">
                                    <div className={cn(
                                        "p-3 border rounded-xl flex gap-3 items-center",
                                        operatorUser?.isSuspended 
                                            ? "bg-red-500/10 border-red-500/20" 
                                            : "bg-emerald-500/10 border-emerald-500/20"
                                    )}>
                                        <VamoIcon 
                                            name={operatorUser?.isSuspended ? "alert-circle" : "check-circle"} 
                                            className={cn("h-5 w-5", operatorUser?.isSuspended ? "text-red-400" : "text-emerald-400")} 
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-white">
                                                {operatorUser?.isSuspended ? "Acceso Suspendido" : "Acceso Activo"}
                                            </p>
                                            <p className="text-[10px] font-mono text-zinc-500">UID: {stand.operatorUid}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Email/Usuario</p>
                                            <p className="text-white font-bold font-mono">{operatorUser?.email || stand.representativeEmail || 'No informado'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Link de Ingreso</p>
                                            <Link href="/taxi-stand/login" className="text-xs text-indigo-400 hover:text-indigo-300 font-bold block underline">
                                                /taxi-stand/login
                                            </Link>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Seguridad</p>
                                            <p className="text-zinc-400 text-[11px] leading-relaxed">
                                                La contraseña ya fue generada por seguridad. Si la perdiste, podés regenerarla.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <Button
                                            onClick={() => handleCopyCredentials(operatorUser?.email || stand.representativeEmail || '', '••••••••', '/taxi-stand/login')}
                                            variant="ghost"
                                            className="w-full h-10 border border-white/10 hover:bg-white/[0.04] text-white text-xs font-bold rounded-lg transition-all"
                                        >
                                            <VamoIcon name="copy" className="mr-2 h-4 w-4" /> Copiar Datos de Acceso
                                        </Button>

                                        <Button
                                            onClick={handleResetPassword}
                                            disabled={resettingPassword}
                                            variant="ghost"
                                            className="w-full h-10 border border-white/10 hover:bg-white/[0.04] text-indigo-400 hover:text-indigo-300 text-xs font-bold rounded-lg transition-all"
                                        >
                                            {resettingPassword ? 'Regenerando...' : 'Regenerar Contraseña'}
                                        </Button>

                                        <Button
                                            onClick={handleToggleSuspension}
                                            disabled={togglingSuspension}
                                            variant="ghost"
                                            className={cn(
                                                "w-full h-10 border text-xs font-bold rounded-lg transition-all",
                                                operatorUser?.isSuspended
                                                    ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/5"
                                                    : "border-red-500/20 text-red-400 hover:bg-red-500/5"
                                            )}
                                        >
                                            {togglingSuspension ? 'Procesando...' : (operatorUser?.isSuspended ? 'Reactivar Operador' : 'Suspender Operador')}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        Esta parada todavía no tiene operador asignado.
                                    </p>
                                    <div className="space-y-2">
                                        <Label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Email del Operador</Label>
                                        <Input
                                            type="email"
                                            placeholder="operador@parada.com"
                                            value={operatorEmail}
                                            onChange={e => setOperatorEmail(e.target.value)}
                                            className="h-10 bg-white/5 border-white/10 text-white text-xs"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleCreateOperator}
                                        disabled={generatingOperator || !operatorEmail.trim()}
                                        className="w-full h-10 bg-[#1D7CFF] hover:bg-[#1D7CFF]/90 text-white text-xs font-bold rounded-lg shadow-md transition-all active:scale-[0.98]"
                                    >
                                        {generatingOperator ? 'Generando...' : 'Generar Acceso Operador'}
                                    </Button>
                                </div>
                            )}

                            {/* One-time Temp Credentials Display */}
                            {tempCredentials && (
                                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3 animate-in zoom-in-95 duration-500">
                                    <div className="flex items-start gap-2">
                                        <VamoIcon name="alert-triangle" className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                        <h4 className="text-xs font-black text-amber-200 uppercase tracking-tight leading-none">Guardar Credenciales</h4>
                                    </div>
                                    <p className="text-[10px] text-amber-500/80 leading-snug">
                                        Esta información se mostrará **SOLO UNA VEZ** por seguridad. Copiá los datos de inmediato:
                                    </p>
                                    <div className="space-y-1.5 p-2.5 bg-black/40 rounded-lg text-xs font-mono text-zinc-300">
                                        <p><strong>Usuario:</strong> {tempCredentials.email}</p>
                                        <p><strong>Clave:</strong> {tempCredentials.password}</p>
                                        <p><strong>URL:</strong> {tempCredentials.loginUrl}</p>
                                    </div>
                                    <Button
                                        onClick={() => handleCopyCredentials(tempCredentials.email, tempCredentials.password, tempCredentials.loginUrl)}
                                        className="w-full h-9 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded-lg transition-all"
                                    >
                                        Copiar Acceso
                                    </Button>
                                </div>
                            )}

                            {/* Reset Temp Credentials Display */}
                            {resetCredentials && (
                                <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-3 animate-in zoom-in-95 duration-500">
                                    <div className="flex items-start gap-2">
                                        <VamoIcon name="alert-triangle" className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                                        <h4 className="text-xs font-black text-indigo-200 uppercase tracking-tight leading-none">Nueva Contraseña Temporal</h4>
                                    </div>
                                    <p className="text-[10px] text-indigo-300/80 leading-snug">
                                        Esta nueva clave se mostrará **SOLO UNA VEZ**. Copiá los datos de inmediato:
                                    </p>
                                    <div className="space-y-1.5 p-2.5 bg-black/40 rounded-lg text-xs font-mono text-zinc-300">
                                        <p><strong>Usuario:</strong> {resetCredentials.email}</p>
                                        <p><strong>Nueva Clave:</strong> {resetCredentials.password}</p>
                                        <p><strong>URL:</strong> {resetCredentials.loginUrl}</p>
                                    </div>
                                    <Button
                                        onClick={() => handleCopyCredentials(resetCredentials.email, resetCredentials.password, resetCredentials.loginUrl)}
                                        className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all"
                                    >
                                        Copiar Acceso
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    )}
                </div>
            )}

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card className="bg-white/[0.02] border-white/5 p-6 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Viajes Recibidos</p>
                    <p className="text-4xl font-black text-white italic tracking-tighter mt-2">{receivedCount}</p>
                </Card>
                <Card className="bg-white/[0.02] border-white/5 p-6 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Viajes Asignados</p>
                    <p className="text-4xl font-black text-emerald-400 italic tracking-tighter mt-2">{assignedCount}</p>
                </Card>
                <Card className="bg-white/[0.02] border-white/5 p-6 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Liberados por Expiración</p>
                    <p className="text-4xl font-black text-amber-400 italic tracking-tighter mt-2">{releasedCount}</p>
                </Card>
            </div>

            {/* Linked Drivers Section */}
            <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl">
                <CardHeader className="border-b border-white/5 bg-white/[0.01] flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg text-white">Conductores Vinculados</CardTitle>
                        <CardDescription>Conductores autorizados asignados a esta parada</CardDescription>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 px-3 py-1 rounded-md">
                        Total: {drivers.length}
                    </span>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-white/5 bg-black/10">
                                <tr>
                                    <th className="px-6 py-3">Nombre</th>
                                    <th className="px-6 py-3">Email</th>
                                    <th className="px-6 py-3">Teléfono</th>
                                    <th className="px-6 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {drivers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-10 text-center text-zinc-500 italic">
                                            No hay conductores asignados a esta parada actualmente.
                                        </td>
                                    </tr>
                                ) : (
                                    drivers.map(driver => (
                                        <tr key={driver.uid} className="hover:bg-white/[0.01] transition-colors">
                                            <td className="px-6 py-3">
                                                <p className="font-bold text-white">{driver.name}</p>
                                                {!driver.profileCompleted && (
                                                    <span className="text-[8px] font-black bg-amber-500/10 text-amber-400 px-1 py-0.5 rounded uppercase tracking-wider">Perfil Incompleto</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-zinc-400 font-mono text-xs">{driver.email || '—'}</td>
                                            <td className="px-6 py-3 text-zinc-400">{driver.phone || '—'}</td>
                                            <td className="px-6 py-3 text-right">
                                                <Link href={`/municipal/drivers/${driver.uid}`}>
                                                    <Button variant="ghost" className="h-8 px-3 rounded-lg text-xs font-bold text-indigo-400 hover:text-indigo-300">
                                                        Ver Conductor →
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Ride History / Station dispatch panel */}
            <Card className="bg-white/[0.02] border-white/5 overflow-hidden backdrop-blur-xl">
                <CardHeader className="border-b border-white/5 bg-white/[0.01]">
                    <CardTitle className="text-lg text-white">Historial de Viajes y Despacho</CardTitle>
                    <CardDescription>Registro histórico de los viajes originados dentro del radio de control</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-white/5 bg-black/10">
                                <tr>
                                    <th className="px-6 py-3">ID Viaje</th>
                                    <th className="px-6 py-3">Pasajero</th>
                                    <th className="px-6 py-3">Origen / Destino</th>
                                    <th className="px-6 py-3">Estado General</th>
                                    <th className="px-6 py-3">Estado Despacho</th>
                                    <th className="px-6 py-3">Conductor Asignado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {rides.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-zinc-500 italic">
                                            No se registran viajes para esta parada digital.
                                        </td>
                                    </tr>
                                ) : (
                                    rides.map(ride => (
                                        <tr key={ride.id} className="hover:bg-white/[0.01] transition-colors">
                                            <td className="px-6 py-3 font-mono text-xs text-zinc-400">{ride.id}</td>
                                            <td className="px-6 py-3 font-bold text-white">{ride.passengerName || '—'}</td>
                                            <td className="px-6 py-3">
                                                <p className="text-xs font-bold text-zinc-300">De: {ride.origin?.address}</p>
                                                <p className="text-xs text-zinc-500">A: {ride.destination?.address}</p>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                                                    ride.status === 'completed' ? "bg-emerald-500/10 text-emerald-400"
                                                    : ride.status === 'cancelled' ? "bg-red-500/10 text-red-400"
                                                    : "bg-blue-500/10 text-blue-400"
                                                )}>
                                                    {ride.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                                                    ride.stationDispatchStatus === 'accepted_by_driver' ? "bg-emerald-500/15 text-emerald-400"
                                                    : ride.stationDispatchStatus === 'released_to_general_matching' ? "bg-amber-500/15 text-amber-400"
                                                    : ride.stationDispatchStatus === 'pending_reassignment' ? "bg-purple-500/15 text-purple-400"
                                                    : "bg-zinc-800 text-zinc-400"
                                                )}>
                                                    {ride.stationDispatchStatus || 'Desconocido'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-zinc-300 font-bold">{ride.driverName || 'Sin conductor'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// Main Page Wrapper
export default function TaxiStandDetailPage() {
    return (
        <MapsProvider>
            <TaxiStandDetailContent />
        </MapsProvider>
    );
}
