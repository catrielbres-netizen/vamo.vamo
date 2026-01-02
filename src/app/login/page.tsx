
// src/app/login/page.tsx
'use client';
import { useState } from 'react';
import { useAuth, useFirestore }from '@/firebase';
import { initiateEmailSignUp, initiateDriverEmailSignUp } from '@/firebase/non-blocking-login';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Separator } from '@/components/ui/separator';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"


export default function LoginPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLoginSuccess = () => {
        router.replace('/');
    };

    const handleSignIn = async () => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresa email y contraseña.' });
            return;
        }
        if (!auth) return;

        setIsSubmitting(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            toast({ title: '¡Bienvenido de nuevo!', description: 'Redirigiendo a tu panel...' });
            handleLoginSuccess();
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Error de inicio de sesión', description: 'Credenciales incorrectas o el usuario no existe.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            toast({ variant: 'destructive', title: 'Email requerido', description: 'Por favor, ingresá tu email para restablecer la contraseña.' });
            return;
        }
        if (!auth) return;
        
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
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'Firebase no está inicializado.' });
            return;
        }

        setIsSubmitting(true);
        try {
            if (role === 'driver') {
                 await initiateDriverEmailSignUp(auth, firestore, email, password);
            } else {
                 await initiateEmailSignUp(auth, firestore, email, password);
            }
            toast({ title: '¡Registro exitoso!', description: 'Iniciando sesión para llevarte a tu panel.' });
            handleLoginSuccess();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de registro', description: error.message });
        } finally {
             setIsSubmitting(false);
        }
    };

    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                    <div className="flex justify-center items-center mb-4">
                        <VamoIcon name="car" className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>VamO</CardTitle>
                    </div>
                    <CardDescription>Accede a tu cuenta o registrate</CardDescription>
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
                        <Button onClick={handleSignIn} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
                        </Button>
                    </div>

                    <div className="text-center text-sm mt-4">
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="link" className="text-muted-foreground p-0 h-auto">¿Olvidaste tu contraseña?</Button>
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
                        <p className="text-sm text-muted-foreground">¿No tienes cuenta? Registrate como:</p>
                        <div className="flex gap-4 justify-center">
                            <Button variant="link" onClick={() => handleSignUp('passenger')} disabled={isSubmitting}>
                                Pasajero
                            </Button>
                            <Button variant="link" onClick={() => handleSignUp('driver')} disabled={isSubmitting}>
                                Conductor
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
