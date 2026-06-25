'use client';

import React, { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';

interface LoginPageClientProps {
    fixedRole?: 'passenger' | 'driver';
}

export default function LoginPageClient({ fixedRole }: LoginPageClientProps) {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const { isInitializing } = useFirebase();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<{email?: string, password?: string}>({});

    // [VamO PRO RESILIENCE] Pre-fill email if provided via URL (Resume Flow)
    React.useEffect(() => {
        const urlEmail = new URLSearchParams(window.location.search).get('email');
        if (urlEmail) {
            console.log(`[AUTH_RESUME_FLOW] Pre-filling email: ${urlEmail}`);
            setEmail(decodeURIComponent(urlEmail));
        }
    }, []);

    const handleLoginSuccess = async () => {
        const user = auth.currentUser;
        if (!user || !firestore) {
            router.replace('/auth/continue');
            return;
        }

        try {
            const userDoc = await getDoc(doc(firestore, 'users', user.uid));
            if (userDoc.exists()) {
                const profile = userDoc.data();
                console.log(`[AUTH_SUCCESS] Role: ${profile.role}, Status: ${profile.registrationStatus}`);

                if (profile.role === 'admin') {
                    router.push('/admin');
                    return;
                }

                // [VamO PRO] Registration Status Guard
                if (profile.registrationStatus !== 'active' && !profile.profileCompleted) {
                    console.warn(`[AUTH_REDIRECT] User ${user.uid} has status ${profile.registrationStatus}. Redirecting to onboarding...`);
                    if (profile.role === 'driver' || profile.role === 'incomplete_driver') {
                        router.push('/driver/register');
                    } else {
                        router.push('/dashboard/complete-profile');
                    }
                    return;
                }

                if (profile.role === 'driver' || profile.role === 'incomplete_driver') {
                    router.push('/driver');
                } else if (profile.role === 'passenger') {
                    router.push('/dashboard');
                } else {
                    router.push('/auth/continue');
                }
            } else {
                console.warn("[AUTH_ERROR] Profile missing after successful login. Redirecting to repair...");
                router.push('/auth/continue');
            }
        } catch (err) {
            console.error("[AUTH_ERROR] Error fetching profile during login success:", err);
            router.push('/auth/continue');
        }
    };

    const handleSignIn = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        
        if (!email || !password) {
            setErrors({
                email: !email ? 'El email es obligatorio.' : undefined,
                password: !password ? 'La contraseña es obligatoria.' : undefined
            });
            return;
        }

        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Inicializando', description: 'El sistema se está conectando, intentá en un segundo...' });
            return;
        }
        
        setIsSubmitting(true);
        setErrors({});

        try {
            console.log(`[AUTH_LOGIN_ATTEMPT] Email: ${email}`);
            if (auth.currentUser) await signOut(auth);
            const { user: signedUser } = await signInWithEmailAndPassword(auth, email, password);
            
            console.log(`[AUTH_STATE_CHANGED] User logged in: ${signedUser.uid}`);

            // Role Guard (Strict Separation)
            if (fixedRole) {
                const userDoc = await getDoc(doc(firestore, 'users', signedUser.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.role && userData.role !== fixedRole && !(fixedRole === 'driver' && userData.role === 'incomplete_driver')) {
                        console.warn(`[AUTH_INVALID_SESSION] Role mismatch: expected ${fixedRole}, got ${userData.role}. Cleaning up...`);
                        await signOut(auth);
                        const otherRole = userData.role === 'driver' || userData.role === 'incomplete_driver' ? 'conductor' : 'pasajero';
                        toast({ 
                            variant: 'destructive', 
                            title: 'Acceso incorrecto', 
                            description: `Tu cuenta es de ${otherRole}. Por favor, ingresá por el portal de ${otherRole}s.` 
                        });
                        setIsSubmitting(false);
                        return;
                    }
                } else {
                    console.warn(`[AUTH_INVALID_SESSION] No profile found for ${signedUser.uid}. Cleaning up...`);
                    await signOut(auth);
                    toast({ 
                        variant: 'destructive', 
                        title: 'Perfil no encontrado', 
                        description: 'No pudimos encontrar tu perfil de usuario.' 
                    });
                    setIsSubmitting(false);
                    return;
                }
            }

            console.log(`[AUTH_SUCCESS] User ${signedUser.uid} validated.`);
            await handleLoginSuccess();
        } catch (error: any) {
            console.error("[AUTH_LOGIN_FAILED]", error);
            await signOut(auth); // [VamO PRO SECURITY] Ensure no partial session remains
            console.log("[AUTH_SESSION_CLEARED] Session cleared after failed login.");

            let desc = 'Credenciales incorrectas.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                desc = 'Email o contraseña incorrectos.';
            }
            toast({ variant: 'destructive', title: 'Error de acceso', description: desc });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGoogleAuthSuccess = async (userCredential: any) => {
        if (!firestore) return;
        setIsSubmitting(true);
        try {
            const user = userCredential.user;
            const userDoc = await getDoc(doc(firestore, 'users', user.uid));
            if (userDoc.exists()) {
                const profile = userDoc.data();
                if (profile.role === 'admin') {
                    router.push('/admin');
                    return;
                }
                if (profile.registrationStatus !== 'active' && !profile.profileCompleted) {
                    if (profile.role === 'driver' || profile.role === 'incomplete_driver') {
                        router.push('/driver/register');
                    } else {
                        router.push('/dashboard/complete-profile');
                    }
                    return;
                }
                if (profile.role === 'driver' || profile.role === 'incomplete_driver') {
                    router.push('/driver');
                } else if (profile.role === 'passenger') {
                    router.push('/dashboard');
                } else {
                    router.push('/auth/continue');
                }
            } else {
                // Nuevo usuario de Google, redirigir a completar perfil
                if (fixedRole === 'driver') {
                    router.push('/driver/register?method=google');
                } else {
                    router.push('/pasajero/onboarding?method=google');
                }
            }
        } catch (err) {
            console.error("Error checking Google Auth profile:", err);
            toast({ variant: 'destructive', title: 'Error', description: 'Ocurrió un error al verificar tu perfil.' });
            await signOut(auth);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            setErrors({ email: 'Ingresá tu email para restablecer.' });
            return;
        }
        if (!auth) return;
        setIsSubmitting(true);
        try {
            await sendPasswordResetEmail(auth, email);
            toast({ title: 'Correo enviado', description: 'Revisá tu bandeja de entrada.' });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar el correo.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitting) {
        return <VamoFullScreenLoader label="Autenticando..." />;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#121212] p-6 w-full overflow-hidden">
            <div className="w-full max-w-[420px] flex flex-col items-center animate-in fade-in zoom-in duration-500">
                
                <div className="w-full flex justify-center mb-10">
                    <VamoLogo variant="login" priority />
                </div>
                
                <Card className="w-full bg-zinc-900 border-white/5 shadow-2xl rounded-[2.5rem]">
                    <CardHeader className="text-center pb-6">
                        <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">
                            {fixedRole === 'driver' ? 'ACCESO CONDUCTOR' : 'ACCESO PASAJERO'}
                        </CardTitle>
                        <CardDescription className="text-zinc-500 font-medium">Ingresá tus datos para continuar</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Email</Label>
                                <Input 
                                    id="email" 
                                    type="email" 
                                    placeholder="tu@email.com"
                                    value={email} 
                                    onChange={e => { setEmail(e.target.value); setErrors(prev => ({...prev, email: undefined})); }}
                                    className={errors.email ? 'h-12 border-red-500 bg-red-500/10 rounded-xl text-white' : 'h-12 bg-white/5 border-white/10 rounded-xl text-white focus:ring-indigo-500'}
                                />
                                {errors.email && <p className="text-red-500 text-[10px] font-black uppercase tracking-tighter ml-2 mt-1">{errors.email}</p>}
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center px-1">
                                    <Label htmlFor="password" title="Contraseña" className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Contraseña</Label>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <button type="button" className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-tighter transition-colors">¿Olvidaste la clave?</button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="bg-zinc-900 border-white/5">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle className="text-white">Restablecer Contraseña</AlertDialogTitle>
                                                <AlertDialogDescription className="text-zinc-400">Te enviaremos un email para que puedas crear una nueva contraseña.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <Input 
                                                type="email" 
                                                placeholder="tu@email.com" 
                                                value={email} 
                                                onChange={e => setEmail(e.target.value)}
                                                className="bg-white/5 border-white/10 text-white"
                                            />
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="bg-zinc-800 text-white border-none">Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={handlePasswordReset} className="bg-indigo-600 hover:bg-indigo-700">Enviar Link</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                                <Input 
                                    id="password" 
                                    type="password" 
                                    value={password} 
                                    onChange={e => { setPassword(e.target.value); setErrors(prev => ({...prev, password: undefined})); }}
                                    className={errors.password ? 'h-12 border-red-500 bg-red-500/10 rounded-xl text-white' : 'h-12 bg-white/5 border-white/10 rounded-xl text-white focus:ring-indigo-500'}
                                />
                                {errors.password && <p className="text-red-500 text-[10px] font-black uppercase tracking-tighter ml-2 mt-1">{errors.password}</p>}
                            </div>

                            <Button 
                                onClick={(e) => handleSignIn(e)} 
                                disabled={isSubmitting} 
                                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-xl shadow-xl shadow-indigo-600/10 active:scale-[0.98] transition-all"
                            >
                                {isSubmitting ? <VamoIcon name="loader" className="animate-spin" /> : 'INICIAR SESIÓN'}
                            </Button>

                            {fixedRole !== 'driver' && (
                                <div className="pt-2">
                                    <GoogleAuthButton 
                                        onSuccess={handleGoogleAuthSuccess}
                                        disabled={isSubmitting}
                                        mode="login"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <Separator className="bg-white/5" />
                            </div>
                            <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                                <span className="bg-zinc-900 px-4 text-zinc-600">O bien</span>
                            </div>
                        </div>

                        <div className="space-y-4 pt-2">
                            <Button 
                                variant="outline"
                                onClick={async () => {
                                    if (auth?.currentUser) await signOut(auth);
                                    router.push(fixedRole === 'driver' ? '/driver/register' : '/pasajero/register');
                                }}
                                className="w-full h-12 border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 font-bold rounded-xl transition-all"
                            >
                                CREAR CUENTA NUEVA
                            </Button>
                            
                            {fixedRole !== 'driver' && (
                                <div className="text-center">
                                    <button 
                                        type="button"
                                        onClick={() => router.push('/driver/register')}
                                        className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-all p-2"
                                    >
                                        ¿Querés manejar? <span className="text-indigo-400 underline underline-offset-4">Registrate como conductor</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
                
                <p className="mt-8 text-[10px] font-black text-zinc-700 uppercase tracking-[0.2em]">
                    VamO Security Engine v6.1
                </p>
            </div>
        </div>
    );
}
