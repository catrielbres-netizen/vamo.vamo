
// src/app/admin/create/page.tsx
'use client';
import { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function CreateAdminPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleCreateAdmin = async () => {
        if (!email || !password || !name) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, completa todos los campos.' });
            return;
        }
        if (!auth || !firestore) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'Firebase no está inicializado.' });
            return;
        }

        setIsSubmitting(true);
        try {
            // Create user in Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const { user } = userCredential;

            // Create user profile in Firestore
            const userProfileRef = doc(firestore, 'users', user.uid);
            await setDoc(userProfileRef, {
                name: name,
                email: email,
                role: 'admin',
                profileCompleted: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            toast({
                title: '¡Administrador Creado!',
                description: `${name} ha sido registrado como administrador.`,
            });
            
            // Redirect to login so the new admin can sign in
            setTimeout(() => router.push('/login'), 2000);

        } catch (error: any) {
            console.error("Error creating admin:", error);
            toast({
                variant: 'destructive',
                title: 'Error al crear administrador',
                description: error.message || 'Ocurrió un error inesperado.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                     <CardTitle>Crear Primer Administrador</CardTitle>
                    <CardDescription>Registra el usuario administrador inicial de VamO.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="name">Nombre Completo</Label>
                            <Input id="name" type="text" placeholder="Nombre Apellido" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="admin@vamo.app" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting}/>
                        </div>
                        <Button onClick={handleCreateAdmin} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? 'Creando...' : 'Crear Administrador'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
