// src/app/login/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import { initiateEmailSignIn, initiateEmailSignUp } from '@/firebase/non-blocking-login';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/icons';
import { Separator } from '@/components/ui/separator';

export default function LoginPage() {
    const auth = useAuth();
    const { user, profile, loading } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && user) {
            if (profile?.role === 'admin') {
                router.replace('/admin');
            } else if (profile?.role === 'driver') {
                router.replace('/driver');
            } else {
                router.replace('/');
            }
        }
    }, [user, profile, loading, router]);


    if (loading) { 
        return (
             <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
                <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
                <p className="text-center mt-4">Cargando...</p>
            </main>
        )
    }

    const handleSignIn = async () => {
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresa email y contraseña.' });
            return;
        }
        setIsSubmitting(true);
        try {
            initiateEmailSignIn(auth, email, password);
            // Non-blocking, so we can't catch here directly. 
            // Auth errors are typically handled by onAuthStateChanged or global listeners, 
            // but for a better UX on login, we can give a generic message and reset.
            // A more advanced implementation might listen for a specific auth error event.
            setTimeout(() => {
              if(!auth.currentUser) {
                  toast({ variant: 'destructive', title: 'Error de inicio de sesión', description: 'Credenciales incorrectas o el usuario no existe.' });
                  setIsSubmitting(false);
              }
            }, 2500); // Wait 2.5s to see if login succeeds before showing error

        } catch (error) {
             toast({ variant: 'destructive', title: 'Error inesperado', description: 'Ocurrió un problema al intentar iniciar sesión.' });
             setIsSubmitting(false);
        }
    };
    
    const handleSignUp = async () => {
         if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingresa email y contraseña para registrarte.' });
            return;
        }
        setIsSubmitting(true);
        try {
            // Note: In a real app, we'd collect more info and set a default role.
            // Here, it just creates the auth user. A Firestore document with role would need to be created separately.
            await initiateEmailSignUp(auth, email, password);
            toast({ title: 'Registro exitoso', description: 'Ahora puedes iniciar sesión.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de registro', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    // If user is already logged in, the useEffect will handle the redirect.
    // Render nothing here to prevent flicker.
    if (user) {
        return (
            <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
               <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
               <p className="text-center mt-4">Redirigiendo...</p>
           </main>
       )
    }


    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                    <div className="flex justify-center items-center mb-4">
                        <VamoIcon className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>VamO</CardTitle>
                    </div>
                    <CardDescription>Accede a tu cuenta</CardDescription>
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
                    <Separator className="my-6" />
                    <div className="text-center">
                         <p className="text-sm text-muted-foreground">¿No tienes cuenta?</p>
                         <Button variant="link" onClick={handleSignUp} disabled={isSubmitting}>
                            Registrate ahora
                         </Button>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
