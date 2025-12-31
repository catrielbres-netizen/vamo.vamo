// src/app/admin/create/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/icons';

async function hasAdminUsers(firestore: any): Promise<boolean> {
    const adminsQuery = query(collection(firestore, 'users'), where('role', '==', 'admin'), limit(1));
    const snapshot = await getDocs(adminsQuery);
    return !snapshot.empty;
}

export default function CreateAdminPage() {
    const auth = useAuth();
    const firestore = useFirestore();
    const { profile, loading: userLoading } = useUser();
    const router = useRouter();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [canCreate, setCanCreate] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (userLoading || !firestore) return;

        const checkPermission = async () => {
            const hasAdmins = await hasAdminUsers(firestore);
            // Allow creation if:
            // 1. There are no admins yet (to create the first one).
            // 2. The current logged-in user is an admin.
            if (!hasAdmins || (profile && profile.role === 'admin')) {
                setCanCreate(true);
            } else {
                setCanCreate(false);
                toast({
                    variant: 'destructive',
                    title: 'Acceso Denegado',
                    description: 'Solo un administrador puede crear otro. Si es el primero, cierra sesión.',
                });
                router.replace('/login');
            }
            setIsLoading(false);
        };
        checkPermission();

    }, [firestore, userLoading, profile, router, toast]);

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
            
            // Redirect to admin panel after a short delay
            setTimeout(() => router.push('/admin'), 2000);

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
    
    if (isLoading) {
        return (
             <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
                <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
                <p className="text-center mt-4">Verificando permisos...</p>
            </main>
        )
    }

    if (!canCreate && !isLoading) {
        return (
             <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
                <VamoIcon className="h-12 w-12 text-destructive" />
                <p className="text-center mt-4">No tenés permiso para acceder a esta página.</p>
            </main>
        )
    }


    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                    <div className="flex justify-center items-center mb-4">
                        <VamoIcon className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>Crear Administrador</CardTitle>
                    </div>
                    <CardDescription>Registra un nuevo usuario con permisos de administrador.</CardDescription>
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
