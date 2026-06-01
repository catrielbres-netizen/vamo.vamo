'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { VamoIcon } from '@/components/VamoIcon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

// Public Firebase initialization for verification page
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export default function PublicDriverVerifyPage() {
    const params = useParams();
    const driverId = params.id as string;
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!driverId) return;

        const publicRef = doc(db, 'public_driver_profiles', driverId);
        const unsubscribe = onSnapshot(publicRef, (snap) => {
            if (snap.exists()) {
                setProfile(snap.data());
                setError(false);
            } else {
                setError(true);
            }
            setLoading(false);
        }, (err) => {
            console.error("Public fetch error:", err);
            setError(true);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [driverId]);

    if (loading) return <VamoFullScreenLoader label="Verificando credencial..." />;

    if (error || !profile) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center gap-6">
                <VamoLogo variant="login" />
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                    <VamoIcon name="alert-triangle" className="w-10 h-10 text-red-500" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">Identidad no validada</h1>
                    <p className="text-zinc-500 text-sm max-w-xs mx-auto">No se encontró un perfil habilitado para este código. Contacte a la autoridad municipal si el error persiste.</p>
                </div>

                {/* DEBUG INFO (Temporary) */}
                <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/10 text-[10px] text-zinc-600 font-mono text-left max-w-xs w-full">
                    <p className="font-black text-zinc-500 mb-2 uppercase">Debug Diagnostics:</p>
                    <p>ID URL: {driverId}</p>
                    <p>Doc Existe: {profile ? 'SÍ' : 'NO'}</p>
                    <p>Ruta: public_driver_profiles/{driverId}</p>
                    <p>Error Hook: {error ? 'SÍ' : 'NO'}</p>
                </div>
            </div>
        );
    }

    const municipalStatus = profile.municipalStatus || 'pending';
    const isSuspended =
        profile.isSuspended === true ||
        profile.trafficSuspended === true ||
        profile.municipalSuspended === true ||
        profile.adminSuspended === true;
    const approved = profile.approved === true;
    const source = profile.suspensionSource || null;

    let municipalStatusLabel = "Pendiente de revisión";
    if (municipalStatus === 'active') {
        municipalStatusLabel = "Aprobado municipalmente";
    } else if (municipalStatus === 'municipal_observed') {
        municipalStatusLabel = "Observado";
    } else if (municipalStatus === 'rejected_by_municipality') {
        municipalStatusLabel = "Rechazado";
    } else if (municipalStatus === 'suspended_expired_license') {
        municipalStatusLabel = "Licencia Vencida";
    } else if (municipalStatus === 'suspended_expired_insurance') {
        municipalStatusLabel = "Seguro Vencido";
    } else if (municipalStatus === 'suspended_unpaid_canon') {
        municipalStatusLabel = "Canon Municipal Impago";
    } else if (municipalStatus === 'suspended_by_municipality') {
        municipalStatusLabel = "Suspendido por Municipalidad";
    }

    let operationalStatusLabel = profile.operationalStatusLabel || "Activo para operar";
    let operationalStatus = profile.operationalStatus || "active";
    let credentialStatus = profile.credentialStatus || "valid";

    // Compute locally if not synced yet (defensive fallback)
    if (!profile.operationalStatus) {
        if (isSuspended) {
            credentialStatus = "blocked";
            if (profile.trafficSuspended === true || source === 'traffic') {
                operationalStatus = "suspended_by_traffic";
                operationalStatusLabel = "Bloqueado operativamente por Tránsito";
            } else if (profile.municipalSuspended === true || source === 'municipal') {
                operationalStatus = "suspended_by_municipality";
                operationalStatusLabel = "Suspendido por Municipalidad";
            } else if (profile.adminSuspended === true || source === 'admin') {
                operationalStatus = "suspended_by_admin";
                operationalStatusLabel = "Suspendido por Administración VamO";
            } else {
                operationalStatus = "suspended";
                operationalStatusLabel = "Suspendido";
            }
        } else if (municipalStatus !== 'active') {
            credentialStatus = "pending";
            operationalStatus = "pending_municipal_review";
            operationalStatusLabel = "Habilitación Municipal Pendiente";
        } else if (!approved) {
            credentialStatus = "pending";
            operationalStatus = "not_approved";
            operationalStatusLabel = "Pendiente de Aprobación Final";
        } else {
            credentialStatus = "valid";
            operationalStatus = "active";
            operationalStatusLabel = "Activo para operar";
        }
    }

    // Ribbon properties mapping
    const isHabilitado = credentialStatus === 'valid';
    let ribbonText = "Credencial Vigente";
    let ribbonBg = "bg-emerald-500";
    if (credentialStatus === 'blocked') {
        ribbonText = "Credencial Restringida";
        ribbonBg = "bg-red-600";
    } else if (credentialStatus === 'expired') {
        ribbonText = "Credencial Vencida";
        ribbonBg = "bg-red-600";
    } else if (credentialStatus === 'rejected') {
        ribbonText = "Credencial Rechazada";
        ribbonBg = "bg-red-600";
    } else if (credentialStatus === 'pending') {
        ribbonText = "Credencial Pendiente";
        ribbonBg = "bg-amber-500";
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-indigo-500/30 font-sans pb-12">
            {/* Top Branding */}
            <div className="pt-12 pb-8 flex flex-col items-center gap-4">
                <VamoLogo variant="navbar" />
                <div className="bg-zinc-900/50 px-4 py-1.5 rounded-full border border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">Sistema de Verificación Institucional</p>
                </div>
            </div>

            <main className="container max-w-md mx-auto px-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Main ID Card */}
                <Card className={cn(
                    "rounded-[2.5rem] border-white/5 overflow-hidden shadow-2xl relative",
                    isHabilitado ? "bg-gradient-to-br from-indigo-900/40 to-emerald-900/10" : "bg-zinc-900/40"
                )}>
                    {/* Status Ribbon */}
                    <div className={cn(
                        "py-3 px-6 text-center text-[10px] font-black uppercase tracking-[0.2em] italic text-white",
                        ribbonBg
                    )}>
                        {ribbonText}
                    </div>

                    <CardContent className="p-8 space-y-6">
                        {credentialStatus === 'blocked' && (
                            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-center space-y-1">
                                <p className="text-xs font-black uppercase tracking-wider">¡Atención Inspector!</p>
                                <p className="text-sm font-bold leading-tight">Esta credencial no habilita la operación actualmente.</p>
                                <p className="text-[10px] opacity-80 mt-1">{operationalStatusLabel}</p>
                            </div>
                        )}

                        <div className="flex flex-col items-center gap-4 text-center">
                            <div className="relative">
                                <Avatar className="h-32 w-32 border-4 border-white/10 shadow-2xl">
                                    <AvatarImage src={profile.photoURL} alt={profile.displayName} className="object-cover" />
                                    <AvatarFallback className="text-4xl font-black bg-zinc-800 text-zinc-500">
                                        {profile.displayName?.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                {isHabilitado && (
                                    <div className="absolute -bottom-2 -right-2 bg-emerald-500 p-2 rounded-full shadow-xl border-4 border-[#0a0a0a]">
                                        <VamoIcon name="check" className="w-5 h-5 text-white" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white leading-tight">
                                    {profile.displayName}
                                </h2>
                                <p className="text-sm font-bold text-zinc-400 mt-1 uppercase tracking-tight">
                                    {profile.city || 'Municipio No Especificado'}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1">Categoría</p>
                                <p className="text-xs font-black text-white italic uppercase tracking-tight">{profile.driverSubtype || 'Particular'}</p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1">Legajo Municipal</p>
                                <p className="text-xs font-black text-indigo-400 font-mono tracking-wider">{profile.municipalCode || '---'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1">Estado Municipal</p>
                                <p className={cn(
                                    "text-xs font-black italic uppercase tracking-tight",
                                    municipalStatus === 'active' ? "text-emerald-400" : "text-amber-400"
                                )}>
                                    {municipalStatusLabel}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1">Estado Operativo</p>
                                <p className={cn(
                                    "text-xs font-black italic uppercase tracking-tight",
                                    operationalStatus === 'active' ? "text-emerald-400" : "text-red-400"
                                )}>
                                    {operationalStatusLabel}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5 space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                                    <VamoIcon name="car" className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 leading-none mb-1">Vehículo Habilitado</p>
                                    <p className="text-sm font-black text-white uppercase italic tracking-tighter">
                                        {profile.vehicleModel || 'N/A'} <span className="text-zinc-500 not-italic ml-1">({profile.vehicleYear || '-'})</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                                    <VamoIcon name="credit-card" className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 leading-none mb-1">Dominio / Patente</p>
                                    <p className="text-xl font-black text-white uppercase tracking-widest font-mono">
                                        {profile.licensePlate || '--- ---'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Safety Disclaimer */}
                        <div className="pt-4 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                                <VamoIcon name="shield-check" className="w-3.5 h-3.5" /> Verificado Oficialmente
                            </div>
                            <p className="text-[9px] text-zinc-700 leading-relaxed italic">
                                Esta información es de carácter público para seguridad ciudadana. VamO garantiza la integridad de estos datos mediante firma criptográfica municipal.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Return button or help */}
                <div className="pt-6 flex flex-col items-center gap-4">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">¿Dudas? Contactá a Tránsito Municipal</p>
                    <div className="text-[8px] text-zinc-800 font-medium">
                        ID: {driverId} · Ref: {new Date().getTime().toString(36)}
                    </div>
                </div>
            </main>
        </div>
    );
}
