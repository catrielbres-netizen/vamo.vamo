'use client';

import React, { useState, useEffect } from 'react';
import { useUser, useFirebase } from '@/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { DriverOnboardingWizard } from './DriverOnboardingWizard';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function DriverRegisterClient() {
    const { user, profile, loading } = useUser();
    const { auth, firestore } = useFirebase();
    const router = useRouter();
    const { toast } = useToast();

    console.log("[ONBOARDING_DEBUG] DriverRegisterClient mount - User:", user?.uid, "Logged In:", !!user, "Loading:", loading);

    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Auth fields (only used if NOT logged in)
    const [email, setEmail] = useState('');
    const [confirmEmail, setConfirmEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // If user is already logged in, show the wizard or redirect if complete
    useEffect(() => {
        if (user && profile?.profileCompleted) {
            console.log("🛡️ [REGISTER] Profile already completed. Redirecting to dashboard...");
            router.replace('/driver/rides');
        }
    }, [user, profile, router]);

    // While auth is loading, show a full-screen loader to avoid flash
    if (loading) return <VamoFullScreenLoader label="Verificando sesión..." />;

    if (user) {
        // Profile still loading from Firestore
        if (profile === null && !loading) return <VamoFullScreenLoader label="Cargando perfil..." />;
        if (profile?.profileCompleted) return <VamoFullScreenLoader label="Redirigiendo al panel..." />;
        return <DriverOnboardingWizard />;
    }

    const handleInitialSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth || !firestore) return;

        if (!email || !confirmEmail || !password || !confirmPassword) {
            console.log("[ONBOARDING_DEBUG] Initial Signup - Missing fields");
            return toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor completá todos los campos para crear tu cuenta.' });
        }

        if (email !== confirmEmail) {
            return toast({ variant: 'destructive', title: 'Error en email', description: 'Los emails no coinciden.' });
        }

        if (password !== confirmPassword) {
            return toast({ variant: 'destructive', title: 'Error en contraseña', description: 'Las contraseñas no coinciden.' });
        }

        if (password.length < 6) {
            return toast({ variant: 'destructive', title: 'Contraseña débil', description: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        setIsSubmitting(true);
        try {
            console.log("[ONBOARDING_DEBUG] Attempting Firebase Auth creation for:", email);
            const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
            
            console.log("[ONBOARDING_DEBUG] Auth success. Calling backend for atomic registration...");
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const functions = getFunctions(undefined, 'us-central1');
            const completeRegistration = httpsCallable(functions, 'completeDriverRegistrationV1');

            await completeRegistration({});

            console.log("[ONBOARDING_DEBUG] Backend registration success.");

            // Send Verification Email (Automatic)
            try {
                await sendEmailVerification(newUser);
            } catch (err) {
                console.warn("Failed to send automatic verification email:", err);
            }

            toast({ title: '¡Cuenta creada!', description: 'Ahora completá tu perfil de conductor.' });
            // The component will re-render and show the wizard because `user` is now defined
        } catch (error: any) {
            console.error('Signup Error:', error);
            let description = error.message;
            if (error.code === 'auth/email-already-in-use') description = 'Este email ya está registrado.';
            toast({ variant: 'destructive', title: 'Error de registro', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 py-12">
            <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-center space-y-4 flex flex-col items-center">
                    <VamoLogo variant="login" className="mx-auto mb-4" />
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">
                            Comenzar <span className="text-indigo-500">Registro</span>
                        </h1>
                        <p className="text-zinc-500 font-medium tracking-wide">Unite a la red de conductores de VamO</p>
                    </div>
                </div>

                <Card className="border-white/5 bg-zinc-900/40 backdrop-blur-xl shadow-2xl rounded-[2.5rem] overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-white">Creá tu cuenta de acceso</CardTitle>
                        <CardDescription className="text-zinc-500 italic">
                            Luego completarás tus datos personales y vehículo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleInitialSignup} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-widest text-zinc-500 ml-1">Email</Label>
                                    <Input 
                                        type="email" placeholder="email@ejemplo.com" 
                                        value={email} onChange={e => setEmail(e.target.value)} required
                                        className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-widest text-zinc-500 ml-1">Confirmar Email</Label>
                                    <Input 
                                        type="email" placeholder="confirmar@ejemplo.com" 
                                        value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} required
                                        className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-widest text-zinc-500 ml-1">Contraseña</Label>
                                    <Input 
                                        type="password" placeholder="******" 
                                        value={password} onChange={e => setPassword(e.target.value)} required
                                        className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-widest text-zinc-500 ml-1">Confirmar Contraseña</Label>
                                    <Input 
                                        type="password" placeholder="******" 
                                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                                        className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white"
                                    />
                                </div>
                            </div>

                            {/* Phone and City moved to Step 2 */}

                            <Button
                                type="submit" disabled={isSubmitting}
                                className="w-full h-14 mt-4 rounded-2xl text-lg font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                            >
                                {isSubmitting ? <VamoIcon name="loader" className="animate-spin h-5 w-5" /> : 'Siguiente Paso'}
                            </Button>

                            <div className="text-center pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => router.push('/login')}
                                    className="text-xs text-zinc-500 hover:text-white transition-colors uppercase font-bold tracking-widest"
                                >
                                    ¿Ya tenés cuenta? Iniciar Sesión
                                </button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
