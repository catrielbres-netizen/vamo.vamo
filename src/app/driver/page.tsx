'use client';

import React, { useEffect } from 'react';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DriverWelcomePage() {
    const { user, profile, loading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user && profile) {
            router.replace('/driver/rides');
        }
    }, [user, profile, loading, router]);

    if (loading || user) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950">
               <div className="relative w-20 h-20 mb-6">
                   <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping opacity-75" />
                   <div className="absolute inset-2 bg-indigo-500/30 rounded-full animate-pulse" />
               </div>
               <p className="mt-4 text-zinc-500 font-medium tracking-widest uppercase text-xs">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="mb-8">
                <VamoLogo variant="navbar" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter italic mb-4">
                Bienvenido a VamO Conductor
            </h1>
            <p className="text-zinc-400 text-sm max-w-xs mx-auto leading-relaxed mb-10">
                Registrate para trabajar en la plataforma y recibir viajes en tu ciudad.
            </p>
            
            <div className="w-full max-w-sm space-y-4">
                <Button asChild className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-500/20 transition-all">
                    <Link href="/driver/register">Crear cuenta de conductor</Link>
                </Button>
                <Button asChild variant="outline" className="w-full h-14 bg-transparent border-white/10 hover:bg-white/5 text-white font-bold uppercase tracking-widest rounded-2xl transition-all">
                    <Link href="/driver/login">Ya tengo cuenta</Link>
                </Button>
            </div>
        </div>
    );
}
