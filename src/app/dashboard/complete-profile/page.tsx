'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useFirestore, useUser, useFirebase } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CITIES } from '@/lib/cityData';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { Suspense } from 'react';
import { useMapsAvailability } from '@/components/MapsProvider';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { resolveCity } from '@/lib/city-resolution';
import { Checkbox } from "@/components/ui/checkbox";
import { CURRENT_TERMS_VERSION } from "@/lib/legal-config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ShieldCheck, Scale } from 'lucide-react';

function CompletePassengerProfileContent() {
    const { user, profile, loading: isAuthInitializing } = useUser();
    // Use user.uid for storage path to ensure we use the actual Auth identity
    const authUid = user?.uid;
    const { storage } = useFirebase();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);


    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
    const [photoURL, setPhotoURL] = useState<string | null>(null);
    const [cityKey, setCityKey] = useState<string>('');
    const [customCity, setCustomCity] = useState('');
    const [femaleDriverOnly, setFemaleDriverOnly] = useState(false);
    const [referralCodeInput, setReferralCodeInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
        const [termsAccepted, setTermsAccepted] = useState(false);

    const { mapsAvailable } = useMapsAvailability();
    const geocodingLib = useMapsLibrary('geocoding');
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
    const [registrationLat, setRegistrationLat] = useState<number | null>(null);
    const [registrationLng, setRegistrationLng] = useState<number | null>(null);
    const [registrationCityKey, setRegistrationCityKey] = useState<string | null>(null);
    const [registrationCityName, setRegistrationCityName] = useState<string | null>(null);
    const [registrationSource, setRegistrationSource] = useState<'gps' | 'manual' | 'gps_unmatched'>('manual');
    const [isLocating, setIsLocating] = useState(false);
    const [gpsError, setGpsError] = useState(false);

    useEffect(() => {
        if (geocodingLib) setGeocoder(new geocodingLib.Geocoder());
    }, [geocodingLib]);

    const handleLocateMe = () => {
        if (!mapsAvailable || !geocoder) {
            toast({ variant: 'destructive', title: 'Servicio no disponible', description: 'El servicio de ubicación todavía está cargando, intentá nuevamente.' });
            return;
        }
        if (!navigator.geolocation) {
            setGpsError(true);
            return;
        }
        setIsLocating(true);
        setGpsError(false);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setRegistrationLat(latitude);
                setRegistrationLng(longitude);
                geocoder.geocode({ location: { lat: latitude, lng: longitude } }, async (results, status) => {
                    if (status === 'OK' && results?.[0]) {
                        const result = results[0];
                        const resolution = await resolveCity(latitude, longitude, result.address_components, geocoder);
                        if (resolution.city && CITIES[resolution.city]) {
                            setCityKey(resolution.city);
                            setRegistrationCityKey(resolution.city);
                            setRegistrationCityName(CITIES[resolution.city].name);
                            setRegistrationSource('gps');
                            toast({ title: 'Ubicación encontrada', description: `Localidad: ${CITIES[resolution.city].name}` });
                        } else {
                            setCityKey('other');
                            setRegistrationCityKey('pending_city');
                            setRegistrationCityName(resolution.city || 'Ciudad pendiente de verificación');
                            setRegistrationSource('gps_unmatched');
                            toast({ title: 'Ubicación detectada', description: 'Tu ciudad aún no está activa o verificada, pero guardamos tu ubicación.' });
                        }
                    } else {
                        // Geocoder failed completely but we HAVE lat/lng
                        setCityKey('other');
                        setRegistrationCityKey('pending_city');
                        setRegistrationCityName('Ciudad pendiente de verificación');
                        setRegistrationSource('gps_unmatched');
                        toast({ title: 'Ubicación detectada', description: 'No pudimos verificar el nombre de la ciudad, pero guardamos tu ubicación.' });
                    }
                    setIsLocating(false);
                });
            },
            (error) => {
                console.warn('GPS Denied or failed', error);
                setGpsError(true);
                setIsLocating(false);
                toast({ variant: 'destructive', title: 'Acceso Denegado', description: 'Tocá el candado del navegador, permití ubicación y volvé a tocar Localizar mi ubicación.' });
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    };
    const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);

    useEffect(() => {
        // [ONBOARDING_GUARD] If profile is already active, escape to dashboard
        if (!isAuthInitializing && profile?.registrationStatus === 'active') {
            console.log("[ONBOARDING_GUARD] Profile already active. Redirecting to dashboard.");
            router.replace('/dashboard');
        }
    }, [profile, isAuthInitializing, router]);

    // DEEP LINK / CAPTURA: Leer ref=CODE y campaign de la URL o del storage
    useEffect(() => {
        const refParam = searchParams.get('ref') || localStorage.getItem('vamo_captured_referral');
        const campaignParam = searchParams.get('campaign') || localStorage.getItem('vamo_captured_campaign');

        if (refParam && !referralCodeInput) {
            const code = refParam.toUpperCase().trim();
            setReferralCodeInput(code);
            
            const msg = campaignParam 
                ? `🎉 ¡Llegaste invitado por la campaña ${campaignParam}!` 
                : "🎉 ¡Llegaste invitado por un amigo!";

            toast({ 
                title: msg, 
                description: `Tu beneficio se activará automáticamente al completar tu primer viaje.`,
                duration: 5000
            });
        }
    }, [searchParams, toast, referralCodeInput]);

    useEffect(() => {
        if (profile) {
            if (profile.name) setName(profile.name);
            if (profile.surname) setSurname(profile.surname);
            if (profile.displayName) setDisplayName(profile.displayName);
            if (profile.phone) setPhone(profile.phone);
            if (profile.gender) setGender(profile.gender as any);
            if (profile.photoURL) setPhotoURL(profile.photoURL);
            if (profile.cityKey) setCityKey(profile.cityKey as any);
            
            // Auto-completar referido guardado en el paso anterior (login/signup)
            if (profile.referredByCode && !referralCodeInput) {
                setReferralCodeInput(profile.referredByCode);
            }
        }
    }, [profile, referralCodeInput]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // GUARDIA FUERTE: Bloquear si no hay UID de Auth listo
        if (!authUid) {
            console.error("📸 [PHOTO_UPLOAD_BLOCKED_NO_AUTH] Attempted upload without resolved Auth UID.");
            toast({ 
                variant: 'destructive', 
                title: 'Sesión no lista', 
                description: 'Tu sesión todavía no está lista. Esperá unos segundos e intentá de nuevo.' 
            });
            return;
        }

        console.log("📸 [PHOTO_UPLOAD] Audit Start:", {
            name: file.name,
            size: file.size,
            type: file.type,
            uid: authUid
        });

        if (!storage) {
            toast({ variant: 'destructive', title: 'Error de Sistema', description: 'El servicio de almacenamiento no está disponible.' });
            return;
        }

        // 1. Instant Preview (UX Improvement)
        const localPreview = URL.createObjectURL(file);
        setPhotoURL(localPreview);

        // 2. Validation
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Formato Inválido', description: 'Por favor, seleccioná una imagen (JPG, PNG o WebP).' });
            setPhotoURL(profile?.photoURL || null); // Revert
            return;
        }

        // Limite estricto según auditoría (5MB según reglas de Storage)
        if (file.size > 5 * 1024 * 1024) {
            toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'La foto debe pesar menos de 5MB.' });
            setPhotoURL(profile?.photoURL || null); // Revert
            return;
        }

        setIsUploading(true);
        try {
            // Ruta exacta según auditoría: passengers/{uid}/profile/profile.jpg
            const storagePath = `passengers/${authUid}/profile/profile.jpg`;
            const storageRef = ref(storage, storagePath);
            
            console.log("📸 [PHOTO_UPLOAD] Uploading to:", storagePath);
            
            const snapshot = await uploadBytes(storageRef, file, { 
                contentType: file.type,
                customMetadata: { 
                    role: 'passenger',
                    source: 'registration_v1',
                    authUid: authUid
                }
            });
            
            const downloadURL = await getDownloadURL(snapshot.ref);
            console.log("📸 [PHOTO_UPLOAD] Success. Final URL:", downloadURL);
            
            setPhotoURL(downloadURL);
            toast({ title: 'Foto cargada', description: 'Tu imagen se procesó correctamente.' });
        } catch (error: any) {
            console.error("📸 [PHOTO_UPLOAD] CRITICAL ERROR:", error);
            setPhotoURL(profile?.photoURL || null); // Revert preview on failure
            
            let msg = 'No se pudo subir la foto.';
            if (error.code === 'storage/unauthorized') {
                msg = 'Error de permisos (Storage). Verificá tu sesión.';
            } else if (error.code === 'storage/canceled') {
                msg = 'Carga cancelada.';
            } else if (error.message) {
                msg = error.message;
            }
            
            toast({ variant: 'destructive', title: 'Fallo en la carga', description: msg });
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = ''; // Reset input
        }
    };





    const handleSubmit = async () => {
        if (!name || !surname || !phone || !gender || !displayName || !cityKey) {
            toast({ 
                variant: 'destructive', 
                title: 'Campos requeridos', 
                description: 'Por favor, completá todos los datos obligatorios.' 
            });
            return;
        }

        if (!termsAccepted) {
            toast({ 
                variant: 'destructive', 
                title: 'Términos no aceptados', 
                description: 'Debés aceptar los términos y condiciones para continuar.' 
            });
            return;
        }

        setIsSubmitting(true);
        setFormError(null);
        console.log("[PASSENGER_PROFILE_SAVE_START] Saving profile for", user?.uid);

        try {
            const functions = getFunctions(undefined, 'us-central1');
            const updateProfile = httpsCallable(functions, 'updateProfileV1');
            
            const normalizedPhone = phone.replace(/[\s\-\+()]/g, '');
            const finalCityKey = cityKey === 'other' ? customCity.toLowerCase().replace(/[^a-z0-9]/g, '') : cityKey;
            const finalCityLabel = cityKey === 'other' ? customCity : (CITIES[cityKey]?.name || cityKey);
            
            await updateProfile({
                name,
                surname,
                displayName,
                phone: normalizedPhone,
                gender,
                photoURL,
                cityKey: finalCityKey,
                cityLabel: finalCityLabel,
                passengerPreferences: {
                    femaleDriverOnly: gender === 'female' ? femaleDriverOnly : false
                },
                profileCompleted: true,
                termsAccepted: true,
                termsVersion: CURRENT_TERMS_VERSION,
                termsAcceptedAt: new Date() 
            });

            console.log("[PASSENGER_PROFILE_SAVE_OK] Profile updated via backend.");

            // APLICAR REFERIDO SI EXISTE
            if (referralCodeInput.trim()) {
                const applyReferral = httpsCallable(functions, 'applyReferralCodeV1');
                const campaign = localStorage.getItem('vamo_captured_campaign');
                
                await applyReferral({ 
                    referralCode: referralCodeInput.trim(),
                    source: 'link',
                    campaign: campaign
                });
                
                localStorage.removeItem('vamo_captured_referral');
                localStorage.removeItem('vamo_captured_campaign');
                console.log("[PASSENGER_REFERRAL_APPLIED] Referral code applied.");
            }
            
            console.log("[PASSENGER_STATUS_ACTIVE] User is now active. Redirecting to dashboard...");
            
            toast({
                title: '¡Perfil PRO listo!',
                description: 'Bienvenido a VamO. Tu cuenta ha sido activada.',
            });

            // Wait for Firestore consistency
            await new Promise(resolve => setTimeout(resolve, 800));

            // Seamless transition to dashboard
            router.replace('/dashboard');
            
        } catch (error: any) {
            console.error("🔥 ERROR GUARDANDO PERFIL:", error);
            let errorMessage = error.message || 'Error al guardar.';
            if (error.code === 'already-exists') errorMessage = 'El teléfono ya está en uso.';
            
            setFormError(errorMessage);
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isAuthInitializing || (!!user && !profile)) {
        // [SELF_HEALING] If we have a user but no profile after 3 seconds, something is wrong
        // but we show the loader to keep the experience smooth.
        return <VamoFullScreenLoader label="Preparando tu llegada..." />;
    }

    return (
        <main className="min-h-screen bg-zinc-950 bg-morphic flex items-center justify-center py-12 px-4 sm:px-6">
            <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 ease-out">
                <div className="space-y-4 text-center">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600/10 rounded-3xl mb-2 border border-indigo-500/20">
                        <VamoIcon name="user" className="h-10 w-10 text-indigo-500" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">
                            Casi <span className="text-indigo-500">Listo</span>
                        </h1>
                        <p className="text-zinc-500 text-sm font-medium max-w-[280px] mx-auto leading-relaxed">
                            Completá tu perfil para empezar a viajar con seguridad.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <div className="relative group">
                        <div className={cn(
                            "absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl transition-all duration-500 opacity-0 group-hover:opacity-100",
                            isUploading && "animate-pulse opacity-100"
                        )} />
                        
                        <Avatar className="h-32 w-32 border-4 border-zinc-900 shadow-2xl ring-2 ring-white/5 relative overflow-hidden">
                            <AvatarImage src={photoURL || ''} className="object-cover" />
                            <AvatarFallback className="bg-zinc-800 text-zinc-500 text-4xl font-bold">
                                {name ? name[0].toUpperCase() : <VamoIcon name="user" className="h-10 w-10 text-zinc-700" />}
                            </AvatarFallback>
                            
                            {isUploading && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <VamoIcon name="loader" className="h-8 w-8 text-white animate-spin" />
                                </div>
                            )}
                        </Avatar>

                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading || isAuthInitializing || !authUid}
                            className="absolute bottom-0 right-0 h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full border-4 border-zinc-900 flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-90 disabled:opacity-50 disabled:grayscale"
                        >
                            <VamoIcon name="camera" className="h-5 w-5" />
                        </button>
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handlePhotoUpload} 
                        className="opacity-0 absolute pointer-events-none" 
                        accept="image/*" 
                    />
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Foto de perfil recomendada</p>
                </div>

                <div className="bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-6 sm:p-10 space-y-6 shadow-2xl shadow-black/50">
                    {formError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500">
                            <VamoIcon name="alert-circle" className="h-4 w-4" />
                            <p className="text-xs font-medium">{formError}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Nombre</Label>
                            <Input 
                                placeholder="Juan" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Apellido</Label>
                            <Input 
                                placeholder="Pérez" 
                                value={surname} 
                                onChange={e => setSurname(e.target.value)} 
                                className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Nombre Visible (para viajes)</Label>
                        <Input 
                            placeholder="Juan P." 
                            value={displayName} 
                            onChange={e => setDisplayName(e.target.value)} 
                            className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                        />
                        <p className="text-[10px] text-zinc-600 px-1">Es el nombre que verá el conductor.</p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Teléfono (WhatsApp)</Label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">+54</div>
                            <Input 
                                type="tel" 
                                placeholder="2804123456" 
                                value={phone} 
                                onChange={e => setPhone(e.target.value)} 
                                className="h-12 pl-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Ciudad / Localidad</Label>
                        <Select value={cityKey} onValueChange={(val: any) => setCityKey(val)}>
                            <SelectTrigger className="h-12 bg-white/5 border-white/5 rounded-xl text-white focus:ring-indigo-500">
                                <SelectValue placeholder="Seleccionar Ciudad" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                {Object.values(CITIES).filter(c => c.status === 'active').map((city) => (
                                    <SelectItem key={city.key} value={city.key}>{city.name}</SelectItem>
                                ))}
                                <SelectItem value="other">Otra localidad...</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-zinc-600 px-1">Seleccioná tu ciudad principal para ver conductores cercanos.</p>
                    </div>

                    {cityKey === 'other' && (
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Ingresá tu localidad</Label>
                            <Input 
                                placeholder="Ej: Gaiman" 
                                value={customCity} 
                                onChange={e => setCustomCity(e.target.value)} 
                                className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500" 
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Género</Label>
                        <Select value={gender} onValueChange={(val: any) => setGender(val)}>
                            <SelectTrigger className="h-12 bg-white/5 border-white/5 rounded-xl text-white focus:ring-indigo-500">
                                <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                <SelectItem value="male">Hombre</SelectItem>
                                <SelectItem value="female">Mujer</SelectItem>
                                <SelectItem value="other">Otro / Prefiero no decir</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {gender === 'female' && (
                        <div className="flex flex-col gap-4 p-4 bg-pink-500/10 rounded-2xl border border-pink-500/20 mx-1 mt-2">
                            <div className="flex items-start gap-3">
                                <Checkbox 
                                    id="femaleDriver" 
                                    checked={femaleDriverOnly} 
                                    onCheckedChange={(checked) => setFemaleDriverOnly(checked === true)}
                                    className="mt-1 border-pink-500/50 data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600"
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label
                                        htmlFor="femaleDriver"
                                        className="text-[11px] font-bold text-pink-400 cursor-pointer select-none uppercase tracking-wide"
                                    >
                                        Soy mujer y quiero poder pedir conductora mujer
                                    </label>
                                    <p className="text-[9px] text-zinc-400 font-medium leading-relaxed mt-1">
                                        VamO priorizará conductoras mujeres cuando solicites un viaje. Si no hay disponibles, te avisaremos.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">¿Te invitó alguien? (Opcional)</Label>
                        <Input 
                            placeholder="Ej: VAMO-A1B2" 
                            value={referralCodeInput} 
                            onChange={e => setReferralCodeInput(e.target.value.toUpperCase())} 
                            className="h-12 bg-white/5 border-white/5 rounded-xl text-white placeholder:text-zinc-700 focus:ring-indigo-500 uppercase font-mono" 
                        />
                        <p className="text-[10px] text-zinc-600 px-1">Ingresá el código de tu amigo para que ambos ganen beneficios.</p>
                    </div>

                    <div className="flex flex-col gap-4 p-4 bg-zinc-900/40 rounded-2xl border border-white/5 mx-1">
                        <div className="flex items-start gap-3">
                            <Checkbox 
                                id="terms" 
                                checked={termsAccepted} 
                                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                                className="mt-1 border-indigo-500/50 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="terms"
                                    className="text-[11px] font-medium text-zinc-400 cursor-pointer select-none"
                                >
                                    Acepto los <button onClick={(e) => { e.preventDefault(); setIsLegalModalOpen(true); }} className="text-indigo-400 hover:text-indigo-300 font-bold underline">Términos y Condiciones</button> de VamO PRO.
                                </label>
                                <p className="text-[9px] text-zinc-600 font-medium">Reconozco que VamO es un intermediario tecnológico y acepto el marco de asistencia económica.</p>
                            </div>
                        </div>
                    </div>

                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || isUploading || !termsAccepted}
                        className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-[1.5rem] transition-all shadow-2xl shadow-indigo-600/30 active:scale-[0.98] mt-4"
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-3">
                                <VamoIcon name="loader" className="h-6 w-6 animate-spin" />
                                <span>ACTIVANDO CUENTA...</span>
                            </div>
                        ) : "Guardar y Empezar a Viajar"}
                    </Button>
                </div>

                <Dialog open={isLegalModalOpen} onOpenChange={setIsLegalModalOpen}>
                    <DialogContent className="max-w-md w-[95vw] h-[85vh] flex flex-col p-0 gap-0 sm:rounded-[2.5rem] overflow-hidden bg-zinc-950 border-white/10 shadow-3xl">
                        <DialogHeader className="p-6 border-b border-white/5 shrink-0 text-left">
                            <div className="flex items-center gap-3 mb-1">
                                <Scale className="h-5 w-5 text-indigo-400" />
                                <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">Condiciones VamO PRO</DialogTitle>
                            </div>
                            <DialogDescription className="text-xs text-zinc-500 italic">Versión {CURRENT_TERMS_VERSION} | Acuerdo Global</DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto p-6 text-sm text-zinc-300 space-y-6 leading-relaxed">
                            <section className="space-y-2">
                                <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">1. Naturaleza Jurídica</h3>
                                <p>VamO PRO es exclusivamente una plataforma de software que facilita la conexión entre pasajeros y conductores independientes. No es una empresa de transporte ni de seguros.</p>
                            </section>
                            <section className="space-y-2">
                                <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">2. Fondo de Asistencia (F.A.P.)</h3>
                                <p>Para viajes Express (particulares), VamO ofrece una asistencia económica limitada por reintegro. No constituye una póliza de seguro tradicional.</p>
                            </section>
                            <section className="space-y-2">
                                <h3 className="font-black text-white text-[10px] uppercase tracking-widest text-indigo-400">3. Comportamiento y Seguridad</h3>
                                <p>El uso de la plataforma implica el respeto mutuo. Cualquier incidente debe ser reportado en un plazo máximo de 24 horas para ser elegible para asistencia.</p>
                            </section>
                        </div>
                        <div className="p-6 bg-zinc-900/80 backdrop-blur-md border-t border-white/5 shrink-0">
                            <Button 
                                onClick={() => { setTermsAccepted(true); setIsLegalModalOpen(false); }}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 rounded-xl"
                            >
                                Entiendo y Acepto
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <p className="text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                    Tus datos están protegidos por VamO PRO Engine
                </p>
            </div>
        </main>
    );
}

export default function CompletePassengerProfilePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#121212] flex items-center justify-center text-white font-bold">Cargando...</div>}>
            <CompletePassengerProfileContent />
        </Suspense>
    );
}
