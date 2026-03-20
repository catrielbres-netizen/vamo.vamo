'use client';

import React from 'react';
import { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { signInWithEmailAndPassword, Auth, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';

export default function MunicipalLoginPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLogin = async () => {
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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Check user role
            const userRef = doc(firestore, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                throw new Error('Perfil no encontrado.');
            }

            const userProfile = userSnap.data() as UserProfile;

            if (userProfile.role !== 'admin_municipal') {
                await auth.signOut();
                throw new Error('Acceso denegado. Esta cuenta no tiene permisos de administrador municipal.');
            }
            
            toast({ title: '¡Bienvenido!', description: 'Accediendo al portal municipal...' });
            router.replace('/municipal/dashboard');

        } catch (error: any) {
            let description = 'Credenciales incorrectas o el usuario no existe.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El email o la contraseña son incorrectos.';
            } else {
                description = error.message;
            }
            toast({ variant: 'destructive', title: 'Error de inicio de sesión', description });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                    <VamoIcon name="shield-check" className="h-12 w-12 text-primary mx-auto mb-2" />
                    <CardTitle className="text-2xl">Portal Municipal VamO</CardTitle>
                    <CardDescription>Acceso exclusivo para personal autorizado.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email de Usuario</Label>
                            <Input id="email" type="email" placeholder="municipalidad@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>                            
                            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting}/>
                        </div>
                        <Button onClick={handleLogin} disabled={isSubmitting || !auth} className="w-full">
                            {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
