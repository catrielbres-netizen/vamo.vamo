'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase/auth/use-user';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import { useFirestore } from '@/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';

export default function TrafficDashboard() {
    const { user, profile, role, loading: authLoading } = useUser();
    const { toast } = useToast();
    const telemetry = useTelemetry();
    const [stats, setStats] = useState<any>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [profileTimeout, setProfileTimeout] = useState(false);
    const [selectedCityKey, setSelectedCityKey] = useState<string>('');
    const [recentRides, setRecentRides] = useState<any[]>([]);
    const [loadingRides, setLoadingRides] = useState(true);
    const router = useRouter();
    const db = useFirestore();

    const allowedRoles = [
        'admin',
        'superadmin',
        'traffic',
        'traffic_admin',
        'traffic_operator',
        'traffic_municipal',
        'admin_municipal',
        'municipal_admin',
    ];

    const isGlobalAdmin = role === 'admin' || role === 'superadmin';

    const fetchStats = async (cityToFetch: string) => {
        if (!cityToFetch) return;
        setLoadingStats(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const getStats = httpsCallable(functions, 'getTrafficStatsV1');
            const res = await getStats({ cityKey: cityToFetch });
            setStats(res.data);
            telemetry.trackEvent({
                type: 'municipal_operation',
                eventName: 'traffic_dashboard_loaded',
                metadata: {
                    cityKey: cityToFetch,
                }
            });
        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Error de conexión', 
                description: 'No se pudieron sincronizar las estadísticas de tránsito.' 
            });
        } finally {
            setLoadingStats(false);
        }
    };

    useEffect(() => {
        if (profile) {
            // Non-admins must use their profile's cityKey, admins default to 'rawson'
            setSelectedCityKey(profile.cityKey || 'rawson');
        }
    }, [profile]);

    useEffect(() => {
        if (selectedCityKey) {
            fetchStats(selectedCityKey);
        }
    }, [selectedCityKey]);

    // 5 seconds profile load timeout
    useEffect(() => {
        let t: NodeJS.Timeout;
        if (user && !profile && authLoading === false) {
            t = setTimeout(() => {
                setProfileTimeout(true);
            }, 5000);
        }
        return () => clearTimeout(t);
    }, [user, profile, authLoading]);

    // Fetch recent rides
    useEffect(() => {
        if (!selectedCityKey || !db) return;
        setLoadingRides(true);

        const q = query(
            collection(db, 'rides'),
            where('cityKey', '==', selectedCityKey),
            orderBy('updatedAt', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRecentRides(rides);
            setLoadingRides(false);
        }, (error) => {
            console.error("Error fetching recent rides:", error);
            setLoadingRides(false);
        });

        return () => unsubscribe();
    }, [selectedCityKey, db]);

    // Redirection and fetching logic
    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            console.log("No user found in dashboard, redirecting to /traffic/login");
            router.replace('/traffic/login');
            return;
        }

        if (role) {
            if (!allowedRoles.includes(role)) {
                toast({ 
                    variant: 'destructive', 
                    title: 'Acceso denegado', 
                    description: 'Tu cuenta no tiene permisos para el área de Tránsito.' 
                });
                router.replace('/traffic/login');
                return;
            }
        }
    }, [user, role, authLoading, router]);

    // 1. If actively loading auth state or profile and no timeout has hit yet
    if (authLoading && !profileTimeout) {
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#050505]">
                <div className="text-center space-y-4">
                    <VamoIcon name="loader" className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest animate-pulse">Iniciando Panel de Tránsito...</p>
                </div>
            </div>
        );
    }

    // 2. If no user is logged in
    if (!user) {
        return null; // Redirect logic handles this
    }

    // 3. If profile takes too long or failed to load
    if (!profile) {
        if (profileTimeout) {
            return (
                <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#050505] p-6">
                    <div className="max-w-md w-full p-8 rounded-[2rem] border border-white/5 bg-zinc-950/85 text-center space-y-6">
                        <VamoIcon name="alert-triangle" className="w-12 h-12 text-rose-500 mx-auto animate-pulse" />
                        <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">Error de Configuración</h2>
                        <p className="text-xs text-zinc-400">
                            No se pudo recuperar la información de tu cuenta. Por favor verifica tu conexión o vuelve a iniciar sesión.
                        </p>
                        <Button onClick={() => window.location.reload()} className="w-full h-12 bg-white hover:bg-zinc-200 text-black font-black rounded-xl">
                            REINTENTAR
                        </Button>
                    </div>
                </div>
            );
        }
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#050505]">
                <div className="text-center space-y-4">
                    <VamoIcon name="loader" className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest animate-pulse">Cargando perfil operativo...</p>
                </div>
            </div>
        );
    }

    // 4. If role is unauthorized
    if (!role || !allowedRoles.includes(role)) {
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#050505] p-6">
                <div className="max-w-md w-full p-8 rounded-[2rem] border border-white/5 bg-zinc-950/85 text-center space-y-6">
                    <VamoIcon name="shield-off" className="w-12 h-12 text-rose-500 mx-auto" />
                    <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">Acceso Denegado</h2>
                    <p className="text-xs text-zinc-400">
                        La cuenta actual ({user.email}) no posee los permisos operacionales necesarios para ingresar a Tránsito.
                    </p>
                    <Button onClick={() => router.replace('/traffic/login')} className="w-full h-12 bg-white hover:bg-zinc-200 text-black font-black rounded-xl">
                        IR AL ACCESO DE TRÁNSITO
                    </Button>
                </div>
            </div>
        );
    }

    // 5. If profile exists but cityKey and city are missing
    if (!profile.cityKey && !profile.city) {
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#050505] p-6">
                <div className="max-w-md w-full p-8 rounded-[2rem] border border-white/5 bg-zinc-950/85 text-center space-y-6">
                    <VamoIcon name="map-pin-off" className="w-12 h-12 text-amber-500 mx-auto animate-bounce" />
                    <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">Sin Ciudad Asignada</h2>
                    <p className="text-xs text-zinc-400">
                        Tu perfil de agente de tránsito no posee una jurisdicción municipal válida asignada en el sistema.
                    </p>
                    <p className="text-[10px] text-zinc-600 font-bold uppercase">
                        Comunícate con soporte técnico municipal.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-1000">
            {/* HERO / WELCOME */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-3">
                    <h1 className="text-5xl font-black tracking-tighter text-white italic uppercase">Control de Tránsito</h1>
                    {isGlobalAdmin ? (
                        <div className="flex items-center gap-3">
                            <span className="text-zinc-500 font-black uppercase tracking-widest text-[10px] bg-zinc-900 border border-white/5 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                Vista Global Admin
                            </span>
                            <Select onValueChange={setSelectedCityKey} value={selectedCityKey}>
                                <SelectTrigger className="bg-white/5 border-white/5 rounded-xl h-10 w-40 text-xs font-black uppercase tracking-widest text-zinc-300">
                                    <SelectValue placeholder="Ciudad..." />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-white/10 text-white">
                                    <SelectItem value="rawson">Rawson</SelectItem>
                                    <SelectItem value="trelew">Trelew</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                            <VamoIcon name="map-pin" className="w-3 h-3 text-indigo-500" />
                            Jurisdicción Municipal: <span className="text-white font-black italic">{profile.city || selectedCityKey.toUpperCase()}</span>
                        </p>
                    )}
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
                {loadingStats ? (
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
                        <Button variant="ghost" size="sm" className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors" onClick={() => fetchStats(selectedCityKey)}>Actualizar</Button>
                    </div>
                    <CardContent className="p-0">
                        {loadingRides ? (
                            <div className="p-12 space-y-4">
                                <Skeleton className="h-16 w-full bg-zinc-900/50 rounded-2xl" />
                                <Skeleton className="h-16 w-full bg-zinc-900/50 rounded-2xl" />
                                <Skeleton className="h-16 w-full bg-zinc-900/50 rounded-2xl" />
                            </div>
                        ) : recentRides.length === 0 ? (
                            <div className="space-y-6 text-center py-12">
                                <VamoIcon name="clipboard-list" className="w-12 h-12 text-zinc-800 mx-auto" />
                                <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px]">Sin eventos operativos recientes en {selectedCityKey.toUpperCase()}.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto pr-2">
                                {recentRides.map(ride => {
                                    let statusColor = "bg-zinc-800 text-zinc-400";
                                    let statusLabel = "Desconocido";
                                    let icon = "activity";

                                    if (ride.status === 'searching') { statusColor = "bg-amber-500/20 text-amber-500"; statusLabel = "Buscando Móvil"; icon = "search"; }
                                    else if (ride.status === 'assigned') { statusColor = "bg-indigo-500/20 text-indigo-400"; statusLabel = "Móvil Asignado"; icon = "user-check"; }
                                    else if (ride.status === 'in_progress') { statusColor = "bg-blue-500/20 text-blue-400"; statusLabel = "Viaje Iniciado"; icon = "navigation"; }
                                    else if (ride.status === 'completed') { statusColor = "bg-emerald-500/20 text-emerald-500"; statusLabel = "Finalizado"; icon = "check-circle"; }
                                    else if (ride.status === 'cancelled') { statusColor = "bg-rose-500/20 text-rose-500"; statusLabel = "Cancelado"; icon = "x-circle"; }

                                    const timeStr = ride.updatedAt?.toDate ? ride.updatedAt.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
                                    
                                    return (
                                        <div key={ride.id} className="p-6 hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${statusColor.replace('text-', 'text-opacity-100 bg-opacity-20 ')}`}>
                                                    <VamoIcon name={icon} className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white flex items-center gap-2">
                                                        {statusLabel}
                                                        {ride.standId && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded uppercase tracking-widest">Desde Parada</span>}
                                                    </p>
                                                    <p className="text-[10px] text-zinc-500 font-mono mt-1 truncate uppercase">
                                                        {ride.driverName ? `Conductor: ${ride.driverName}` : 'Sin conductor asignado'} • {ride.serviceType === 'express' ? 'PARTICULAR' : 'TAXI/REMIS'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[10px] font-black text-zinc-400">{timeStr}</p>
                                                <p className="text-[9px] text-zinc-600 uppercase font-mono tracking-widest mt-1">ID: {ride.id.slice(0, 8)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
