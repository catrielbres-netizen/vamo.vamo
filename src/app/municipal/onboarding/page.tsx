'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useFirebase } from '@/firebase/provider';
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    serverTimestamp 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '@/firebase';

interface City {
    id: string;
    name: string;
    province: string;
    cityKey: string;
}

interface Invitation {
    cityKey: string;
    cityName: string;
    token: string;
}

export default function OnboardingPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { firestore, functions } = useFirebase();
    const { user, profile, loading: userLoading } = useUser();
    const { toast } = useToast();

    const cityKey = searchParams.get('cityKey');
    const token = searchParams.get('token');

    const [city, setCity] = useState<City | null>(null);
    const [invitation, setInvitation] = useState<Invitation | null>(null);
    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState(false);
    const [password, setPassword] = useState('');
    const auth = useAuth();

    useEffect(() => {
        const resolveOnboarding = async () => {
            try {
                if (!cityKey || !token || !functions) return;

                const validateInvite = httpsCallable(functions, 'validateInvitationV1');
                const result = await validateInvite({ cityKey, token });
                const data = result.data as any;
                
                setInvitation(data.invitation);
                setCity(data.city);

            } catch (e: any) {
                console.error("Error resolving onboarding:", e);
                // Si la invitacion no es valida, invitation queda null
            } finally {
                setLoading(false);
            }
        };

        resolveOnboarding();
    }, [cityKey, token, functions]);

    const handleActivate = async () => {
        if (!user || !city || !invitation) return;
        setActivating(true);

        try {
            const finalizeOnboarding = httpsCallable(functions, 'finalizeOnboardingV1');
            await finalizeOnboarding({
                cityKey: city.id, // Usamos el ID real del documento
                token: token
            });

            toast({ title: "✅ Activación Exitosa", description: `${city.name} ya está bajo tu gestión.` });
            router.push('/municipal/dashboard');
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        } finally {
            setActivating(false);
        }
    };

    if (userLoading || loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        );
    }

    const handleRegisterAndActivate = async () => {
        if (!auth || !city || !invitation || !invitation.municipalityEmail || !password) return;
        setActivating(true);

        try {
            await createUserWithEmailAndPassword(auth, invitation.municipalityEmail, password);
            // El usuario ahora está logueado y Firebase se encargará de setear 'user'
            // Esperaremos a que 'user' se popule, o llamamos a handleActivate directo
            // handleActivate usa 'user', pero createUser lo loguea.
            
            // Wait slightly for auth state to propagate, or just call the backend function since we are now authed!
            const finalizeOnboarding = httpsCallable(functions, 'finalizeOnboardingV1');
            await finalizeOnboarding({
                cityKey: city.id,
                token: token
            });

            toast({ title: "✅ Cuenta Creada y Activada", description: `Bienvenido a la gestión de ${city.name}.` });
            router.push('/municipal/dashboard');
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error al crear cuenta", description: e.message });
            setActivating(false);
        }
    };

    // SI NO HAY INVITACIÓN VALIDA
    if (!invitation || !city) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center p-6">
                <Card className="max-w-md w-full p-8 border-white/5 bg-zinc-900 text-center space-y-6">
                    <VamoIcon name="alert-triangle" className="h-12 w-12 text-amber-500 mx-auto" />
                    <h2 className="text-xl font-bold text-white">Invitación no encontrada</h2>
                    <p className="text-zinc-500 text-sm">El link es inválido o ya fue utilizado. Por favor, generá uno nuevo desde el Admin.</p>
                    <div className="text-[10px] font-mono text-zinc-700 bg-black/50 p-2 rounded">
                        ID: {cityKey} | UID: {user.uid.slice(0,5)}
                    </div>
                    <Button onClick={() => router.push('/admin/expansion')} variant="outline" className="w-full">
                        Volver al Hub
                    </Button>
                </Card>
            </main>
        );
    }

    // PANTALLA DE ACTIVACIÓN FINAL
    return (
        <main className="min-h-screen bg-black text-white selection:bg-indigo-500/30">
            <div className="max-w-2xl mx-auto px-6 py-20 animate-in fade-in duration-700">
                <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-xl p-10 space-y-10 overflow-hidden relative shadow-2xl">
                    <div className="absolute -top-10 -right-10 opacity-10 blur-3xl h-64 w-64 bg-emerald-500 rounded-full" />
                    
                    <section className="space-y-8 relative z-10 text-center">
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-emerald-400">Paso Final</p>
                            <h2 className="text-4xl font-black tracking-tighter leading-none">
                                Activar <span className="text-indigo-400">{city.name}</span>
                            </h2>
                            <p className="text-zinc-400 max-w-sm mx-auto">
                                Confirmá que sos el responsable de gestionar VamoMuni en esta localidad.
                            </p>
                        </div>

                        {!user ? (
                            <div className="space-y-6 text-left bg-black/40 p-6 rounded-2xl border border-white/5">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Email Oficial</Label>
                                    <Input 
                                        disabled
                                        value={invitation.municipalityEmail}
                                        className="h-12 bg-black border-white/10 text-zinc-400"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Crear Contraseña</Label>
                                    <Input 
                                        type="password"
                                        placeholder="Mínimo 6 caracteres"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-12 bg-black border-white/10"
                                    />
                                </div>
                                <Button 
                                    onClick={handleRegisterAndActivate}
                                    disabled={activating || password.length < 6}
                                    className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl"
                                >
                                    {activating ? "ACTIVANDO..." : "CREAR CUENTA Y ACTIVAR"}
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <Button 
                                    onClick={handleActivate}
                                    disabled={activating}
                                    className="w-full h-16 bg-white hover:bg-zinc-100 text-black text-xl font-black rounded-2xl shadow-2xl transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {activating ? "ACTIVANDO..." : "CONFIRMAR ACTIVACIÓN"}
                                </Button>
                            </div>
                        )}
                    </section>
                </Card>
            </div>
        </main>
    );
}
