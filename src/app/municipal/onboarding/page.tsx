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
import { useToast } from '@/hooks/use-toast';

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

    // Flujo Robusto: 
    // 1. Si no hay usuario, mandarlo al login con redirect.
    // 2. Si hay usuario, validar invitación directamente.
    
    useEffect(() => {
        if (userLoading) return;

        if (!user) {
            // No logueado: No podemos leer DB de forma segura/resiliente en prod sin reglas publicas.
            // Mandamos a loguearse primero.
            setLoading(false);
            return;
        }

        const resolveOnboarding = async () => {
            try {
                if (!cityKey || !token || !firestore) return;

                // Ahora que estamos logueados, tenemos permisos de lectura (signedIn)
                const invitesSnap = await getDocs(query(
                    collection(firestore, 'municipal_onboarding_invites'),
                    where('token', '==', token),
                    where('status', '==', 'sent')
                ));

                if (invitesSnap.empty) {
                    setLoading(false);
                    return;
                }

                const inviteData = invitesSnap.docs[0].data() as Invitation;
                setInvitation(inviteData);

                // Buscar la ciudad
                const cityRef = doc(firestore, 'cities', cityKey);
                const citySnap = await getDoc(cityRef);
                
                if (citySnap.exists()) {
                    setCity({ ...citySnap.data(), id: citySnap.id } as City);
                } else {
                    // Fallback por si el ID no coincide pero el cityKey si
                    const q = query(collection(firestore, 'cities'), where('cityKey', '==', cityKey));
                    const qSnap = await getDocs(q);
                    if (!qSnap.empty) {
                        setCity({ ...qSnap.docs[0].data(), id: qSnap.docs[0].id } as City);
                    }
                }
            } catch (e) {
                console.error("Error resolving onboarding:", e);
            } finally {
                setLoading(false);
            }
        };

        resolveOnboarding();
    }, [user, userLoading, cityKey, token, firestore]);

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

    // SI NO ESTÁ LOGUEADO: Mostrar pantalla de "Bienvenida + CTA Login"
    if (!user) {
        return (
            <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
                <Card className="max-w-md w-full p-8 border-white/5 bg-zinc-900 shadow-2xl space-y-8 text-center">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center">
                        <VamoIcon name="building" className="h-8 w-8 text-white" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-3xl font-black tracking-tighter">VamoMuni</h1>
                        <p className="text-zinc-400 leading-relaxed">
                            Has sido invitado a activar la gestión municipal de VamO. Para continuar, debés iniciar sesión con tu cuenta oficial.
                        </p>
                    </div>
                    <Button 
                        onClick={() => router.push(`/municipal/login?redirect=${encodeURIComponent(window.location.href)}`)}
                        className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-lg font-bold rounded-xl"
                    >
                        Iniciar Sesión para Activar
                    </Button>
                </Card>
            </main>
        );
    }

    // SI NO HAY INVITACIÓN (y ya está logueado)
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

    // PANTALLA DE ACTIVACIÓN FINAL (Logueado + Invitación OK)
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

                        <div className="flex flex-col gap-4">
                            <Button 
                                onClick={handleActivate}
                                disabled={activating}
                                className="w-full h-16 bg-white hover:bg-zinc-100 text-black text-xl font-black rounded-2xl shadow-2xl transition-all active:scale-95 disabled:opacity-50"
                            >
                                {activating ? "ACTIVANDO..." : "CONFIRMAR ACTIVACIÓN"}
                            </Button>
                        </div>
                    </section>
                </Card>
            </div>
        </main>
    );
}
