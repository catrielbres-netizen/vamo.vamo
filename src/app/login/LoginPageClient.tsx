
// src/app/login/LoginPageClient.tsx
'use client';

// RESPONSIBILITY: Show the login/register form ONLY when there is no active session.
// All post-auth routing decisions live in /auth/continue.

import React, { useEffect, useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Separator } from '@/components/ui/separator';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword, signOut, User, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useFirebase } from '@/firebase/provider';

interface LoginPageClientProps {
    fixedRole?: 'passenger' | 'driver';
}

export default function LoginPageClient({ fixedRole }: LoginPageClientProps) {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { user, isInitializing } = useFirebase();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { canInstall, triggerInstall } = usePWAInstall();

    // --- AUTH STATE ---
    // User requested no automatic redirects. The form is always rendered.



    // --- HANDLERS ---
    const handleLoginSuccess = async (user: User) => {
        console.log('🔑 [LOGIN_DEBUG] Login success. Delegating to /auth/continue. UID:', user.uid);

        // Perform the driver status cleanup before delegating
        if (firestore) {
            try {
                const userRef = doc(firestore, 'users', user.uid);
                const snap = await getDoc(userRef);
                if (!snap.exists()) {
                    throw new Error('No pudimos encontrar tu perfil. Por favor, registrate primero.');
                }
                const data = snap.data();
                if (data?.role === 'driver' && data?.driverStatus === 'in_ride') {
                    console.log('🔑 [LOGIN_DEBUG] Driver was in_ride, resetting to inactive...');
                    await updateDoc(userRef, { driverStatus: 'inactive' }).catch(() => {});
                    await updateDoc(doc(firestore, 'drivers_locations', user.uid), { driverStatus: 'inactive' }).catch(() => {});
                }
            } catch (err: any) {
                console.warn('🔑 [LOGIN_DEBUG] Non-critical cleanup error:', err.message);
            }
        }

        // Delegate all routing decisions to /auth/continue
        router.replace('/auth/continue');
    };

    const handleSignIn = async () => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresá email y contraseña.' });
            return;
        }
        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de configuración', description: 'El servicio de autenticación no está disponible.' });
            return;
        }
        setIsSubmitting(true);
        try {
            if (auth.currentUser) await signOut(auth);
            const { user: signedUser } = await signInWithEmailAndPassword(auth, email, password);
            console.log('🔑 [LOGIN_DEBUG] signInWithEmailAndPassword SUCCESS. UID:', signedUser.uid);
            toast({ title: '¡Bienvenido de nuevo!', description: 'Abriendo tu panel...' });
            await handleLoginSuccess(signedUser);
        } catch (error: any) {
            let description = 'Credenciales incorrectas o el usuario no existe.';
            if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code)) {
                description = 'El email o la contraseña son incorrectos.';
            } else if (error.code === 'auth/too-many-requests') {
                description = 'Demasiados intentos. Por favor, intentá más tarde.';
            }
            toast({ variant: 'destructive', title: 'Error de inicio de sesión', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            toast({ variant: 'destructive', title: 'Email requerido', description: 'Ingresá tu email para restablecer la contraseña.' });
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

    const handleSignUp = async (role: 'passenger' | 'driver') => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Ingresá email y contraseña para registrarte.' });
            return;
        }
        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'Firebase no está inicializado.' });
            return;
        }
        setIsSubmitting(true);
        try {
            if (auth.currentUser) await signOut(auth);
            const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
            console.log('✅ [SIGNUP] Auth user created:', newUser.uid);

            // CAPTURA: Primero URL, luego localStorage
            const refParam = searchParams.get('ref') || (typeof window !== 'undefined' ? localStorage.getItem('vamo_captured_referral') : null);
            const campaignParam = searchParams.get('campaign') || (typeof window !== 'undefined' ? localStorage.getItem('vamo_captured_campaign') : null);
            
            const isDriver = role === 'driver';
            
            console.log('📝 [SIGNUP] Creating user document in Firestore...');
            await setDoc(doc(firestore, 'users', newUser.uid), {
                uid: newUser.uid,
                email: newUser.email,
                name: '',
                role,
                profileCompleted: false,
                referredByCode: refParam ? refParam.toUpperCase().trim() : null,
                campaign: campaignParam ? campaignParam.trim() : null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isSuspended: false,
                approved: !isDriver,
                currentBalance: 0,
                serviceTier: 'premium',
            });
            console.log('✅ [SIGNUP] Firestore user document created.');
            
            // --- NEW: Email Verification ---
            await sendEmailVerification(newUser);
            console.log('📧 [SIGNUP] Verification email sent.');

            if (isDriver) {
                console.log('🚛 [SIGNUP] Creating driver location document...');
                await setDoc(doc(firestore, 'drivers_locations', newUser.uid), {
                    geohash: null,
                    currentLocation: null,
                    lastSeenAt: serverTimestamp(),
                    driverStatus: 'inactive',
                    approved: false,
                    isSuspended: false,
                    pendingOffers: 0,
                    updatedAt: serverTimestamp(),
                });
            }
            toast({ title: '¡Registro exitoso!', description: 'Redirigiendo para completar tu perfil...' });
            router.replace('/auth/continue');
        } catch (error: any) {
            let description = error.message;
            if (error.code === 'auth/email-already-in-use') {
                description = 'Este email ya está registrado. Por favor, iniciá sesión.';
            } else if (error.code === 'auth/weak-password') {
                description = 'La contraseña debe tener al menos 6 caracteres.';
            }
            toast({ variant: 'destructive', title: 'Error de registro', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER ---
    // User requested: "login abra login para poder ingresar los datos del usuario".
    // We remove all auto-redirects and welcome screens. The form is ALWAYS displayed.
    const isAuthBusy = isInitializing || isSubmitting;
    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            {canInstall && (
                <Card className="w-full mb-6 border-primary shadow-lg">
                    <CardHeader className="text-center">
                        <VamoIcon name="download" className="h-10 w-10 text-primary mx-auto mb-2" />
                        <CardTitle className="text-2xl">Paso 1: Instalá VamO</CardTitle>
                        <CardDescription>Para recibir notificaciones de viaje, instalá la aplicación en tu dispositivo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={triggerInstall} className="w-full" size="lg">
                            <VamoIcon name="smartphone" className="mr-2" /> Instalar Aplicación
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card className="w-full">
                <CardHeader className="text-center">
                    <h1 className="text-5xl font-bold text-foreground">
                        Vam<span className="text-primary">O</span>
                    </h1>
                    <CardDescription className="pt-2">
                        {canInstall ? 'Paso 2: Accedé o Registrate' : 'Accedé a tu cuenta o registrate'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <Button onClick={handleSignIn} disabled={isSubmitting || !auth || isAuthBusy} className="w-full">
                            {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
                        </Button>
                    </div>

                    <div className="text-center text-sm mt-4">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="link" className="text-muted-foreground p-0 h-auto" disabled={!auth}>¿Olvidaste tu contraseña?</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Restablecer Contraseña</AlertDialogTitle>
                                    <AlertDialogDescription>Ingresá tu email y te enviaremos un enlace para crear una nueva contraseña.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="space-y-2">
                                    <Label htmlFor="reset-email">Email</Label>
                                    <Input id="reset-email" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handlePasswordReset}>Enviar Correo</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>

                    <Separator className="my-6" />
                    <div className="text-center space-y-4">
                        {!fixedRole ? (
                            <>
                                <p className="text-sm text-muted-foreground">Si sos nuevo, colocá un email y una contraseña y seleccioná si sos pasajero o conductor.</p>
                                <div className="flex gap-4 justify-center">
                                    <Button variant="link" onClick={() => handleSignUp('passenger')} disabled={isSubmitting || !auth || isAuthBusy}>Pasajero</Button>
                                    <Button variant="link" onClick={() => handleSignUp('driver')} disabled={isSubmitting || !auth || isAuthBusy}>Conductor</Button>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">¿No tenés cuenta todavía?</p>
                                <Button 
                                    variant="outline" 
                                    onClick={() => handleSignUp(fixedRole)} 
                                    disabled={isSubmitting || !auth || isAuthBusy}
                                    className="w-full h-12 border-primary/20 hover:bg-primary/5 text-primary font-bold"
                                >
                                    REGISTRARME COMO {fixedRole === 'passenger' ? 'PASAJERO' : 'CONDUCTOR'}
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
