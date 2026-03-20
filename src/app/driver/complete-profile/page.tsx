'use client';

import React from 'react';
import { useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { VamoIcon } from '@/components/VamoIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VehicleType } from '@/lib/types';

const years = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => (2008 + i).toString()).reverse();

export default function CompleteDriverProfilePage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [city, setCity] = useState('Rawson');
    const [carModelYear, setCarModelYear] = useState<string>('');
    const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!name || !phone || !city || !carModelYear || !vehicleType || !licenseNumber) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, completá todos los campos.' });
            return;
        }
        if (!firestore || !user) {
            toast({ variant: 'destructive', title: 'Error de sistema', description: 'No se pudo guardar tu perfil. Intentá de nuevo.' });
            return;
        }

        console.log('🟢 CLICK GUARDAR PERFIL (Conductor)');
        setIsSubmitting(true);
        setFormError(null);
        
        const userProfileRef = doc(firestore, 'users', user.uid);
        
        try {
            await updateDoc(userProfileRef, {
                name,
                phone,
                city,
                carModelYear: parseInt(carModelYear, 10),
                vehicleType,
                licenseNumber,
                licenseVerified: false,
                servicesOffered: { express: true, premium: true }, // Default to offering both
                profileCompleted: true,
                vehicleVerificationStatus: 'pending_review',
                updatedAt: serverTimestamp(),
            });

            console.log('🟢 UPDATE ENVIADO (Conductor)');

            toast({
                title: '¡Perfil actualizado!',
                description: 'Tus datos fueron guardados correctamente.',
            });
            
            router.replace('/driver/complete-profile/verify');
        } catch (error: any) {
            console.error("🔥 FIRESTORE BLOQUEÓ ESTO:", error.code, error.message);
            
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
                        <CardTitle>Completá tu Perfil de Conductor</CardTitle>
                    </div>
                    <CardDescription>Necesitamos algunos datos para activar tu cuenta.</CardDescription>
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
                        <Input id="name" type="text" placeholder="Tu nombre completo" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono (WhatsApp)</Label>
                        <Input id="phone" type="tel" placeholder="2804123456" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="licenseNumber">Número de Licencia de Conducir</Label>
                        <Input id="licenseNumber" type="text" placeholder="Tu número de licencia" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} disabled={isSubmitting} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="city">Ciudad Operativa</Label>
                        <Input id="city" type="text" placeholder="Tu ciudad principal" value={city} onChange={(e) => setCity(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="carModelYear">Año del Vehículo</Label>
                            <Select value={carModelYear} onValueChange={setCarModelYear} disabled={isSubmitting}>
                                <SelectTrigger id="carModelYear">
                                    <SelectValue placeholder="Año" />
                                </SelectTrigger>
                                <SelectContent>
                                    {years.map(year => (
                                        <SelectItem key={year} value={year}>{year}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="vehicleType">Tipo de Habilitación</Label>
                            <Select value={vehicleType} onValueChange={(value) => setVehicleType(value as VehicleType)} disabled={isSubmitting}>
                                <SelectTrigger id="vehicleType">
                                    <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="taxi">Taxi</SelectItem>
                                    <SelectItem value="remis">Remis</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <Alert variant="destructive" className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700">
                        <VamoIcon name="shield-alert" className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <AlertTitle className="text-yellow-800 dark:text-yellow-300">¡Atención!</AlertTitle>
                        <AlertDescription className="text-yellow-700 dark:text-yellow-500">
                            Los datos de tu vehículo y licencia deben coincidir con la documentación que envíes, o tu cuenta podría ser suspendida.
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
