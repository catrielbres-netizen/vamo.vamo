'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useFunctions } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { City, normalizeCityKey } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

function OnboardingContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, profile, loading: userLoading } = useUser();
    const firestore = useFirestore();
    const functions = useFunctions();
    
    const cityKey = searchParams.get('cityKey');
    const [city, setCity] = useState<City | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!firestore || !cityKey) {
            setLoading(false);
            return;
        }

        const fetchCity = async () => {
            try {
                const cityRef = doc(firestore, 'cities', cityKey);
                const snap = await getDoc(cityRef);
                if (snap.exists()) {
                    setCity({ ...snap.data(), id: snap.id } as City);
                }
            } catch (error) {
                console.error("Error fetching city for onboarding:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCity();
    }, [firestore, cityKey]);

    const handleActivate = async () => {
        if (!functions || !cityKey || !user) return;
        
        setProcessing(true);
        try {
            const finalizeOnboarding = httpsCallable(functions, 'finalizeOnboardingV1');
            await finalizeOnboarding({ cityKey });
            
            toast({
                title: "¡Ciudad Activada!",
                description: `Has sido asignado como administrador de ${city?.name}.`,
            });
            
            router.push('/municipal/dashboard');
        } catch (error: any) {
            console.error("Error activating city:", error);
            toast({
                title: "Error de activación",
                description: error.message || "No se pudo completar el onboarding.",
                variant: "destructive"
            });
        } finally {
            setProcessing(false);
        }
    };

    if (userLoading || loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-indigo-400">
                <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!cityKey || !city) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
                <Card className="max-w-md w-full p-8 border-white/5 bg-zinc-900 space-y-4">
                    <VamoIcon name="alert-triangle" className="h-12 w-12 text-amber-500 mx-auto" />
                    <h1 className="text-xl font-bold text-white">Enlace Inválido</h1>
                    <p className="text-zinc-400 text-sm">Esta invitación no existe o ha expirado. Por favor, contactá al soporte de VamO.</p>
                </Card>
            </div>
        );
    }

    if (city.status === 'active') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
                <Card className="max-w-md w-full p-8 border-white/5 bg-zinc-900 space-y-4">
                    <VamoIcon name="check-circle" className="h-12 w-12 text-emerald-500 mx-auto" />
                    <h1 className="text-xl font-bold text-white">Ciudad ya Activa</h1>
                    <p className="text-zinc-400 text-sm">La municipalidad de {city.name} ya se encuentra operativa.</p>
                    <Button onClick={() => router.push('/municipal/dashboard')} className="w-full bg-indigo-600 hover:bg-indigo-500">
                        Ir al Dashboard
                    </Button>
                </Card>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
                <Card className="max-w-md w-full p-8 border-white/5 bg-zinc-900 space-y-6">
                    <VamoIcon name="mail" className="h-12 w-12 text-indigo-400 mx-auto" />
                    <div className="space-y-2">
                        <h1 className="text-xl font-bold text-white">Invitación para {city.name}</h1>
                        <p className="text-zinc-400 text-sm">Para continuar con el onboarding municipal, debés iniciar sesión o registrarte con tu correo oficial.</p>
                    </div>
                    <Button onClick={() => router.push(`/municipal/login?redirect=/municipal/onboarding?cityKey=${cityKey}`)} className="w-full bg-indigo-600 hover:bg-indigo-500">
                        Iniciar Sesión
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white selection:bg-indigo-500/30">
            <div className="max-w-2xl mx-auto px-6 py-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="flex items-center gap-3 mb-8">
                    <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <VamoIcon name="building" className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Onboarding Municipal</h1>
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Activa tu ciudad en VamO</p>
                    </div>
                </div>

                <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-xl p-8 space-y-8 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <VamoIcon name="building" className="h-32 w-32" />
                    </div>

                    <section className="space-y-6 relative z-10">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ciudad a activar</label>
                            <div className="text-3xl font-black text-white">{city.name}</div>
                            <p className="text-zinc-400 text-sm">{city.province}, {city.country}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                <p className="text-[10px] font-black text-zinc-500 uppercase mb-2">Administrador</p>
                                <p className="text-sm font-bold text-indigo-400">{profile?.name || user.email}</p>
                                <p className="text-[10px] text-zinc-600">ID: {user.uid}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                <p className="text-[10px] font-black text-zinc-500 uppercase mb-2">Rol Asignado</p>
                                <p className="text-sm font-bold text-emerald-400 uppercase tracking-tighter">ADMIN_MUNICIPAL</p>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <div className="flex gap-3 text-sm text-zinc-400">
                                <VamoIcon name="check-circle" className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                                <p>Al activar, aceptar el rol de responsable municipal para <strong>{city.name}</strong>.</p>
                            </div>
                            <div className="flex gap-3 text-sm text-zinc-400">
                                <VamoIcon name="check-circle" className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                                <p>Podrás gestionar conductores express, validar documentación y ver métricas locales.</p>
                            </div>
                        </div>

                        <Button 
                            onClick={handleActivate} 
                            disabled={processing}
                            className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-lg font-black rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-95 flex gap-2"
                        >
                            {processing ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>Aceptar e Inicializar {city.name}</>
                            )}
                        </Button>
                        
                        <p className="text-[10px] text-center text-zinc-600">
                            Presionando el botón, confirmás la activación técnica de la plataforma para tu jurisdicción.
                        </p>
                    </section>
                </Card>
            </div>
        </main>
    );
}

export default function MunicipalOnboardingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-indigo-400">
                <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
            </div>
        }>
            <OnboardingContent />
        </Suspense>
    );
}
