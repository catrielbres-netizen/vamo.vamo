'use client';

import React from 'react';
import { useState } from 'react';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VehicleType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Suspense } from 'react';

const years = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => (2008 + i).toString()).reverse();

function CompleteDriverProfileContent() {
    const { user, profile } = useUser();
    const firestore = useFirestore();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [city, setCity] = useState('Rawson');
    const [carModelYear, setCarModelYear] = useState<string>('');
    const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [referralCodeInput, setReferralCodeInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const firebaseApp = useFirebaseApp();
    const [vPhoto, setVPhoto] = useState<File | null>(null);
    const [vPhotoPreview, setVPhotoPreview] = useState<string | null>(profile?.vehicleFrontPhotoURL || null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // DEEP LINK / CAPTURA: Leer ref=CODE y campaign de la URL o del storage
    React.useEffect(() => {
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

    // Recuperar datos existentes (incluyendo referido guardado en signup)
    React.useEffect(() => {
        if (profile) {
            if (profile.name) setName(profile.name);
            if (profile.phone) setPhone(profile.phone);
            if (profile.city) setCity(profile.city);
            if (profile.carModelYear) setCarModelYear(profile.carModelYear.toString());
            if (profile.vehicleType) setVehicleType(profile.vehicleType);
            if (profile.licenseNumber) setLicenseNumber(profile.licenseNumber);
            if (profile.vehicleFrontPhotoURL) setVPhotoPreview(profile.vehicleFrontPhotoURL);
            
            // Auto-completar referido guardado en el paso anterior (login/signup)
            if (profile.referredByCode && !referralCodeInput) {
                setReferralCodeInput(profile.referredByCode);
            }
        }
    }, [profile, referralCodeInput]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setVPhoto(file);
            setVPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async () => {
        if (!name || !phone || !city || !carModelYear || !vehicleType || !licenseNumber) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, completá todos los campos.' });
            return;
        }
        if (!firestore || !user) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'No se pudo guardar tu perfil. Intentá de nuevo.' });
            return;
        }

        console.log('🟢 CLICK GUARDAR PERFIL (Conductor)');
        setIsSubmitting(true);
        setFormError(null);
        
        let finalPhotoURL = profile?.vehicleFrontPhotoURL || null;

        try {
            // 1. SUBIR FOTO SI HAY UNA NUEVA
            if (vPhoto && firebaseApp) {
                if (!user) throw new Error("Usuario no autenticado");
                const storage = getStorage(firebaseApp);
                const photoRef = ref(storage, `vehicle_photos/${user.uid}/front.jpg`);
                const uploadResult = await uploadBytes(photoRef, vPhoto);
                finalPhotoURL = await getDownloadURL(uploadResult.ref);
            }

            if (!finalPhotoURL) {
                toast({ variant: 'destructive', title: 'Foto obligatoria', description: 'Debes subir una foto frontal de tu vehículo.' });
                setIsSubmitting(false);
                return;
            }

            const functions = getFunctions(undefined, 'us-central1');
            const updateProfile = httpsCallable(functions, 'updateProfileV1');
            const normalizedPhone = phone.replace(/[\s\-\+()]/g, '');

            await updateProfile({
                name,
                phone: normalizedPhone,
                city,
                carModelYear: parseInt(carModelYear, 10),
                vehicleType,
                licenseNumber,
                vehicleFrontPhotoURL: finalPhotoURL,
                photoURL: profile?.photoURL || null, // Preserve profile photo if exists
                licenseVerified: false,
                servicesOffered: { normal: true, express: true, premium: true },
                profileCompleted: true,
                vehicleVerificationStatus: 'pending_review',
            });

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
            }

            console.log('🟢 UPDATE ENVIADO VÍA CLOUD FUNCTION (Conductor)');

            toast({
                title: '¡Perfil actualizado!',
                description: 'Tus datos fueron guardados correctamente.',
            });
            
            router.replace('/driver/complete-profile/verify');
        } catch (error: any) {
            console.error("🔥 FIRESTORE BLOQUEÓ ESTO:", error.code, error.message);
            
            let errorMessage = error.message || 'No se pudo guardar el perfil. Por favor, intentá de nuevo.';
            if (error.code === 'permission-denied') {
                errorMessage = 'No tenés permisos para guardar el perfil.';
            } else if (error.code === 'functions/already-exists' || error.message?.includes('already-exists')) {
                errorMessage = 'Ya existe una cuenta en VamO usando este número de teléfono.';
            }

            setFormError(errorMessage);
            toast({ variant: 'destructive', title: 'Error al Guardar', description: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                     <div className="flex justify-center items-center mb-2">
                        <VamoIcon name="user" className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>Completá tu Perfil de Conductor</CardTitle>
                    </div>
                    <CardDescription>Necesitamos algunos datos para activar tu cuenta.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {formError && (
                        <Alert variant="destructive">
                            <VamoIcon name="alert-triangle" className="h-4 w-4" />
                            <AlertTitle>Error al Guardar</AlertTitle>
                            <AlertDescription>
                                {formError}
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre y Apellido</Label>
                        <Input id="name" type="text" placeholder="Tu nombre completo" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono (WhatsApp)</Label>
                        <Input id="phone" type="tel" placeholder="2804123456" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="licenseNumber">Número de Licencia de Conducir</Label>
                        <Input id="licenseNumber" type="text" placeholder="Tu número de licencia" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} disabled={isSubmitting} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="city">Ciudad Operativa</Label>
                        <Input id="city" type="text" placeholder="Tu ciudad principal" value={city} onChange={(e) => setCity(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="carModelYear">Año del Vehículo</Label>
                            <Select value={carModelYear} onValueChange={setCarModelYear} disabled={isSubmitting}>
                                <SelectTrigger id="carModelYear">
                                    <SelectValue placeholder="Año" />
                                </SelectTrigger>
                                <SelectContent>
                                    {years.map(year => (
                                        <SelectItem key={year} value={year}>{year}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="vehicleType">Tipo de Habilitación</Label>
                            <Select value={vehicleType} onValueChange={(value) => setVehicleType(value as VehicleType)} disabled={isSubmitting}>
                                <SelectTrigger id="vehicleType">
                                    <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="taxi">Taxi</SelectItem>
                                    <SelectItem value="remis">Remis</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="referralCode">¿Te invitó otro conductor? (Opcional)</Label>
                        <Input 
                            id="referralCode" 
                            type="text" 
                            placeholder="Ej: VAMO-A1B2" 
                            value={referralCodeInput} 
                            onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())} 
                            disabled={isSubmitting} 
                            className="uppercase font-mono"
                        />
                    </div>
                    
                    <div className="space-y-3">
                        <Label>Foto Frontal del Vehículo (Patente Visible)</Label>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "relative aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all",
                                vPhotoPreview ? "border-primary/50 bg-black/20" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                            )}
                        >
                            {vPhotoPreview ? (
                                <>
                                    <img src={vPhotoPreview} alt="Vehículo" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                        <VamoIcon name="camera" className="h-8 w-8 text-white" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <VamoIcon name="camera" className="h-10 w-10 text-zinc-700 mb-2" />
                                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Tocar para capturar</p>
                                    <p className="text-[10px] text-zinc-600 mt-1">Asegurate que la patente sea legible</p>
                                </>
                            )}
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handlePhotoChange} 
                            className="hidden" 
                            accept="image/*" 
                            capture="environment"
                        />
                    </div>

                    <Alert variant="destructive" className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700">
                        <VamoIcon name="shield-alert" className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <AlertTitle className="text-yellow-800 dark:text-yellow-300">¡Atención!</AlertTitle>
                        <AlertDescription className="text-yellow-700 dark:text-yellow-500">
                            La foto del vehículo es obligatoria. Debe coincidir con el auto que usarás para trabajar.
                        </AlertDescription>
                    </Alert>

                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? 'Guardando...' : 'Guardar y Continuar'}
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}

export default function CompleteDriverProfilePage() {
    return (
        <Suspense fallback={<div className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen font-bold">Cargando...</div>}>
            <div className="py-10">
                <CompleteDriverProfileContent />
            </div>
        </Suspense>
    );
}
