'use client';

import React, { useState } from 'react';
import { useAuth, useFunctions, useFirebase } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function RegisterPageClient() {
    const auth = useAuth();
    const functions = useFunctions();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { app: firebaseApp } = useFirebase();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<{email?: string, password?: string}>({});

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // --- 1. STRONG MUTEX [VamO PRO] ---
        if (isSubmitting) return;

        // Inline Validation
        const newErrors: {email?: string, password?: string} = {};
        if (!email) newErrors.email = 'El email es obligatorio.';
        if (!password) newErrors.password = 'La contraseña es obligatoria.';
        else if (password.length < 6) newErrors.password = 'Mínimo 6 caracteres.';
        
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        if (!auth || !functions) return;
        
        setIsSubmitting(true);
        setErrors({});

        const startTime = Date.now();
        console.log("🚀 [REGISTER_START] Inicia registro de pasajero.");

        try {
            // --- 2. AUTH CREATION ---
            if (auth.currentUser) await signOut(auth);
            const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const newUser = userCredential.user;
            
            console.log("🔐 [AUTH_CREATED] User UID:", newUser.uid);

            const refParam = searchParams.get('ref') || searchParams.get('r') || (typeof window !== 'undefined' ? (localStorage.getItem('referralCode') || localStorage.getItem('vamo_captured_referral')) : null);
            
            // --- 3. BACKEND REGISTRATION [ATOMIC] ---
            console.log("☁️ [BACKEND_REGISTRATION_START] Llamando a completePassengerRegistrationV1...");
            const completeRegistration = httpsCallable(functions, 'completePassengerRegistrationV1');
            
            const registrationResult = await completeRegistration({
                referralCode: refParam,
                device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
            });

            console.log("✅ [REGISTER_FINISHED] Registro completado con éxito.", registrationResult.data);

            await sendEmailVerification(newUser);

            toast({ title: '¡Registro exitoso!', description: 'Completá tu perfil para continuar.' });
            
            // --- 4. CLEANUP & REDIRECT ---
            if (refParam && typeof window !== 'undefined') {
                localStorage.removeItem('referralCode');
                localStorage.removeItem('vamo_captured_referral');
            }

            const latency = Date.now() - startTime;
            console.log(`⏱️ [LATENCY] Registration took ${latency}ms`);

            console.log("[REGISTER_FLOW_SUCCESS] Registration completed. Redirecting to onboarding...");
            router.replace('/dashboard/complete-profile');
        } catch (error: any) {
            console.error("🔥 [REGISTER_FLOW_FAILED] Error during registration:", error);
            
            // [IMPORTANT] We no longer signOut automatically. 
            // If the account exists, we let the user resume by logging in.

            let message = error.message;
            if (error.code === 'auth/email-already-in-use') {
                message = 'Este email ya está registrado. Podés continuar tu registro iniciando sesión.';
                setErrors({ email: message });
            }
            toast({ variant: 'destructive', title: 'Error de registro', description: message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGoToLogin = () => {
        router.push(`/login/pasajero?email=${encodeURIComponent(email)}`);
    };

    if (isSubmitting) return <VamoFullScreenLoader label="Creando cuenta..." />;

    return (
        <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
            <Card className="w-full max-w-[420px] bg-zinc-900 border-white/5 shadow-2xl">
                <CardHeader className="text-center pb-2">
                    <div className="w-full flex justify-center mb-6">
                        <div className="w-[140px]">
                            <VamoLogo variant="login" priority />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-black text-white">Crear Cuenta</CardTitle>
                    <CardDescription>Sumate a la red de pasajeros VamO</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSignUp}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input 
                                    id="email" 
                                    type="email" 
                                    value={email} 
                                    onChange={e => { setEmail(e.target.value); setErrors({...errors, email: undefined}); }}
                                    className={errors.email ? 'border-red-500 bg-red-500/5' : 'bg-white/5 border-white/10'}
                                />
                                {errors.email && (
                                    <div className="space-y-2">
                                        <p className="text-red-500 text-xs font-bold">{errors.email}</p>
                                        {errors.email.includes("ya está registrado") && (
                                            <Button 
                                                type="button" 
                                                onClick={handleGoToLogin}
                                                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl"
                                            >
                                                CONTINUAR REGISTRO →
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña</Label>
                                <Input 
                                    id="password" 
                                    type="password" 
                                    value={password} 
                                    onChange={e => { setPassword(e.target.value); setErrors({...errors, password: undefined}); }}
                                    className={errors.password ? 'border-red-500 bg-red-500/5' : 'bg-white/5 border-white/10'}
                                />
                                {errors.password && <p className="text-red-500 text-xs font-bold">{errors.password}</p>}
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 h-14 rounded-2xl text-lg font-black uppercase tracking-widest shadow-xl shadow-indigo-600/10 active:scale-[0.98]">
                                REGISTRARME
                            </Button>
                        </div>
                    </form>
                    <div className="mt-6 text-center">
                        <button 
                            type="button"
                            onClick={() => router.push('/login')} 
                            className="text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-all"
                        >
                            ¿Ya tenés cuenta? <span className="text-indigo-400">Iniciá sesión</span>
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
