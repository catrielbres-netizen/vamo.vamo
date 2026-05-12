'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import PlaceAutocompleteInput from '@/components/PlaceAutocompleteInput';

import { httpsCallable } from 'firebase/functions';

function RegisterForm() {
    const { auth, firestore, functions } = useFirebase();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    // Datos de Usuario
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // Datos de Ciudad
    const [cityName, setCityName] = useState('');
    const [cityKey, setCityKey] = useState('');
    const [province, setProvince] = useState('');
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleRegister = async () => {
        if (!email || !password || !cityName || !cityKey) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, completá todos los datos del municipio y usuario.' });
            return;
        }

        if (password.length < 6) {
            toast({ variant: 'destructive', title: 'Seguridad', description: 'La contraseña debe tener al menos 6 caracteres.' });
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Crear o Loguear usuario en AUTH
            let user;
            try {
                const res = await createUserWithEmailAndPassword(auth, email, password);
                user = res.user;
            } catch (authError: any) {
                if (authError.code === 'auth/email-already-in-use') {
                    const res = await signInWithEmailAndPassword(auth, email, password);
                    user = res.user;
                } else {
                    throw authError;
                }
            }
            
            if (!user) throw new Error("No se pudo obtener el usuario.");

            // 2. Ejecutar Alta Municipal vía Cloud Function (permisos de admin)
            const selfRegisterMunicipality = httpsCallable(functions!, 'selfRegisterMunicipalityV1');
            await selfRegisterMunicipality({
                cityKey,
                name: cityName,
                province,
                email: user.email
            });

            toast({ title: '¡Municipio Activado!', description: `Bienvenido a la gestión de ${cityName}.` });
            router.push('/municipal/dashboard');

        } catch (error: any) {
            console.error("Error en registro municipal:", error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="max-w-xl w-full border-white/5 bg-zinc-900/50 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="h-1.5 w-full bg-indigo-600" />
            <CardHeader className="text-center pt-8">
                <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center mb-4">
                    <VamoIcon name="building" className="h-6 w-6 text-indigo-500" />
                </div>
                <CardTitle className="text-2xl font-black">Alta de Municipio</CardTitle>
                <CardDescription>Configuración inicial y cuenta de administrador.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-10">
                
                <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                        <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest">Datos de la Localidad</h3>
                        
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-zinc-500">Buscar Ciudad</Label>
                            <PlaceAutocompleteInput
                                placeholder="Ej: Posadas, Misiones"
                                iconName="search"
                                onPlaceSelect={(place) => {
                                    if (place?.city) {
                                        const key = place.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
                                        setCityName(place.city);
                                        setCityKey(key);
                                        setProvince(place.address.split(',').slice(-2, -1)[0]?.trim() || '');
                                    }
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-zinc-500">ID de Ciudad</Label>
                                <Input 
                                    value={cityKey}
                                    readOnly
                                    className="bg-black/20 border-white/5 text-zinc-400 font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-zinc-500">Provincia</Label>
                                <Input 
                                    value={province}
                                    onChange={(e) => setProvince(e.target.value)}
                                    className="bg-black/50 border-white/10"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                        <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest">Cuenta de Administrador</h3>
                        
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-zinc-500">Email Oficial</Label>
                            <Input 
                                type="email" 
                                placeholder="oficial@municipio.gov.ar"
                                className="h-11 bg-black/50 border-white/10 rounded-lg"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-zinc-500">Contraseña</Label>
                            <Input 
                                type="password" 
                                className="h-11 bg-black/50 border-white/10 rounded-lg"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>
                </div>

                <Button 
                    onClick={handleRegister}
                    disabled={isSubmitting}
                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-lg font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                    {isSubmitting ? 'ACTIVANDO MUNICIPIO...' : 'ACTIVAR Y EMPEZAR'}
                </Button>

                <p className="text-center text-[10px] text-zinc-600 font-medium">
                    Esta acción creará una nueva jurisdicción activa en la red VamO.
                </p>
            </CardContent>
        </Card>
    );
}

export default function MunicipalRegisterPage() {
    return (
        <React.Suspense fallback={<div className="text-indigo-400">Cargando...</div>}>
            <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent">
                <RegisterForm />
            </main>
        </React.Suspense>
    );
}
