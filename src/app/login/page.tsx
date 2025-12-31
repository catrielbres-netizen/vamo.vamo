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
    const { user, isUserLoading } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // If user is logged in, redirect them away from login page
        if (user) {
            router.replace('/'); 
        }
    }, [user, router]);

    if (isUserLoading || user) { // Also show loading/null if user exists to prevent flicker before redirect
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
            await initiateEmailSignIn(auth, email, password);
            // The onAuthStateChanged listener in the provider will handle the redirect
            toast({ title: 'Iniciando sesión...', description: 'Serás redirigido en un momento.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de inicio de sesión', description: 'Credenciales incorrectas. Por favor, intenta de nuevo.' });
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
