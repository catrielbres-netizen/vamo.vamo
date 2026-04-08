'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
    collection, 
    query, 
    where, 
    getCountFromServer, 
    Timestamp
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

/**
 * CAUSA DEL ERROR #310:
 * El error se debía a la definición del componente 'Content' dentro de 'KPICard'.
 * En React, definir componentes dentro del cuerpo de renderizado de otro componente 
 * hace que se cree un tipo de componente nuevo en cada render, lo que rompe la reconciliación
 * de hooks si el componente interno tuviera hooks, o causa desmontajes masivos de DOM.
 * Además, el early return de 'if (loading)' en el componente principal podía causar 
 * que el número de hooks o sub-componentes variara de forma inconsistente.
 */

export default function AdminDashboardPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const { toast } = useToast();
    const [devBusy, setDevBusy] = useState(false);
    const isDev = process.env.NODE_ENV === 'development';
    
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        pendingDrivers: 0,
        approvedDrivers: 0,
        onlineDrivers: 0,
        pendingWithdrawals: 0,
        activeRides: 0,
        recentCompletedRides: 0
    });

    // 1. Memoizamos la función de carga para que sea estable
    const fetchMetrics = useCallback(async () => {
        if (!firestore) return;
        setLoading(true);
        try {
            const usersColl = collection(firestore, 'users');
            const withdrawalsColl = collection(firestore, 'withdrawal_requests');
            const ridesColl = collection(firestore, 'rides');

            const pendingDriversQuery = query(usersColl, where('role', '==', 'driver'), where('approved', '==', false));
            const approvedDriversQuery = query(usersColl, where('role', '==', 'driver'), where('approved', '==', true));
            const onlineDriversQuery = query(usersColl, where('role', '==', 'driver'), where('driverStatus', '==', 'online'));
            const pendingWithdrawalsQuery = query(withdrawalsColl, where('status', '==', 'pending'));
            const activeRidesQuery = query(ridesColl, where('status', 'in', ['searching', 'accepted', 'arrived', 'picked_up']));
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const completedTodayQuery = query(
                ridesColl, 
                where('status', '==', 'completed'), 
                where('completedAt', '>=', Timestamp.fromDate(today))
            );

            const [
                pendingSnap, 
                approvedSnap, 
                onlineSnap, 
                withdrawalsSnap, 
                activeRidesSnap,
                completedTodaySnap
            ] = await Promise.all([
                getCountFromServer(pendingDriversQuery),
                getCountFromServer(approvedDriversQuery),
                getCountFromServer(onlineDriversQuery),
                getCountFromServer(pendingWithdrawalsQuery),
                getCountFromServer(activeRidesQuery),
                getCountFromServer(completedTodayQuery)
            ]);

            setMetrics({
                pendingDrivers: pendingSnap.data().count,
                approvedDrivers: approvedSnap.data().count,
                onlineDrivers: onlineDriversQuery ? onlineSnap.data().count : 0, // Safeguard
                pendingWithdrawals: withdrawalsSnap.data().count,
                activeRides: activeRidesSnap.data().count,
                recentCompletedRides: completedTodaySnap.data().count
            });
        } catch (error) {
            console.error("Error fetching dashboard metrics:", error);
        } finally {
            setLoading(false);
        }
    }, [firestore]);

    // 2. Efecto estable para carga inicial
    useEffect(() => {
        if (!firestore || profile?.role !== 'admin') return;
        fetchMetrics();
    }, [firestore, profile?.role, fetchMetrics]);

    // 3. NO usar early returns que bloqueen hooks posteriores.
    // Usamos renderizado condicional dentro del return principal.

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black">Dashboard Operativo</h1>
                    <p className="text-muted-foreground">Estado de la plataforma en tiempo real.</p>
                </div>
                <button 
                    onClick={fetchMetrics}
                    disabled={loading}
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    title="Actualizar"
                >
                    <VamoIcon name="rotate-ccw" className={cn("h-5 w-5", loading && "animate-spin")} />
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <Skeleton key={i} className="h-32 rounded-2xl" />
                    ))}
                </div>
            ) : (
                <>
                    {/* KPI GRID */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <KPICard 
                            title="Viajes en Curso" 
                            value={metrics.activeRides} 
                            icon="navigation" 
                            color="indigo" 
                            description="Solicitudes activas o viajes con pasajero"
                            alert={metrics.activeRides > 0}
                        />
                        <KPICard 
                            title="Conductores Online" 
                            value={metrics.onlineDrivers} 
                            icon="zap" 
                            color="green" 
                            description={`${metrics.approvedDrivers} conductores aprobados en total`}
                        />
                        <KPICard 
                            title="Retiros Pendientes" 
                            value={metrics.pendingWithdrawals} 
                            icon="banknote" 
                            color="amber" 
                            description="Solicitudes de cobro por procesar"
                            alert={metrics.pendingWithdrawals > 0}
                            link="/admin/withdrawals"
                        />
                        <KPICard 
                            title="Control de Conductores" 
                            value={metrics.pendingDrivers} 
                            icon="users" 
                            color="blue" 
                            description="Nuevos registros esperando aprobación"
                            alert={metrics.pendingDrivers > 0}
                            link="/admin/drivers"
                        />
                        <KPICard 
                            title="Viajes Hoy" 
                            value={metrics.recentCompletedRides} 
                            icon="check-circle" 
                            color="emerald" 
                            description={`Completados desde las 00:00 hs`}
                        />
                        <KPICard 
                            title="Estado del Sistema" 
                            value="Activo" 
                            icon="shield-check" 
                            color="zinc" 
                            description="Todos los servicios operativos"
                        />
                    </div>

                    {/* QUICK ACTIONS / ALERTS AREA */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle className="text-lg">Acciones Pendientes</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {metrics.pendingDrivers > 0 && (
                                    <Link href="/admin/drivers" className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all group">
                                        <div className="flex items-center gap-3">
                                            <VamoIcon name="users" className="text-blue-500" />
                                            <span className="font-medium">Aprobar {metrics.pendingDrivers} nuevos conductores</span>
                                        </div>
                                        <VamoIcon name="chevron-right" className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                )}
                                {metrics.pendingWithdrawals > 0 && (
                                    <Link href="/admin/withdrawals" className="flex items-center justify-between p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all group">
                                        <div className="flex items-center gap-3">
                                            <VamoIcon name="banknote" className="text-amber-500" />
                                            <span className="font-medium">Procesar {metrics.pendingWithdrawals} pagos</span>
                                        </div>
                                        <VamoIcon name="chevron-right" className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                )}
                                {metrics.pendingDrivers === 0 && metrics.pendingWithdrawals === 0 && (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground italic">
                                        <VamoIcon name="check-circle" className="h-8 w-8 mb-2 opacity-20" />
                                        <p>No hay tareas críticas pendientes.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle className="text-lg">Salud de Red</CardTitle>
                                <CardDescription>Drivers vs Demanda</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center justify-center py-6">
                                <div className="text-4xl font-black mb-2 flex items-center gap-2">
                                    {metrics.onlineDrivers} <span className="text-zinc-600">/</span> {metrics.activeRides}
                                </div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Conductores / Viajes Activos</p>
                                
                                <div className="mt-8 w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className={cn(
                                            "h-full transition-all duration-1000",
                                            metrics.onlineDrivers >= metrics.activeRides ? "bg-green-500" : "bg-red-500"
                                        )}
                                        style={{ width: `${Math.min(100, (metrics.onlineDrivers / (metrics.activeRides || 1)) * 100)}%` }}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            {/* ── DEV TOOLS — solo visible en desarrollo ────────────────────── */}
            {isDev && (
                <div className="mt-4 rounded-2xl border border-dashed border-indigo-500/20 bg-indigo-500/[0.03] p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500/60 mb-3">🛠 Dev Tools — VamoMuni</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            disabled={devBusy}
                            onClick={async () => {
                                setDevBusy(true);
                                try {
                                    const { makeCurrentUserMunicipal } = await import('@/lib/dev/createMunicipalUser');
                                    await makeCurrentUserMunicipal('Rawson', 'rawson');
                                    toast({ title: '✅ Convertido en admin_municipal', description: 'Role: admin_municipal · Ciudad: Rawson · Recargá la página y andá a /municipal/login' });
                                } catch (e: any) {
                                    toast({ variant: 'destructive', title: 'Error', description: e.message });
                                } finally {
                                    setDevBusy(false);
                                }
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 rounded-xl transition-all disabled:opacity-50"
                        >
                            <VamoIcon name="landmark" className="h-3.5 w-3.5" />
                            {devBusy ? 'Convirtiendo...' : 'Convertirme en municipal (dev)'}
                        </button>
                        <Link href="/municipal/login">
                            <button className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded-xl transition-all">
                                <VamoIcon name="arrow-right" className="h-3.5 w-3.5" />
                                Ir a /municipal/login
                            </button>
                        </Link>
                    </div>
                    <p className="text-[10px] text-zinc-700 mt-2">Este panel NO aparece en producción (NODE_ENV !== 'development')</p>
                </div>
            )}
        </div>
    );
}

// KPICard refactorizado: Sin componentes anidados definidos internamente.
function KPICard({ title, value, icon, color, description, alert, link }: any) {
    const colorMap: Record<string, string> = {
        blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        amber: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        green: "text-green-500 bg-green-500/10 border-green-500/20",
        indigo: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
        emerald: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        zinc: "text-zinc-500 bg-zinc-500/10 border-zinc-800",
    };

    const cardContent = (
        <Card className={cn(
            "relative overflow-hidden border-zinc-800 bg-black/40 backdrop-blur-xl transition-all",
            link && "hover:border-zinc-700",
            alert && "border-l-4 border-l-primary"
        )}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div className={cn("p-2 rounded-xl border", colorMap[color] || colorMap.zinc)}>
                        <VamoIcon name={icon} className="h-5 w-5" />
                    </div>
                    {alert && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 animate-pulse">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span className="text-[10px] font-black text-primary uppercase tracking-tighter">Prioridad</span>
                        </div>
                    )}
                </div>
                <CardTitle className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] pt-4">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-black text-white py-1">{value}</div>
                {description && <p className="text-xs text-zinc-500 font-medium leading-tight">{description}</p>}
            </CardContent>
        </Card>
    );

    if (link) {
        return (
            <Link href={link}>
                {cardContent}
            </Link>
        );
    }

    return cardContent;
}
