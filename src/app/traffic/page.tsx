'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase/auth/use-user';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TrafficDashboard() {
    const { profile } = useUser();
    const { toast } = useToast();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const getStats = httpsCallable(functions, 'getTrafficStatsV1');
            const res = await getStats();
            setStats(res.data);
        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Error de conexión', 
                description: 'No se pudieron sincronizar las estadísticas de tránsito.' 
            });
        } finally {
            setLoading(false);
        }
    };

    const router = useRouter();

    useEffect(() => {
        if (profile) {
            // Role guard: Traffic is limited to operators, municipal admins or global admins
            const allowedRoles = ['traffic_operator', 'admin_municipal', 'admin'];
            if (!allowedRoles.includes(profile.role)) {
                toast({ 
                    variant: 'destructive', 
                    title: 'Acceso denegado', 
                    description: 'Tu cuenta no tiene permisos para el área de Tránsito.' 
                });
                router.replace('/traffic/login');
                return;
            }
            fetchStats();
        } else {
            router.replace('/traffic/login');
        }
    }, [profile]);

    if (!profile) return null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-1000">
            {/* HERO / WELCOME */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-5xl font-black tracking-tighter text-white italic uppercase">Control de Tránsito</h1>
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                        <VamoIcon name="map-pin" className="w-3 h-3 text-indigo-500" />
                        Jurisdicción Municipal: {profile.city || 'Jurisdicción VamO'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link href="/traffic/drivers">
                        <Button className="h-14 px-8 rounded-2xl bg-white text-black font-black hover:bg-zinc-200 transition-all shadow-xl shadow-white/5 group">
                            <VamoIcon name="search" className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                            BUSCAR CONDUCTOR
                        </Button>
                    </Link>
                </div>
            </div>

            {/* METRICS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading ? (
                    Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-[2.5rem] bg-zinc-900/50" />)
                ) : (
                    <>
                        <MetricCard title="Habilitados" value={stats?.active} total={stats?.total} color="emerald" icon="check-circle" />
                        <MetricCard title="Pendientes" value={stats?.pending} color="amber" icon="clock" />
                        <MetricCard title="Documentación Vencida" value={stats?.expired} color="red" icon="alert-triangle" />
                        <MetricCard title="Suspendidos" value={stats?.suspended} color="zinc" icon="slash" />
                    </>
                )}
            </div>

            {/* QUICK ACTIONS & RECENT ACTIVITY SECTIONS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* RECENT ALERTS / ACTIONS */}
                <Card className="lg:col-span-2 rounded-[3rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden premium-shadow">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-xl font-black tracking-tighter uppercase italic">Operativos Recientes</h2>
                        <Button variant="ghost" size="sm" className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Ver Historial</Button>
                    </div>
                    <CardContent className="p-8">
                        <div className="space-y-6 text-center py-12">
                            <VamoIcon name="clipboard-list" className="w-12 h-12 text-zinc-800 mx-auto" />
                            <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px]">No hay actividad reciente registrada en esta jurisdicción.</p>
                        </div>
                    </CardContent>
                </Card>

                {/* LINKS / UTILS */}
                <div className="space-y-6">
                    <Card className="rounded-[2.5rem] border-white/5 bg-gradient-to-br from-indigo-600/20 to-transparent p-8 premium-shadow">
                        <h3 className="text-lg font-black tracking-tighter uppercase italic mb-4">Herramientas</h3>
                        <div className="grid grid-cols-1 gap-3">
                            <QuickLink href="/traffic/map" label="Monitoreo de Flota" icon="map" />
                            <QuickLink href="/traffic/documents" label="Revisión de Legajos" icon="file-text" />
                            <QuickLink href="/traffic/drivers" label="Base de Datos" icon="database" />
                        </div>
                    </Card>
                    
                    <Card className="rounded-[2.5rem] border-white/5 bg-zinc-900/30 p-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                                <VamoIcon name="info" className="w-6 h-6 text-zinc-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Soporte Técnico</p>
                                <p className="text-[10px] text-zinc-600">Contacto exclusivo área municipal</p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, total, color, icon }: any) {
    const colorMap: any = {
        emerald: "text-emerald-400 from-emerald-500/10 to-transparent border-emerald-500/10",
        amber: "text-amber-400 from-amber-500/10 to-transparent border-amber-500/10",
        red: "text-red-400 from-red-500/10 to-transparent border-red-500/10",
        zinc: "text-zinc-500 from-zinc-500/10 to-transparent border-zinc-500/10"
    };

    return (
        <Card className={`rounded-[2.5rem] border bg-gradient-to-br ${colorMap[color]} overflow-hidden relative group transition-all hover:scale-[1.02] duration-500`}>
            <VamoIcon name={icon} className="absolute -right-6 -bottom-6 w-32 h-32 opacity-5 group-hover:scale-110 transition-transform duration-1000" />
            <CardContent className="p-10 flex flex-col gap-1 relative z-10">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] opacity-60 italic">{title}</span>
                <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black italic tracking-tighter">{value ?? 0}</span>
                    {total && <span className="text-lg font-bold opacity-30">/ {total}</span>}
                </div>
            </CardContent>
        </Card>
    );
}

function QuickLink({ href, label, icon }: any) {
    return (
        <Link href={href}>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] transition-all group">
                <div className="flex items-center gap-4">
                    <VamoIcon name={icon} className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                    <span className="text-xs font-bold text-zinc-300 group-hover:text-white transition-colors uppercase tracking-widest">{label}</span>
                </div>
                <VamoIcon name="chevron-right" className="w-4 h-4 text-zinc-700 group-hover:text-indigo-400" />
            </div>
        </Link>
    );
}
