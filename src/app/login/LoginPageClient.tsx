
// src/app/login/LoginPageClient.tsx
'use client';

import React from 'react';
import { useState } from 'react';
import { useAuth, useFirestore, useFirebaseApp } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Separator } from '@/components/ui/separator';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword, Auth, signOut, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, Firestore, getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function LoginPageClient() {
    const auth = useAuth();
    const firestore = useFirestore();
    const firebaseApp = useFirebaseApp();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { canInstall, triggerInstall } = usePWAInstall();

    const handleLoginSuccess = async (user: User) => {
        if (!firestore) return;

        const userRef = doc(firestore, 'users', user.uid);
        try {
            // We run a transaction to ensure atomicity, although a simple update would also work here.
            await runTransaction(firestore, async (transaction) => {
                const snap = await transaction.get(userRef);

                if (!snap.exists()) {
                    throw new Error('No pudimos encontrar tu perfil. Contactá a soporte.');
                }

                const data = snap.data();
                const updates: { [key: string]: any } = {};

                // For drivers who were in a ride, force them inactive for safety.
                if (data && data.role === 'driver' && data.driverStatus === 'in_ride') {
                    updates.driverStatus = 'inactive';
                    const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);
                    transaction.update(driverLocationRef, { driverStatus: 'inactive' });
                }

                // Apply all updates in the transaction
                if (Object.keys(updates).length > 0) {
                    transaction.update(userRef, updates);
                }
            });

            // Re-fetch the updated profile data *after* the transaction to ensure the
            // redirection logic uses the latest state.
            const finalSnap = await getDoc(userRef);
            const finalData = finalSnap.data();
            
            if (!finalData) {
                 throw new Error('No se pudo recargar el perfil después del inicio de sesión.');
            }

            if (!finalData.profileCompleted) {
                router.replace(
                finalData.role === 'driver'
                    ? '/driver/complete-profile'
                    : '/dashboard/complete-profile'
                );
                return;
            }

            // If profile is complete, send to the correct dashboard based on role.
            switch (finalData.role) {
                case 'driver':
                    router.replace('/driver/rides');
                    break;
                case 'admin':
                    router.replace('/admin/dashboard');
                    break;
                case 'admin_municipal':
                    router.replace('/municipal/dashboard');
                    break;
                case 'passenger':
                default:
                    router.replace('/dashboard/ride');
                    break;
            }

        } catch (error: any) {
             console.error("Error fetching/updating user profile after login:", error);
             toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo cargar tu perfil. Redirigiendo al inicio.' });
             router.replace('/');
        }
    };

    const handleSignIn = async () => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresa email y contraseña.' });
            return;
        }
        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de configuración', description: 'El servicio de autenticación no está disponible.' });
            return;
        }

        setIsSubmitting(true);
        try {
            if (auth.currentUser) {
                await signOut(auth);
            }
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            toast({ title: '¡Bienvenido de nuevo!', description: 'Redirigiendo a tu panel...' });
            
            // The magic happens here: intelligent redirection based on role
            await handleLoginSuccess(userCredential.user);

        } catch (error: any) {
            console.error("Firebase Auth Error Code:", error.code);
            console.error("Firebase Auth Error Message:", error.message);
            let description = 'Credenciales incorrectas o el usuario no existe.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El email o la contraseña son incorrectos. Por favor, verificá tus datos.';
            } else if (error.code === 'auth/too-many-requests') {
                description = 'Demasiados intentos fallidos. Por favor, intentá de nuevo más tarde.';
            }
            toast({ variant: 'destructive', title: 'Error de inicio de sesión', description: description });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            toast({ variant: 'destructive', title: 'Email requerido', description: 'Por favor, ingresá tu email para restablecer la contraseña.' });
            return;
        }
        if (!auth) {
            toast({ variant: 'destructive', title: 'Error de configuración', description: 'El servicio de autenticación no está disponible.' });
            return;
        };
        
        setIsSubmitting(true);
        try {
            await sendPasswordResetEmail(auth, email);
            toast({ title: 'Correo enviado', description: 'Revisá tu bandeja de entrada para restablecer tu contraseña.' });
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar el correo. ¿Estás seguro que el email es correcto?' });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleSignUp = async (role: 'passenger' | 'driver') => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresa email y contraseña para registrarte.' });
            return;
        }
        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'Firebase no está inicializado correctamente.' });
            return;
        }

        setIsSubmitting(true);
        try {
            if (auth.currentUser) {
                await signOut(auth);
            }

            // Regular user creation logic
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userProfileRef = doc(firestore, 'users', user.uid);
                const isDriver = role === 'driver';
                await setDoc(userProfileRef, {
                    email: user.email,
                    name: user.email?.split('@')[0] || (isDriver ? 'Nuevo Conductor' : 'Nuevo Pasajero'),
                    role: role,
                    profileCompleted: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    isSuspended: false,
                    approved: isDriver ? false : true,
                    // --- DRIVER ---
                    driverStatus: 'inactive',
                    currentBalance: 0,
                    vehicleVerificationStatus: 'unverified',
                    promoCreditGranted: false,
                    serviceTier: 'premium', // Default for all new drivers, admin can change it
                    servicesOffered: { express: true, premium: true },
                    rewardPoints: 0,
                    driverLevel: 'bronce',
                    lastRideCompletedAt: null,
                    // --- PASSENGER ---
                    vamoPoints: 0,
                    activeBonus: false,
                    activeRideId: null,
                    weeklyCancellations: 0,
                    lastCancellationAt: null,
                    blockedUntil: null,
                    // --- SHARED ---
                    fcmToken: null,
                    stats: { ridesCompleted: 0, acceptanceRate: 100, cancellationRate: 0 },
                });

                if (isDriver) {
                    const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);
                    await setDoc(driverLocationRef, {
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
                router.replace(isDriver ? '/driver/complete-profile' : '/dashboard/complete-profile');
            }
        } catch (error: any) {
            console.error("Firebase Auth Signup Error Code:", error.code);
            console.error("Firebase Auth Signup Error Message:", error.message);
            let description = error.message;
            if (error.code === 'auth/email-already-in-use') {
                description = 'Este email ya está registrado. Por favor, iniciá sesión o usá otro email.';
            } else if (error.code === 'auth/weak-password') {
                description = 'La contraseña es demasiado débil. Debe tener al menos 6 caracteres.';
            }
            toast({ variant: 'destructive', title: 'Error de registro', description: description });
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            
            {canInstall && (
                 <Card className="w-full mb-6 border-primary shadow-lg">
                    <CardHeader className="text-center">
                        <VamoIcon name="download" className="h-10 w-10 text-primary mx-auto mb-2" />
                        <CardTitle className="text-2xl">Paso 1: Instalá VamO</CardTitle>
                        <CardDescription>Para máxima seguridad y recibir notificaciones de viaje, es fundamental que instales la aplicación en tu dispositivo.</CardDescription>
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
                         {canInstall ? "Paso 2: Accedé o Registrate" : "Accede a tu cuenta o registrate"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>                            
                            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting}/>
                        </div>
                        <Button onClick={handleSignIn} disabled={isSubmitting || !auth} className="w-full">
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
                                <AlertDialogDescription>
                                    Ingresá tu email y te enviaremos un enlace para que puedas crear una nueva contraseña.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                 <div className="space-y-2">
                                    <Label htmlFor="reset-email">Email</Label>
                                    <Input id="reset-email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePasswordReset}>Enviar Correo</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>


                    <Separator className="my-6" />
                    <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">Si sos nuevo, colocá un email y una contraseña y seleccioná si sos pasajero o querés conducir con VamO.</p>
                        <div className="flex gap-4 justify-center">
                            <Button variant="link" onClick={() => handleSignUp('passenger')} disabled={isSubmitting || !auth}>
                                Pasajero
                            </Button>
                            <Button variant="link" onClick={() => handleSignUp('driver')} disabled={isSubmitting || !auth}>
                                Conductor
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
