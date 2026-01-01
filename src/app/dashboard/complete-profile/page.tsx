'use client';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/icons';

export default function CompletePassengerProfilePage() {
    const { user, profile } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if(profile) {
            if (profile.name && profile.name !== profile.email?.split('@')[0]) {
                setName(profile.name);
            }
            if(profile.phone) {
                setPhone(profile.phone);
            }
        }
    }, [profile]);

    const handleSubmit = async () => {
        if (!name || !phone) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, completá todos los campos.' });
            return;
        }
        if (!firestore || !user) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'No se pudo guardar tu perfil. Intentá de nuevo.' });
            return;
        }

        setIsSubmitting(true);
        try {
            // Check for phone number uniqueness
            const usersRef = collection(firestore, 'users');
            const q = query(usersRef, where('phone', '==', phone));
            const querySnapshot = await getDocs(q);

            let isPhoneTaken = false;
            querySnapshot.forEach((doc) => {
                if (doc.id !== user.uid) {
                    isPhoneTaken = true;
                }
            });

            if (isPhoneTaken) {
                toast({
                    variant: 'destructive',
                    title: 'Teléfono en uso',
                    description: 'Este número de teléfono ya está registrado en otra cuenta.',
                });
                setIsSubmitting(false);
                return;
            }

            const userProfileRef = doc(firestore, 'users', user.uid);
            await updateDoc(userProfileRef, {
                name,
                phone,
                profileCompleted: true,
                updatedAt: serverTimestamp(),
            });

            toast({
                title: '¡Perfil completado!',
                description: 'Tus datos fueron guardados correctamente.',
            });
            
            router.push('/dashboard/ride');

        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({
                variant: 'destructive',
                title: 'Error al guardar',
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
                     <div className="flex justify-center items-center mb-2">
                        <VamoIcon className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>Completá tu Perfil</CardTitle>
                    </div>
                    <CardDescription>¡Bienvenido a VamO! Solo necesitamos un par de datos más para empezar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre y Apellido</Label>
                        <Input id="name" type="text" placeholder="Tu nombre y apellido" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono (WhatsApp)</Label>
                        <Input id="phone" type="tel" placeholder="2804123456" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} />
                    </div>
                    
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? 'Guardando...' : 'Guardar y Empezar a Viajar'}
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
