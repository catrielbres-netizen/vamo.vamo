
// src/app/login/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuth, useUser, useFirestore }from '@/firebase';
import { initiateEmailSignIn, initiateEmailSignUp } from '@/firebase/non-blocking-login';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/icons';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { getAuth } from 'firebase/auth';

export default function LoginPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const { user, loading } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // If the user is logged in, the root page.tsx will handle redirection.
        if (!loading && user) {
            router.replace('/'); 
        }
    }, [user, loading, router]);


    if (loading || user) { // Show loading screen if loading or if user exists (and is being redirected)
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
        if (!auth) return;

        setIsSubmitting(true);
        initiateEmailSignIn(auth, email, password);
        
        setTimeout(() => {
          if(!getAuth().currentUser) { 
              toast({ variant: 'destructive', title: 'Error de inicio de sesión', description: 'Credenciales incorrectas o el usuario no existe.' });
              setIsSubmitting(false);
          }
        }, 2500); 
    };
    
    const handleSignUp = async () => {
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
            await initiateEmailSignUp(auth, firestore, email, password);
            toast({ title: '¡Registro exitoso!', description: 'Iniciando sesión para llevarte a tu panel.' });
            // The onAuthStateChanged listener will now redirect correctly.
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error de registro', description: error.message });
        } finally {
            // Don't set isSubmitting to false immediately, wait for redirect
            setTimeout(() => setIsSubmitting(false), 3000);
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
                    <div className="text-center space-y-2">
                         <div>
                            <p className="text-sm text-muted-foreground">¿No tienes cuenta?</p>
                            <Button variant="link" onClick={handleSignUp} disabled={isSubmitting}>
                                Registrate ahora
                            </Button>
                         </div>
                         <div>
                             <p className="text-sm text-muted-foreground">¿Necesitas crear un administrador?</p>
                             <Button variant="link" asChild>
                                <Link href="/admin/create">Crear admin</Link>
                             </Button>
                         </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
