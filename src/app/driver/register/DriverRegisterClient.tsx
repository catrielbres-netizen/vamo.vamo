'use client';

import React, { useState } from 'react';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { createUserWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';
import { doc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import {
    VehicleType,
    DriverSubtype,
    MunicipalChecklist,
    MunicipalDocItem,
    normalizeCityKey,
    buildMunicipalCode,
} from '@/lib/types';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Config ──────────────────────────────────────────────────────────────────
const years = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => (2008 + i).toString()).reverse();

/** Ciudades argentinas disponibles para el flujo express. Se expande según presencia municipal. */
const EXPRESS_CITIES: { label: string; value: string }[] = [
    { label: 'Rawson', value: 'Rawson' },
    { label: 'Trelew', value: 'Trelew' },
    { label: 'Puerto Madryn', value: 'Puerto Madryn' },
    { label: 'Comodoro Rivadavia', value: 'Comodoro Rivadavia' },
    { label: 'Esquel', value: 'Esquel' },
];

/** Checklist inicial: todos los ítems en estado "pending" */
function buildEmptyChecklist(): MunicipalChecklist {
    const emptyItem: MunicipalDocItem = {
        status: 'pending',
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        observation: null,
        storageUrl: null,
    };
    return {
        dniFront:               { ...emptyItem },
        dniBack:                { ...emptyItem },
        driverLicense:          { ...emptyItem },
        vehicleInsurance:       { ...emptyItem },
        vehicleRegistrationCard:{ ...emptyItem },
        criminalRecord:         { ...emptyItem },
        municipalCanon:         { ...emptyItem },
    };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function DriverRegisterClient() {
    const auth       = useAuth();
    const firestore  = useFirestore();
    const storage    = useStorage();
    const router     = useRouter();
    const { toast }  = useToast();

    // --- SUBTIPO (selector principal) ---
    const [driverSubtype, setDriverSubtype] = useState<DriverSubtype | ''>('');

    // --- DATOS PERSONALES ---
    const [name,     setName]     = useState('');
    const [email,    setEmail]    = useState('');
    const [phone,    setPhone]    = useState('');
    const [password, setPassword] = useState('');
    const [gender,   setGender]   = useState<'male' | 'female' | null>(null);

    // --- VEHÍCULO (taxi/remis) ---
    const [vehicleType,   setVehicleType]   = useState<VehicleType | ''>('');
    const [carModelYear,  setCarModelYear]  = useState('');
    const [plateNumber,   setPlateNumber]   = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');

    // --- EXPRESS ---
    const [city, setCity] = useState('');
    
    // --- NUEVOS CAMPOS (BLOQUE 1) ---
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
    const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
    const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showTerms, setShowTerms] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const isExpress  = driverSubtype === 'express';
    const isClassic  = driverSubtype === 'taxi' || driverSubtype === 'remis';

    // ─── SUBMIT ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!driverSubtype) {
            toast({ variant: 'destructive', title: 'Seleccioná un tipo de conductor' });
            return;
        }

        // Validaciones comunes
        if (!name || !email || !phone || !password || !gender || !carModelYear || !plateNumber) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Completá todos los campos obligatorios.' });
            return;
        }

        if (password.length < 6) {
            toast({ variant: 'destructive', title: 'Contraseña débil', description: 'Mínimo 6 caracteres.' });
            return;
        }

        // Validaciones específicas por subtype
        if (isClassic && (!vehicleType || !licenseNumber)) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Completá el tipo de vehículo y número de licencia.' });
            return;
        }

        // Validación de Fotos (Obligatorias Bloque 1)
        if (!profilePhoto) {
            toast({ variant: 'destructive', title: 'Foto requerida', description: 'Por favor subí tu foto de perfil.' });
            return;
        }
        if (!vehiclePhoto) {
            toast({ variant: 'destructive', title: 'Foto requerida', description: 'Por favor subí la foto del vehículo (frente).' });
            return;
        }

        // Validación de Términos
        if (!acceptedTerms) {
            toast({ variant: 'destructive', title: 'Términos y Condiciones', description: 'Debés aceptar los términos para continuar.' });
            return;
        }

        if (isExpress) {
            if (!city) {
                toast({ variant: 'destructive', title: 'Seleccioná tu ciudad', description: 'Es necesaria para asignarte un código municipal.' });
                return;
            }
            if (parseInt(carModelYear, 10) < 2016) {
                toast({ variant: 'destructive', title: 'Modelo no admitido', description: 'Los vehículos particulares deben ser modelo 2016 o más nuevos.' });
                return;
            }
            if (plateNumber.length < 9) { // AA-123-BB length is 9
                toast({ variant: 'destructive', title: 'Patente incompleta', description: 'Las patentes 2016+ deben tener el formato AA-123-BB.' });
                return;
            }
        }

        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'Servicios no inicializados.' });
            return;
        }

        setIsSubmitting(true);
        let newUserCreated: any = null;

        try {
            if (auth.currentUser) await signOut(auth);

            // 1. Crear usuario en Firebase Auth
            const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
            newUserCreated = newUser;

            // 1.5 Subir fotos a Storage
            let photoURL = '';
            let vehicleFrontPhotoURL = '';
            
            if (profilePhoto) {
                const profileRef = ref(storage, `drivers/${newUser.uid}/profile_${Date.now()}`);
                const profileSnap = await uploadBytes(profileRef, profilePhoto);
                photoURL = await getDownloadURL(profileSnap.ref);
            }
            if (vehiclePhoto) {
                const vehicleRef = ref(storage, `drivers/${newUser.uid}/vehicle_${Date.now()}`);
                const vehicleSnap = await uploadBytes(vehicleRef, vehiclePhoto);
                vehicleFrontPhotoURL = await getDownloadURL(vehicleSnap.ref);
            }

            // ─── FLUJO TAXI / REMIS (sin cambios respecto al original) ─────────
            if (isClassic) {
                const userRef = doc(firestore, 'users', newUser.uid);
                await setDoc(userRef, {
                    uid:              newUser.uid,
                    name,
                    email:            newUser.email,
                    phone:            phone.replace(/[\s\-\+()]/g, ''),
                    gender,
                    role:             'driver',
                    driverSubtype:    driverSubtype,          // "taxi" | "remis"
                    profileCompleted: true,
                    approved:         false,
                    driverStatus:     'offline',
                    emailVerified:    false,
                    licenseVerified:  false,
                    isSuspended:      false,
                    vehicleType:      vehicleType as VehicleType,
                    carModelYear:     parseInt(carModelYear, 10),
                    plateNumber:      plateNumber.toUpperCase().trim(),
                    licenseNumber:    licenseNumber.trim(),
                    servicesOffered:  { normal: true, premium: true, express: true, pets: false, scheduled: false, shared: false },
                    currentBalance:   0,
                    photoURL,
                    vehicleFrontPhotoURL,
                    acceptedTerms:    true,
                    acceptedTermsAt:  serverTimestamp(),
                    termsVersion:     'v1.3',
                    createdAt:        serverTimestamp(),
                    updatedAt:        serverTimestamp(),
                });

                const locationRef = doc(firestore, 'drivers_locations', newUser.uid);
                await setDoc(locationRef, {
                    geohash:        null,
                    currentLocation:null,
                    lastSeenAt:     serverTimestamp(),
                    driverStatus:   'offline',
                    approved:       false,
                    isSuspended:    false,
                    pendingOffers:  0,
                    updatedAt:      serverTimestamp(),
                });

                toast({ title: '¡Registro exitoso!', description: 'Tu cuenta será aprobada por el equipo.' });
                router.replace('/auth/continue');
                return;
            }

            // ─── FLUJO EXPRESS ─────────────────────────────────────────────────
            //
            //  GENERACIÓN DEL CÓDIGO MUNICIPAL — Evitar duplicados:
            //  Usamos runTransaction sobre `municipal_counters/{cityKey}`.
            //  La transacción: lee el contador → incrementa → escribe los 3 docs atómicamente.
            //  Si dos conductores se registran al mismo tiempo, Firestore serializa las
            //  transacciones → cada uno recibe un número único garantizado.
            //
            const cityKey         = normalizeCityKey(city);
            const countersRef     = doc(firestore, 'municipal_counters', cityKey);
            const userRef         = doc(firestore, 'users',              newUser.uid);
            const munProfileRef   = doc(firestore, 'municipal_profiles', newUser.uid);
            const locationRef     = doc(firestore, 'drivers_locations',  newUser.uid);

            let generatedCode = '';

            await runTransaction(firestore, async (tx) => {
                // Leer (o inicializar) el contador de esta ciudad
                const counterSnap = await tx.get(countersRef);
                const currentSeq  = counterSnap.exists() ? (counterSnap.data().seq as number) : 0;
                const nextSeq     = currentSeq + 1;

                generatedCode = buildMunicipalCode(cityKey, nextSeq);

                // ── 1. Actualizar contador ──────────────────────────────────────
                tx.set(countersRef, { seq: nextSeq, cityKey, updatedAt: serverTimestamp() }, { merge: true });

                // ── 2. Crear users/{uid} ────────────────────────────────────────
                tx.set(userRef, {
                    uid:             newUser.uid,
                    name,
                    email:           newUser.email,
                    phone:           phone.replace(/[\s\-\+()]/g, ''),
                    gender,
                    role:            'driver',
                    driverSubtype:   'express',
                    city,
                    profileCompleted:true,
                    approved:        false,              // admin_municipal lo habilita
                    driverStatus:    'offline',
                    emailVerified:   false,
                    isSuspended:     false,
                    carModelYear:    parseInt(carModelYear, 10),
                    plateNumber:     plateNumber.toUpperCase().trim(),
                    // Campos VamoMuni denormalizados (fuente de verdad en municipal_profiles)
                    municipalStatus: 'pending_municipal_review',
                    municipalCode:   generatedCode,
                    servicesOffered: { normal: false, premium: false, express: true, pets: false, scheduled: false, shared: false },
                    currentBalance:  0,
                    photoURL,
                    vehicleFrontPhotoURL,
                    acceptedTerms:    true,
                    acceptedTermsAt:  serverTimestamp(),
                    termsVersion:     'v1.3',
                    createdAt:       serverTimestamp(),
                    updatedAt:       serverTimestamp(),
                });

                // ── 3. Crear municipal_profiles/{uid} ───────────────────────────
                tx.set(munProfileRef, {
                    driverId:               newUser.uid,
                    driverName:             name,
                    driverEmail:            newUser.email,
                    driverPhone:            phone.replace(/[\s\-\+()]/g, ''),
                    city,
                    cityKey,
                    municipalCode:          generatedCode,
                    municipalStatus:        'pending_municipal_review',
                    canonStatus:            'pending',
                    licenseExpiry:          null,
                    insuranceExpiry:        null,
                    backgroundCheckExpiry:  null,
                    enabledAt:              null,
                    enabledBy:              null,
                    canonPaidAt:            null,
                    canonPaidBy:            null,
                    municipalObservation:   null,
                    checklist:              buildEmptyChecklist(),
                    photoURL,
                    vehicleFrontPhotoURL,
                    acceptedTerms:          true,
                    createdAt:              serverTimestamp(),
                    updatedAt:              serverTimestamp(),
                });
            });

            // ── 4. drivers_locations (fuera de la tx porque no requiere el contador) ──
            await setDoc(locationRef, {
                geohash:        null,
                currentLocation:null,
                lastSeenAt:     serverTimestamp(),
                driverStatus:   'offline',
                approved:       false,
                isSuspended:    false,
                pendingOffers:  0,
                updatedAt:      serverTimestamp(),
            });

            console.log(`🏛️ [EXPRESS_REGISTER] uid=${newUser.uid} code=${generatedCode} city=${city}`);

            toast({
                title: '¡Registro recibido!',
                description: `Tu código municipal es ${generatedCode}. Presentate en la municipalidad de ${city} con la documentación requerida.`,
            });

            router.replace('/auth/continue');

        } catch (error: any) {
            console.error('❌ [DRIVER_SIGNUP] Error:', error);

            // Cleanup: si Auth tuvo éxito pero Firestore falló, eliminar el usuario de Auth
            if (newUserCreated) {
                try {
                    await deleteUser(newUserCreated);
                } catch (_) {}
            }

            let description = error.message;
            if (error.code === 'auth/email-already-in-use') description = 'Este email ya está registrado.';
            else if (error.code === 'permission-denied')    description = 'Error de permisos. Contactá a soporte.';

            toast({ variant: 'destructive', title: 'Error de registro', description });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'vehicle') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'profile') {
            setProfilePhoto(file);
            setProfilePhotoPreview(URL.createObjectURL(file));
        } else {
            setVehiclePhoto(file);
            setVehiclePhotoPreview(URL.createObjectURL(file));
        }
    };

    const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (isExpress) {
            // Formato AA-123-BB
            let formatted = '';
            for (let i = 0; i < val.length; i++) {
                if (i < 2) {
                    if (/[A-Z]/.test(val[i])) formatted += val[i];
                } else if (i < 5) {
                    if (i === 2 && formatted.length === 2) formatted += '-';
                    if (/[0-9]/.test(val[i])) formatted += val[i];
                } else if (i < 7) {
                    if (i === 5 && formatted.length === 6) formatted += '-';
                    if (/[A-Z]/.test(val[i])) formatted += val[i];
                }
            }
            setPlateNumber(formatted);
        } else {
            setPlateNumber(val);
        }
    };

    // ─── RENDER ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4 py-12">
            <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* HEADER */}
                <div className="text-center space-y-2">
                    <h1 className="text-5xl font-black text-white tracking-tighter italic">
                        Vam<span className="text-primary not-italic">O</span>{' '}
                        <span className="text-primary/80 text-3xl align-top non-italic font-bold">DRIVE</span>
                    </h1>
                    <p className="text-zinc-500 font-medium tracking-wide">Registro exclusivo para conductores</p>
                </div>

                <Card className="border-white/5 bg-zinc-900/40 backdrop-blur-xl shadow-2xl rounded-[2.5rem] overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xl font-bold text-white">Completá todos los campos</CardTitle>
                        <CardDescription className="text-zinc-500 italic">
                            Tu cuenta será habilitada luego de la verificación correspondiente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-6">

                            {/* ── SELECTOR DE SUBTIPO ─────────────────────────────── */}
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">
                                    Tipo de conductor
                                </Label>
                                <div className="grid grid-cols-3 gap-2 p-1 bg-white/[0.03] rounded-2xl border border-white/5">
                                    {([ ['taxi', 'Taxi'], ['remis', 'Remis'], ['express', 'Particular'] ] as const).map(([val, label]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setDriverSubtype(val)}
                                            className={cn(
                                                'h-11 rounded-xl text-xs font-bold transition-all uppercase tracking-widest',
                                                driverSubtype === val
                                                    ? val === 'express'
                                                        ? 'bg-amber-600 text-white shadow-lg'
                                                        : 'bg-indigo-600 text-white shadow-lg'
                                                    : 'text-zinc-500 hover:text-zinc-300'
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {isExpress && (
                                    <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                                        <VamoIcon name="landmark" className="w-6 h-6 text-amber-400 shrink-0" />
                                        <p className="text-sm font-black text-amber-400 uppercase tracking-wide leading-tight">
                                            Habilitación municipal requerida para operar
                                        </p>
                                    </div>
                                )}
                            </div>

                                 {isClassic && (
                                     <div className="mt-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                                         <VamoIcon name="shield-check" className="w-6 h-6 text-indigo-400 shrink-0" />
                                         <p className="text-xs font-bold text-indigo-300 leading-tight">
                                             VamO podrá solicitar documentación adicional para validar tu identidad y habilitación profesional antes de activar tu cuenta.
                                         </p>
                                     </div>
                                 )}

                            {/* Solo mostrar el formulario si se eligió subtype */}
                            {driverSubtype && (
                                <>
                                    {/* ── DATOS PERSONALES ───────────────────────── */}
                                    <div className="space-y-4">
                                        <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">
                                            Datos Personales
                                        </Label>
                                        <Input
                                            placeholder="Nombre y Apellido"
                                            value={name} onChange={e => setName(e.target.value)} required
                                            className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600 focus:bg-white/[0.07] transition-all"
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Input
                                                type="email" placeholder="Email"
                                                value={email} onChange={e => setEmail(e.target.value)} required
                                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600 focus:bg-white/[0.07] transition-all"
                                            />
                                            <Input
                                                type="tel" placeholder="Teléfono (WhatsApp)"
                                                value={phone} onChange={e => setPhone(e.target.value)} required
                                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600 focus:bg-white/[0.07] transition-all"
                                            />
                                        </div>
                                        <Input
                                            type="password" placeholder="Contraseña (mínimo 6 caracteres)"
                                            value={password} onChange={e => setPassword(e.target.value)} required
                                            className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600 focus:bg-white/[0.07] transition-all"
                                        />
                                    </div>

                                    {/* ── GÉNERO ─────────────────────────────────── */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Género</Label>
                                        <div className="flex gap-3 p-1 bg-white/[0.03] rounded-2xl border border-white/5">
                                            {(['male', 'female'] as const).map((g) => (
                                                <button
                                                    key={g} type="button" onClick={() => setGender(g)}
                                                    className={cn(
                                                        'flex-1 h-11 rounded-xl text-xs font-bold transition-all uppercase tracking-widest',
                                                        gender === g
                                                            ? g === 'male' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-pink-600 text-white shadow-lg'
                                                            : 'text-zinc-500 hover:text-zinc-300'
                                                    )}
                                                >
                                                    {g === 'male' ? 'Hombre' : 'Mujer'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── CIUDAD (solo express) ──────────────────── */}
                                    {isExpress && (
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">
                                                Ciudad donde vas a operar
                                            </Label>
                                            <Select value={city} onValueChange={setCity}>
                                                <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white">
                                                    <SelectValue placeholder="Seleccioná tu ciudad" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                    {EXPRESS_CITIES.map(c => (
                                                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* ── INFORMACIÓN DEL VEHÍCULO ───────────────── */}
                                    <div className="space-y-4 pt-2 border-t border-white/5">
                                        <Label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">
                                            Información del Vehículo
                                        </Label>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* vehicleType solo para taxi/remis */}
                                            {isClassic && (
                                                <Select value={vehicleType} onValueChange={val => setVehicleType(val as VehicleType)}>
                                                    <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white">
                                                        <SelectValue placeholder="Tipo" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                        <SelectItem value="remis">Remis</SelectItem>
                                                        <SelectItem value="taxi">Taxi</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}

                                            <Select value={carModelYear} onValueChange={setCarModelYear}>
                                                <SelectTrigger className={cn(
                                                    'h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white',
                                                    isExpress && 'col-span-2'
                                                )}>
                                                    <SelectValue placeholder="Año del vehículo" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-900 border-white/10 text-white max-h-[200px]">
                                                    {years.filter(y => !isExpress || parseInt(y, 10) >= 2016).map(year => (
                                                        <SelectItem key={year} value={year}>{year}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <Input
                                                placeholder={isExpress ? "Patente (Ej: AA-123-BB)" : "Patente (Ej: AF123BC)"}
                                                value={plateNumber} onChange={handlePlateChange} required
                                                className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600 uppercase font-mono"
                                            />

                                            {/* licenseNumber solo para taxi/remis */}
                                            {isClassic && (
                                                <Input
                                                    placeholder="N° Licencia"
                                                    value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} required
                                                    className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600"
                                                />
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                            {/* FOTO PERFIL */}
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                                                    Foto de perfil del conductor
                                                </Label>
                                                <div 
                                                    className="relative h-32 rounded-2xl bg-white/[0.03] border-2 border-dashed border-white/10 hover:border-primary/50 transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                                                    onClick={() => document.getElementById('profile-input')?.click()}
                                                >
                                                    {profilePhotoPreview ? (
                                                        <img src={profilePhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <>
                                                            <VamoIcon name="user" className="w-8 h-8 text-zinc-700 mb-1" />
                                                            <span className="text-[10px] font-bold text-zinc-600 uppercase">Subí tu rostro</span>
                                                        </>
                                                    )}
                                                    <input id="profile-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'profile')} />
                                                </div>
                                            </div>

                                            {/* FOTO VEHÍCULO */}
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                                                    Foto frontal del vehículo
                                                </Label>
                                                <div 
                                                    className="relative h-32 rounded-2xl bg-white/[0.03] border-2 border-dashed border-white/10 hover:border-primary/50 transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                                                    onClick={() => document.getElementById('vehicle-input')?.click()}
                                                >
                                                    {vehiclePhotoPreview ? (
                                                        <img src={vehiclePhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <>
                                                            <VamoIcon name="car" className="w-8 h-8 text-zinc-700 mb-1" />
                                                            <span className="text-[10px] font-bold text-zinc-600 uppercase">Patente clara</span>
                                                        </>
                                                    )}
                                                    <input id="vehicle-input" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'vehicle')} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-3 p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                                        <Checkbox 
                                            id="terms" 
                                            checked={acceptedTerms} 
                                            onCheckedChange={(checked) => setAcceptedTerms(!!checked)} 
                                            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        <label htmlFor="terms" className="text-[10px] font-bold text-zinc-400 leading-tight uppercase tracking-tight">
                                            Acepto los{" "}
                                            <button 
                                                type="button"
                                                onClick={() => setShowTerms(true)}
                                                className="text-primary hover:underline underline-offset-4"
                                            >
                                                términos y condiciones
                                            </button> de VamO
                                        </label>
                                    </div>

                                    {isClassic && (
                                        <div className="rounded-2xl border-2 border-indigo-500/30 bg-indigo-500/10 p-5 space-y-3 shadow-lg shadow-indigo-500/5">
                                            <p className="text-base font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                                <VamoIcon name="shield-check" className="w-5 h-5 shrink-0" />
                                                Verificación Profesional
                                            </p>
                                            <p className="text-[10px] font-bold text-indigo-300/80 leading-relaxed uppercase tracking-wider">
                                                Como conductor de Taxi o Remis, VamO podrá requerir documentación adicional para verificar tu identidad y habilitación antes de activar tu cuenta. Asegurate de tener tus comprobantes legales a mano.
                                            </p>
                                        </div>
                                    )}

                                    {/* ── AVISO EXPRESS ──────────────────────────── */}
                                    {isExpress && (
                                        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 p-5 space-y-3 shadow-lg shadow-amber-500/5">
                                            <p className="text-base font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                                <VamoIcon name="alert-triangle" className="w-5 h-5 shrink-0" />
                                                Trámite Municipal Obligatorio
                                            </p>
                                            <p className="text-sm text-zinc-300 font-medium pb-2 border-b border-white/5">
                                                Antes de recibir viajes, deberás presentar en la municipalidad:
                                            </p>
                                            <ul className="text-sm text-zinc-300 space-y-1 ml-2 list-disc list-outside pl-4">
                                                <li>DNI (frente y dorso)</li>
                                                <li>Licencia de conducir vigente</li>
                                                <li>Seguro del vehículo</li>
                                                <li>Cédula del vehículo</li>
                                                <li>Antecedentes penales vigentes</li>
                                                <li>Canon municipal (arancel de habilitación)</li>
                                            </ul>
                                            <p className="text-xs text-zinc-500 mt-2">
                                                Tu código municipal se generará al registrarte. Presentalo junto a la documentación.
                                            </p>
                                        </div>
                                    )}

                                    {/* ── BOTÓN SUBMIT ───────────────────────────── */}
                                    <Button
                                        type="submit" disabled={isSubmitting}
                                        className="w-full h-16 rounded-2xl text-lg font-black uppercase tracking-widest shadow-xl shadow-primary/20 bg-gradient-to-br from-primary via-primary to-primary/80 hover:to-primary transition-all active:scale-95"
                                    >
                                        {isSubmitting ? (
                                            <VamoIcon name="loader" className="animate-spin mr-2 h-5 w-5" />
                                        ) : (
                                            <>
                                                <VamoIcon name="check-circle" className="mr-2 h-5 w-5" />
                                                {isExpress ? 'Registrarme y solicitar habilitación' : 'Registrarme como Conductor'}
                                            </>
                                        )}
                                    </Button>
                                </>
                            )}
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* ── MODAL DE TÉRMINOS ────────────────────────────────────────── */}
            <Dialog open={showTerms} onOpenChange={setShowTerms}>
                <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                            <VamoIcon name="shield-check" className="w-8 h-8 text-primary" />
                            Términos y Condiciones
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                            VamO - Gestión de Movilidad
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4 text-sm text-zinc-300 leading-relaxed font-medium">
                        <section>
                            <h3 className="text-white font-black uppercase text-xs tracking-widest mb-2 border-l-4 border-primary pl-3">1. Naturaleza del Servicio</h3>
                            <p>VamO es un <strong>intermediario tecnológico</strong> que pone en contacto a pasajeros con conductores independientes. VamO NO presta servicios de transporte ni es una empresa de logística.</p>
                        </section>

                        <section>
                            <h3 className="text-white font-black uppercase text-xs tracking-widest mb-2 border-l-4 border-primary pl-3">2. Independencia del Conductor</h3>
                            <p>El Conductor actúa como un <strong>profesional independiente</strong>. No existe relación de dependencia laboral, subordinación jurídica ni técnica entre el Conductor y VamO.</p>
                        </section>

                        <section>
                            <h3 className="text-white font-black uppercase text-xs tracking-widest mb-2 border-l-4 border-primary pl-3">3. Fondo de Asistencia VamO (F.A.P.)</h3>
                            <p>El Fondo de Asistencia VamO constituye un <strong>beneficio discrecional y limitado</strong> destinado única y exclusivamente a la asistencia económica ante imprevistos operativos. NO constituye un contrato de seguro. La asistencia consiste en el reintegro de gastos documentados bajo las reglas vigentes en la plataforma.</p>
                        </section>

                        <section>
                            <h3 className="text-white font-black uppercase text-xs tracking-widest mb-2 border-l-4 border-primary pl-3">4. Verificación de Identidad y Documentación</h3>
                            <p>VamO se reserva el derecho de solicitar documentación adicional (DNI, Licencia, Cédula del vehículo, Certificados de Antecedentes, etc.) para verificar la identidad del Conductor y su condición legal/profesional declarada, especialmente en registros como Taxi o Remis.</p>
                        </section>

                        <section>
                            <h3 className="text-white font-black uppercase text-xs tracking-widest mb-2 border-l-4 border-primary pl-3">5. Limitación de Responsabilidad</h3>
                            <p>Debido a su naturaleza de intermediario, VamO no garantiza la seguridad, puntualidad ni veracidad de los datos de los usuarios. Cualquier conflicto derivado del servicio se rige bajo la <strong>jurisdicción de Rawson, Provincia del Chubut</strong>.</p>
                        </section>
                    </div>

                    <DialogFooter className="pt-4 border-t border-white/5">
                        <Button 
                            className="w-full bg-primary text-primary-foreground font-black uppercase h-12 rounded-2xl"
                            onClick={() => {
                                setAcceptedTerms(true);
                                setShowTerms(false);
                            }}
                        >
                            Comprendo y Acepto
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
