'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const years = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => (2008 + i).toString()).reverse();

export default function CompleteDriverProfilePage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [carModelYear, setCarModelYear] = useState<string | undefined>(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!name || !lastName || !phone || !carModelYear) {
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
                lastName,
                phone,
                carModelYear: parseInt(carModelYear, 10),
                profileCompleted: true,
                vehicleVerificationStatus: 'pending_review', // Move to pending after submitting info
                updatedAt: serverTimestamp(),
            });

            toast({
                title: '¡Perfil actualizado!',
                description: 'Tus datos fueron guardados correctamente.',
            });
            
            router.push('/driver/complete-profile/verify');

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
                        <VamoIcon name="user" className="h-8 w-8 text-primary mr-2" />
                        <CardTitle>Completá tu Perfil</CardTitle>
                    </div>
                    <CardDescription>Necesitamos algunos datos más para activar tu cuenta de conductor.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre</Label>
                        <Input id="name" type="text" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="lastName">Apellido</Label>
                        <Input id="lastName" type="text" placeholder="Tu apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono (WhatsApp)</Label>
                        <Input id="phone" type="tel" placeholder="2804123456" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="carModelYear">Año del Vehículo</Label>
                        <Select value={carModelYear} onValueChange={setCarModelYear} disabled={isSubmitting}>
                            <SelectTrigger id="carModelYear">
                                <SelectValue placeholder="Seleccioná un año" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(year => (
                                    <SelectItem key={year} value={year}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <Alert variant="destructive" className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700">
                        <VamoIcon name="shield-alert" className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <AlertTitle className="text-yellow-800 dark:text-yellow-300">¡Atención!</AlertTitle>
                        <AlertDescription className="text-yellow-700 dark:text-yellow-500">
                            Si el año del modelo no coincide con la documentación que envíes, tu cuenta podría ser suspendida.
                        </AlertDescription>
                    </Alert>

                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? 'Guardando...' : 'Guardar y Continuar'}
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
