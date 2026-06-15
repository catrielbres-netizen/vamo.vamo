'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useFirebase } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VamoIcon } from '@/components/VamoIcon';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { useToast } from '@/hooks/use-toast';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CURRENT_TERMS_VERSION } from "@/lib/legal-config";
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { useSearchParams } from 'next/navigation';
import { useActiveCities } from '@/hooks/useActiveCities';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';

type Step = 'IDENTITY' | 'SECURITY' | 'PROFILE' | 'LEGAL' | 'PERMISSIONS' | 'FINALIZING';

function OnboardingPasajeroContent() {
    const router = useRouter();
    const { auth } = useFirebase();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const { cities, loading: citiesLoading } = useActiveCities();

    const queryCity = searchParams.get('city');
    const initialCity = queryCity || 'rawson';

    const [currentStep, setCurrentStep] = useState<Step>('IDENTITY');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        email: '',
        emailConfirm: '',
        password: '',
        passwordConfirm: '',
        name: '',
        surname: '',
        phone: '',
        dni: '',
        cityKey: initialCity,
        termsAccepted: false
    });

    // Update cityKey if query param or cities list changes and it's valid
    useEffect(() => {
        if (queryCity && cities.length > 0) {
            const isValidCity = cities.some(c => c.cityKey === queryCity);
            if (isValidCity) {
                setFormData(prev => ({...prev, cityKey: queryCity}));
            }
        }
    }, [queryCity, cities]);

    // Handle Google SSO initialization
    useEffect(() => {
        const method = searchParams.get('method');
        if (method === 'google' && auth?.currentUser) {
            setCurrentStep('PROFILE');
            setFormData(prev => ({
                ...prev,
                email: auth.currentUser?.email || prev.email,
                name: prev.name || auth.currentUser?.displayName?.split(' ')[0] || '',
                surname: prev.surname || auth.currentUser?.displayName?.split(' ').slice(1).join(' ') || ''
            }));
        }
    }, [searchParams, auth?.currentUser]);

    // Security validation logic for the UI
    const isPasswordValid = formData.password.length >= 8;
    const passwordsMatch = formData.password === formData.passwordConfirm && formData.passwordConfirm !== '';
    const hasUpper = /[A-Z]/.test(formData.password);
    const hasNumber = /[0-9]/.test(formData.password);
    
    // TEMPORARY SIMPLIFICATION as requested: Just 8 chars and matching
    const isStrongEnough = isPasswordValid; // Simplified: ignores uppercase/number for now
    const canSubmitSecurity = isStrongEnough && passwordsMatch;

    // --- DEBUG LOGS ---
    useEffect(() => {
        if (currentStep === 'SECURITY') {
            console.log("🔐 [AUTH_DEBUG] Validation State:", {
                passwordLength: formData.password.length,
                passwordsMatch,
                hasUppercase: hasUpper,
                hasNumber: hasNumber,
                isPasswordValid,
                isStrongEnough,
                canSubmitSecurity,
                isSubmitting
            });
        }
    }, [formData.password, formData.passwordConfirm, passwordsMatch, isPasswordValid, isStrongEnough, canSubmitSecurity, currentStep, isSubmitting, hasUpper, hasNumber]);

    // --- NAVIGATION ---
    const nextStep = (step: Step) => {
        console.log(`[ONBOARDING] Navigating to ${step}`);
        setCurrentStep(step);
    };

    // --- LOGIC ---
    const handleRegisterAuth = async () => {
        if (formData.email !== formData.emailConfirm) {
            toast({ variant: 'destructive', title: 'Emails no coinciden', description: 'Por favor verificá tu correo.' });
            return;
        }
        if (formData.password !== formData.passwordConfirm) {
            toast({ variant: 'destructive', title: 'Contraseñas no coinciden', description: 'Deben ser iguales.' });
            return;
        }
        if (formData.password.length < 8) {
            toast({ variant: 'destructive', title: 'Contraseña corta', description: 'Mínimo 8 caracteres.' });
            return;
        }

        setIsSubmitting(true);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");
            // 1. Create the Auth user
            await createUserWithEmailAndPassword(auth, formData.email.trim().toLowerCase(), formData.password);
            console.log("[ONBOARDING] Auth account created.");
            
            // 2. Initialize Firestore document and Wallet (Atomic Backend)
            const functions = getFunctions(undefined, 'us-central1');
            const initBackend = httpsCallable(functions, 'completePassengerRegistrationV1');
            await initBackend({
                device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
            });
            console.log("[ONBOARDING] Backend initialized.");

            nextStep('PROFILE');
        } catch (error: any) {
            console.error("[ONBOARDING_AUTH_ERROR]", error);
            let msg = "Error al crear la cuenta.";
            if (error.code === 'auth/email-already-in-use') msg = "El email ya está registrado.";
            toast({ variant: 'destructive', title: 'Error', description: msg });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGoogleAuthSuccess = async (userCredential: any) => {
        setIsSubmitting(true);
        try {
            const user = userCredential.user;
            // Initialize Firestore document and Wallet (Atomic Backend)
            const functions = getFunctions(undefined, 'us-central1');
            const initBackend = httpsCallable(functions, 'completePassengerRegistrationV1');
            await initBackend({
                device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
            });
            console.log("[ONBOARDING] Backend initialized via Google.");
            
            setFormData(prev => ({
                ...prev,
                email: user.email || '',
                name: user.displayName?.split(' ')[0] || '',
                surname: user.displayName?.split(' ').slice(1).join(' ') || ''
            }));
            
            nextStep('PROFILE');
        } catch (error: any) {
            console.error("[ONBOARDING_GOOGLE_ERROR]", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar el registro con Google.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!formData.name || !formData.surname || !formData.phone || !formData.dni) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'Todos los campos son obligatorios.' });
            return;
        }
        nextStep('LEGAL');
    };

    const handleFinalize = async () => {
        setIsSubmitting(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const completeRegistration = httpsCallable(functions, 'updateProfileV1');
            
            await completeRegistration({
                name: formData.name,
                surname: formData.surname,
                displayName: `${formData.name} ${formData.surname[0]}.`,
                phone: formData.phone.replace(/[\s\-\+()]/g, ''),
                dni: formData.dni,
                cityKey: formData.cityKey,
                role: 'passenger',
                registrationStatus: 'active',
                profileCompleted: true,
                onboardingCompleted: true,
                termsAccepted: true,
                termsVersion: CURRENT_TERMS_VERSION,
                termsAcceptedAt: new Date()
            });

            console.log("[ONBOARDING_SUCCESS] Profile activated.");
            nextStep('FINALIZING');
            
            setTimeout(() => {
                router.replace('/dashboard/ride');
            }, 1500);

        } catch (error: any) {
            console.error("[ONBOARDING_FINALIZE_ERROR]", error);
            toast({ variant: 'destructive', title: 'Error final', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (currentStep === 'FINALIZING') {
        return <VamoFullScreenLoader label="Activando tu perfil PRO..." />;
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute inset-0 bg-morphic opacity-20 pointer-events-none" />
            
            <div className="w-full max-w-sm flex flex-col items-center z-10">
                <div className="w-full flex justify-center mb-12"><VamoLogo variant="login" /></div>

                {/* NO AnimatePresence or motion.div to ensure absolute stability */}
                <div className="w-full">
                    {currentStep === 'IDENTITY' && (
                        <div className="space-y-6 w-full">
                            <div className="space-y-2 text-center mb-8">
                                <h2 className="text-2xl font-black text-white uppercase italic">Tu Identidad</h2>
                                <p className="text-zinc-500 text-xs font-medium tracking-widest uppercase">Paso 1 de 5</p>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Email</Label>
                                    <Input 
                                        type="email" placeholder="tu@email.com" 
                                        value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                                        className="h-14 bg-white/5 border-white/5 rounded-2xl text-white placeholder:text-zinc-800"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Confirmar Email</Label>
                                    <Input 
                                        type="email" placeholder="Repetir email" 
                                        value={formData.emailConfirm} onChange={e => setFormData({...formData, emailConfirm: e.target.value})}
                                        className="h-14 bg-white/5 border-white/5 rounded-2xl text-white placeholder:text-zinc-800"
                                    />
                                </div>
                                <Button 
                                    onClick={() => nextStep('SECURITY')}
                                    className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl mt-6 shadow-xl shadow-indigo-600/20"
                                >
                                    Continuar
                                </Button>
                                <div className="pt-4">
                                    <div className="relative mb-4">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-white/5"></div>
                                        </div>
                                        <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                                            <span className="bg-zinc-950 px-4 text-zinc-600">O bien</span>
                                        </div>
                                    </div>
                                    <GoogleAuthButton 
                                        onSuccess={handleGoogleAuthSuccess}
                                        disabled={isSubmitting}
                                        mode="register"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 'SECURITY' && (
                        <div className="space-y-6 w-full">
                            <div className="space-y-2 text-center mb-8">
                                <h2 className="text-2xl font-black text-white uppercase italic">Seguridad</h2>
                                <p className="text-zinc-500 text-xs font-medium tracking-widest uppercase">Paso 2 de 5</p>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Contraseña</Label>
                                    <Input 
                                        type="password" placeholder="••••••••" 
                                        value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                                        className="h-14 bg-white/5 border-white/5 rounded-2xl text-white placeholder:text-zinc-800"
                                    />
                                    <div className="flex flex-col gap-1 ml-1 mt-1">
                                        <p className={`text-[9px] uppercase tracking-tighter ${isPasswordValid ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                            {isPasswordValid ? '✓' : '○'} Mínimo 8 caracteres
                                        </p>
                                        <p className={`text-[9px] uppercase tracking-tighter ${hasUpper ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                            {hasUpper ? '✓' : '○'} Una mayúscula
                                        </p>
                                        <p className={`text-[9px] uppercase tracking-tighter ${hasNumber ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                            {hasNumber ? '✓' : '○'} Un número
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Repetir Contraseña</Label>
                                    <Input 
                                        type="password" placeholder="••••••••" 
                                        value={formData.passwordConfirm} onChange={e => setFormData({...formData, passwordConfirm: e.target.value})}
                                        className="h-14 bg-white/5 border-white/5 rounded-2xl text-white placeholder:text-zinc-800"
                                    />
                                    {formData.passwordConfirm !== '' && !passwordsMatch && (
                                        <p className="text-[9px] text-red-500 uppercase font-bold ml-1 mt-1">Las contraseñas no coinciden</p>
                                    )}
                                    {formData.passwordConfirm !== '' && passwordsMatch && (
                                        <p className="text-[9px] text-emerald-500 uppercase font-bold ml-1 mt-1">¡Coinciden!</p>
                                    )}
                                </div>
                                <Button 
                                    onClick={handleRegisterAuth}
                                    disabled={isSubmitting || !canSubmitSecurity}
                                    className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl mt-6 shadow-xl shadow-indigo-600/20 disabled:opacity-30 disabled:grayscale"
                                >
                                    {isSubmitting ? <VamoIcon name="loader" className="animate-spin" /> : "Crear Cuenta"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 'PROFILE' && (
                        <div className="space-y-6 w-full">
                            <div className="space-y-2 text-center mb-6">
                                <h2 className="text-2xl font-black text-white uppercase italic">Tu Perfil</h2>
                                <p className="text-zinc-500 text-xs font-medium tracking-widest uppercase">Paso 3 de 5</p>
                            </div>
                            <div className="space-y-4 overflow-y-auto max-h-[60vh] px-1">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Nombre</Label>
                                        <Input 
                                            value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                                            className="h-12 bg-white/5 border-white/5 rounded-xl text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Apellido</Label>
                                        <Input 
                                            value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})}
                                            className="h-12 bg-white/5 border-white/5 rounded-xl text-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Teléfono</Label>
                                    <Input 
                                        placeholder="280 4123456"
                                        value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                                        className="h-12 bg-white/5 border-white/5 rounded-xl text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">DNI / ID Personal</Label>
                                    <Input 
                                        placeholder="Número de documento"
                                        value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})}
                                        className="h-12 bg-white/5 border-white/5 rounded-xl text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Ciudad</Label>
                                    <Select 
                                        value={formData.cityKey} 
                                        onValueChange={val => setFormData({...formData, cityKey: val})}
                                        disabled={!!queryCity || citiesLoading}
                                    >
                                        <SelectTrigger className="h-12 bg-zinc-900 border-white/5 rounded-xl text-white disabled:opacity-50">
                                            <SelectValue placeholder={citiesLoading ? "Cargando..." : "Selecciona una ciudad"} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                            {citiesLoading ? (
                                                <SelectItem value="loading" disabled>Cargando ciudades...</SelectItem>
                                            ) : (
                                                cities.map(city => (
                                                    <SelectItem key={city.cityKey} value={city.cityKey}>{city.name}</SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {!!queryCity && (
                                        <p className="text-[10px] text-indigo-400 italic ml-1 mt-1">Ciudad asignada por enlace municipal.</p>
                                    )}
                                </div>
                                <Button 
                                    onClick={handleSaveProfile}
                                    className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl mt-4"
                                >
                                    Siguiente
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 'LEGAL' && (
                        <div className="space-y-6 w-full">
                            <div className="space-y-2 text-center mb-8">
                                <h2 className="text-2xl font-black text-white uppercase italic">Legal</h2>
                                <p className="text-zinc-500 text-xs font-medium tracking-widest uppercase">Paso 4 de 5</p>
                            </div>
                            <div className="bg-zinc-900/50 p-6 rounded-[2rem] border border-white/5 space-y-4">
                                <div className="flex items-start gap-4">
                                    <Checkbox 
                                        id="terms" checked={formData.termsAccepted} 
                                        onCheckedChange={checked => setFormData({...formData, termsAccepted: checked === true})}
                                        className="mt-1 border-indigo-500/50"
                                    />
                                    <label htmlFor="terms" className="text-xs text-zinc-400 leading-relaxed cursor-pointer">
                                        Acepto los <span className="text-indigo-400 font-bold underline">Términos y Condiciones</span> de VamO Pasajero y reconozco el marco de asistencia F.A.P.
                                    </label>
                                </div>
                            </div>
                            <Button 
                                onClick={() => nextStep('PERMISSIONS')}
                                disabled={!formData.termsAccepted}
                                className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-600/20 disabled:opacity-30"
                            >
                                Continuar
                            </Button>
                        </div>
                    )}

                    {currentStep === 'PERMISSIONS' && (
                        <div className="space-y-6 w-full">
                            <div className="space-y-2 text-center mb-8">
                                <h2 className="text-2xl font-black text-white uppercase italic">Permisos</h2>
                                <p className="text-zinc-500 text-xs font-medium tracking-widest uppercase">Paso 5 de 5</p>
                            </div>
                            <div className="space-y-4">
                                <div className="p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center gap-4">
                                    <VamoIcon name="map-pin" className="h-6 w-6 text-indigo-400" />
                                    <div className="text-left">
                                        <p className="text-xs font-black text-white uppercase tracking-tighter">Ubicación</p>
                                        <p className="text-[10px] text-zinc-500">Necesaria para encontrarte y calcular el costo.</p>
                                    </div>
                                </div>
                                <div className="p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center gap-4">
                                    <VamoIcon name="bell" className="h-6 w-6 text-indigo-400" />
                                    <div className="text-left">
                                        <p className="text-xs font-black text-white uppercase tracking-tighter">Notificaciones</p>
                                        <p className="text-[10px] text-zinc-500">Te avisaremos cuando el conductor esté llegando.</p>
                                    </div>
                                </div>
                                <Button 
                                    onClick={handleFinalize}
                                    disabled={isSubmitting}
                                    className="w-full h-16 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl mt-6 shadow-xl shadow-indigo-600/20"
                                >
                                    {isSubmitting ? <VamoIcon name="loader" className="animate-spin" /> : "Finalizar Registro"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function OnboardingPasajeroPage() {
    return (
        <React.Suspense fallback={<VamoFullScreenLoader />}>
            <OnboardingPasajeroContent />
        </React.Suspense>
    );
}
