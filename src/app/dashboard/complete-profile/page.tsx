'use client';

import React from 'react';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { updateDoc, serverTimestamp, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function CompletePassengerProfilePage() {
    const { user, profile } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

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
        
        console.log('🟢 CLICK GUARDAR PERFIL (Pasajero)');
        setIsSubmitting(true);
        setFormError(null);

        const userProfileRef = doc(firestore, 'users', user.uid);
        
        try {
            await updateDoc(userProfileRef, {
                name,
                phone,
                profileCompleted: true,
                updatedAt: serverTimestamp(),
            });
            
            console.log('🟢 UPDATE ENVIADO (Pasajero)');

            toast({
                title: '¡Perfil completado!',
                description: 'Tus datos fueron guardados. Redirigiendo...',
            });

            router.replace('/'); 
            
        } catch (error: any) {
            console.error("🔥 ERROR GUARDANDO PERFIL:", error.code, error.message);

            let errorMessage = error.message || 'No se pudo guardar el perfil. Por favor, intentá de nuevo.';
            if (error.code === 'permission-denied') {
                 errorMessage = 'No tenés permisos para guardar el perfil. Esto puede ocurrir si tu cuenta no está inicializada correctamente o por reglas de seguridad. Contactá a soporte si el problema persiste.';
            }
            
            setFormError(errorMessage);
            toast({ variant: 'destructive', title: 'Error al Guardar', description: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
            <Card className="w-full">
                <CardHeader className="text-center">
                     <div className="flex justify-center items-center mb-2">
                        <VamoIcon name="user" className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>Completá tu Perfil</CardTitle>
                    </div>
                    <CardDescription>¡Bienvenido a VamO! Solo necesitamos un par de datos más para empezar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {formError && (
                        <Alert variant="destructive">
                            <VamoIcon name="alert-triangle" className="h-4 w-4" />
                            <AlertTitle>Error al Guardar</AlertTitle>
                            <AlertDescription>
                                {formError}
                            </AlertDescription>
                        </Alert>
                    )}
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
