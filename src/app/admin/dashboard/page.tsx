'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
    collection, 
    query, 
    where, 
    getCountFromServer, 
    getDocs,
    Timestamp,
    QueryConstraint
} from 'firebase/firestore';
import { useFirestore, useUser, useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { isDriverReadyForReview } from '@/lib/eligibility';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Badge } from '@/components/ui/badge';
import { SystemAlerts } from '@/components/admin/SystemAlerts';

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
    const [hasIndexError, setHasIndexError] = useState(false);
    const [metrics, setMetrics] = useState({
        pendingDrivers: 0,
        approvedDrivers: 0,
        onlineDrivers: 0,
        totalPassengers: 0,
        onlinePassengers: 0,
        pendingWithdrawals: 0,
        activeRides: 0,
        recentCompletedRides: 0,
        newFapClaims: 0,
        pendingFapClaims: 0,
        acceptanceRate: 95,
        cancellationRate: 4,
        totalGmv: 0,
        avgTicket: 0
    });

    const { cityKey: activeCityKey, cityName, loading: loadingContext } = useMunicipalContext();

    // 1. Memoizamos la función de carga para que sea estable
    const fetchMetrics = useCallback(async () => {
        if (!firestore) return;
        setLoading(true);
        setHasIndexError(false);
        console.log("📊 [DASHBOARD] Starting fetchMetrics. City:", activeCityKey);
        try {
            const usersColl = collection(firestore, 'users');
            const withdrawalsColl = collection(firestore, 'withdrawal_requests');
            const ridesColl = collection(firestore, 'rides');

            const isGlobalMode = activeCityKey === 'all' || activeCityKey === '*' || activeCityKey === 'global' || !activeCityKey;

            const baseUserQuery: QueryConstraint[] = [where('role', '==', 'driver')];
            const passengerQuery: QueryConstraint[] = [where('role', '==', 'passenger')];
            const baseRideQuery: QueryConstraint[] = [];
            const baseWithdrawalQuery: QueryConstraint[] = [where('status', '==', 'pending')];

            if (!isGlobalMode) {
                baseUserQuery.push(where('cityKey', '==', activeCityKey));
                passengerQuery.push(where('cityKey', '==', activeCityKey));
                baseRideQuery.push(where('cityKey', '==', activeCityKey));
                baseWithdrawalQuery.push(where('cityKey', '==', activeCityKey));
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTs = Timestamp.fromDate(today);
            
            const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
            const twoMinsAgoTs = Timestamp.fromDate(twoMinsAgo);

            // Helper to fetch a metric safely
            const safeFetch = async (label: string, queryObj: any, isDocs = false) => {
                const logData = {
                    selectedCity: activeCityKey,
                    queryName: label,
                    isGlobalMode,
                    timestamp: new Date().toISOString()
                };

                try {
                    if (isDocs) {
                        const snap = await getDocs(queryObj);
                        console.log(`[ADMIN_DASHBOARD_DATA_DEBUG] OK: ${label}`, { ...logData, resultCount: snap.size });
                        return snap;
                    }
                    const snap = await getCountFromServer(queryObj);
                    const count = snap.data().count;
                    console.log(`[ADMIN_DASHBOARD_DATA_DEBUG] OK: ${label}`, { ...logData, resultCount: count });
                    return count;
                } catch (e: any) {
                    console.error(`[ADMIN_DASHBOARD_DATA_DEBUG] ERROR: ${label}`, { 
                        ...logData, 
                        errorCode: e.code || 'unknown', 
                        errorMessage: e.message 
                    });

                    if (e.message?.includes('index')) {
                        setHasIndexError(true);
                        toast({
                            variant: "destructive",
                            title: `Índice faltante: ${label}`,
                            description: "Es necesario crear un índice compuesto en Firestore para filtrar esta ciudad."
                        });
                    }
                    return isDocs ? { docs: [] } : 0;
                }
            };

            // Execute all queries in parallel but handle failures individually
            const [
                pendingSnap,
                approvedCount,
                onlineCount,
                withdrawalsCount,
                activeRidesCount,
                completedTodayCount,
                fapNuevos,
                fapPendientes,
                totalPass,
                onlinePass,
                ledgerData
            ] = await Promise.all([
                safeFetch('Conductores Pendientes', query(usersColl, ...baseUserQuery, where('approved', '==', false)), true),
                safeFetch('Conductores Aprobados', query(usersColl, ...baseUserQuery, where('approved', '==', true))),
                safeFetch('Conductores Online', query(usersColl, ...baseUserQuery, where('driverStatus', '==', 'online'))),
                safeFetch('Retiros Pendientes', query(withdrawalsColl, ...baseWithdrawalQuery)),
                safeFetch('Viajes Activos', query(ridesColl, ...baseRideQuery, where('status', 'in', ['searching', 'accepted', 'arrived', 'picked_up']))),
                safeFetch('Viajes Hoy', query(ridesColl, ...baseRideQuery, where('status', '==', 'completed'), where('completedAt', '>=', todayTs))),
                safeFetch('FAP Nuevos', query(collection(firestore, 'fap_claims'), where('status', 'in', ['pending', 'reviewing']), where('adminViewedAt', '==', null))),
                safeFetch('FAP Pendientes', query(collection(firestore, 'fap_claims'), where('status', 'in', ['pending', 'reviewing', 'escalated']))),
                (async () => {
                    console.log("[PASSENGER_METRICS_TOTAL_START]");
                    const res = await safeFetch('Pasajeros Registrados', query(usersColl, ...passengerQuery));
                    console.log("[PASSENGER_METRICS_TOTAL_OK]");
                    return res;
                })(),
                (async () => {
                    console.log("[PASSENGER_METRICS_ONLINE_START]");
                    const res = await safeFetch('Pasajeros Online', query(usersColl, ...passengerQuery, where('isOnline', '==', true), where('lastActiveAt', '>=', twoMinsAgoTs)));
                    console.log("[PASSENGER_METRICS_ONLINE_OK]");
                    return res;
                })(),
                (async () => {
                    try {
                        const metricsColl = collection(firestore, 'city_metrics_hourly');
                        const dayId = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
                        
                        let q = query(metricsColl, where('hourId', '>=', `${dayId}-00`), where('hourId', '<=', `${dayId}-23`));
                        if (!isGlobalMode) {
                            q = query(q, where('cityKey', '==', activeCityKey));
                        }
                        
                        const snap = await getDocs(q);
                        let total = 0;
                        let count = 0;
                        snap.docs.forEach(d => {
                            const s = d.data().stats;
                            total += (s.totalGMV || 0);
                            count += (s.completedCount || 0);
                        });
                        console.log(`[ADMIN_DASHBOARD_DATA_DEBUG] OK: LedgerData`, { 
                            selectedCity: activeCityKey, 
                            isGlobalMode, 
                            totalGMV: total, 
                            completedCount: count 
                        });
                        return { total, count };
                    } catch (e: any) {
                        console.error(`[ADMIN_DASHBOARD_DATA_DEBUG] ERROR: LedgerData`, { 
                            selectedCity: activeCityKey, 
                            isGlobalMode, 
                            errorCode: e.code || 'unknown', 
                            errorMessage: e.message 
                        });
                        return { total: 0, count: 0 };
                    }
                })()
            ]);

            console.log("📊 [ADMIN_STATS_QUERY_ALL_DONE]");

            const realPendingCount = pendingSnap && (pendingSnap as any).docs 
                ? (pendingSnap as any).docs.filter((d: any) => d && d.data && isDriverReadyForReview(d.data())).length 
                : 0;

            setMetrics({
                pendingDrivers: realPendingCount,
                approvedDrivers: approvedCount as number,
                onlineDrivers: onlineCount as number,
                totalPassengers: totalPass as number,
                onlinePassengers: onlinePass as number,
                pendingWithdrawals: withdrawalsCount as number,
                activeRides: activeRidesCount as number,
                recentCompletedRides: completedTodayCount as number,
                newFapClaims: fapNuevos as number,
                pendingFapClaims: fapPendientes as number,
                totalGmv: (ledgerData as any).total,
                avgTicket: (ledgerData as any).count > 0 ? (ledgerData as any).total / (ledgerData as any).count : 0,
                acceptanceRate: 94.2, // Simulated for now as matching logs are too deep
                cancellationRate: 3.8
            });
        } catch (error) {
            console.error("Critical error in dashboard:", error);
            toast({
                variant: "destructive",
                title: "Error crítico",
                description: "No se pudieron cargar las métricas del sistema."
            });
        } finally {
            console.log("📊 [DASHBOARD] Fetch finished.");
            setLoading(false);
        }
    }, [firestore, activeCityKey, toast]);

    // 2. Efecto estable para carga inicial
    useEffect(() => {
        const isAuthorized = profile?.role === 'admin' || profile?.role === 'superadmin';
        if (!firestore || !isAuthorized || loadingContext) return;
        
        // Reset metrics on city change
        setMetrics({
            pendingDrivers: 0,
            approvedDrivers: 0,
            onlineDrivers: 0,
            totalPassengers: 0,
            onlinePassengers: 0,
            pendingWithdrawals: 0,
            activeRides: 0,
            recentCompletedRides: 0,
            newFapClaims: 0,
            pendingFapClaims: 0,
            totalGmv: 0,
            avgTicket: 0,
            acceptanceRate: 0,
            cancellationRate: 0
        });

        fetchMetrics();
    }, [firestore, profile?.role, activeCityKey, loadingContext, fetchMetrics]);

    // 3. NO usar early returns que bloqueen hooks posteriores.
    // Usamos renderizado condicional dentro del return principal.

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-3xl font-black">Dashboard Operativo</h1>
                        {activeCityKey && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 uppercase font-black text-[10px] tracking-widest px-3">
                                {cityName}
                            </Badge>
                        )}
                    </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <KPICard 
                            title="Operativo En Vivo" 
                            value={metrics.activeRides} 
                            icon="activity" 
                            color="indigo" 
                            description="Viajes activos en este momento"
                            alert={metrics.activeRides > 0}
                            link="/admin/live-rides"
                        />
                        <KPICard 
                            title="Pasajeros Online" 
                            value={hasIndexError ? "Calculando..." : metrics.onlinePassengers} 
                            icon="zap" 
                            color="emerald" 
                            description="Activos en los últimos 2 min"
                            alert={!hasIndexError && metrics.onlinePassengers > 0}
                        />
                        <KPICard 
                            title="Reclamos FAP" 
                            value={metrics.newFapClaims} 
                            icon="shield-check" 
                            color={metrics.newFapClaims > 0 ? "red" : "blue"} 
                            description={`${metrics.pendingFapClaims} casos totales en curso`}
                            alert={metrics.newFapClaims > 0}
                            link="/admin/claims"
                        />
                        <KPICard 
                            title="Pasajeros Registrados" 
                            value={hasIndexError ? "Calculando..." : metrics.totalPassengers} 
                            icon="users" 
                            color="blue" 
                            description="Total de usuarios pasajeros"
                        />
                        <KPICard 
                            title="GMV Hoy" 
                            value={`$${metrics.totalGmv.toLocaleString()}`} 
                            icon="banknote" 
                            color="emerald" 
                            description={`Ticket promedio: $${Math.round(metrics.avgTicket)}`}
                            link="/admin/ledger"
                        />
                        <KPICard 
                            title="Analíticas VamO" 
                            value="Ver Reportes" 
                            icon="bar-chart-3" 
                            color="indigo" 
                            description="Tendencias, DAU/MAU y Heatmaps"
                            link="/admin/analytics"
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* LEFT: MAIN STATS */}
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <KPICard 
                                title="Conductores Online" 
                                value={metrics.onlineDrivers} 
                                icon="zap" 
                                color="green" 
                                description={`${metrics.approvedDrivers} conductores aprobados`}
                            />
                            <KPICard 
                                title="Altas Pendientes" 
                                value={metrics.pendingDrivers} 
                                icon="users" 
                                color="blue" 
                                description="Esperando revisión de documentos"
                                alert={metrics.pendingDrivers > 0}
                                link="/admin/drivers"
                            />
                            <KPICard 
                                title="Retiros Pendientes" 
                                value={metrics.pendingWithdrawals} 
                                icon="landmark" 
                                color="amber" 
                                description="Conductores solicitando cobro"
                                alert={metrics.pendingWithdrawals > 0}
                                link="/admin/withdrawals"
                            />
                            <KPICard 
                                title="Viajes Hoy" 
                                value={metrics.recentCompletedRides} 
                                icon="check-circle" 
                                color="emerald" 
                                description="Completados con éxito"
                            />
                        </div>

                        {/* RIGHT: HEALTH & ALERTS */}
                        <div className="space-y-6">
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

                            <SystemAlerts cityKey={activeCityKey || undefined} />

                            <Card className="border-red-500/20 bg-red-500/[0.02] backdrop-blur-xl">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2 text-zinc-500">
                                        <VamoIcon name="list" className="h-4 w-4" /> Tareas Operativas
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {metrics.pendingDrivers > 0 && (
                                        <Link href="/admin/drivers" className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-blue-400">
                                            <span className="text-[10px] font-black uppercase">Revisar {metrics.pendingDrivers} Conductores</span>
                                            <VamoIcon name="chevron-right" className="h-3 w-3" />
                                        </Link>
                                    )}
                                    {metrics.pendingWithdrawals > 0 && (
                                        <Link href="/admin/withdrawals" className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all text-amber-500">
                                            <span className="text-[10px] font-black uppercase">Procesar {metrics.pendingWithdrawals} Pagos</span>
                                            <VamoIcon name="chevron-right" className="h-3 w-3" />
                                        </Link>
                                    )}
                                    {metrics.pendingDrivers === 0 && metrics.pendingWithdrawals === 0 && (
                                        <p className="text-xs text-zinc-600 italic text-center py-4">No hay tareas pendientes.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </>
            )}

            {/* ── ADMIN TOOLS ────────────────────── */}
            {(profile?.role === 'admin' || profile?.role === 'superadmin') && (
                <div className="mt-4 rounded-2xl border border-dashed border-rose-500/20 bg-rose-500/[0.03] p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500/60 mb-3">🛠 Admin Tools — Retention Testing</p>
                    <div className="flex flex-col gap-2">
                        <RetentionTestButton />
                    </div>
                </div>
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
        red: "text-red-500 bg-red-500/10 border-red-500/20",
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

function RetentionTestButton() {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [visualBusy, setVisualBusy] = useState(false);
    const [template, setTemplate] = useState('passenger_inactive_reminder');
    const functions = useFunctions();

    const handleTest = async () => {
        if (!confirm("⚠️ ¿Estás seguro de ejecutar la prueba de retención?\n\nEsto evaluará usuarios inactivos y creará un máximo global de 5 correos en mail_queue (redirigidos a test mode si está activo).")) return;
        
        setBusy(true);
        setResult(null);
        try {
            if (!functions) throw new Error("Functions not initialized");
            const testRetentionEmailsV1 = httpsCallable(functions, 'testRetentionEmailsV1');
            const res = await testRetentionEmailsV1();
            setResult(res.data);
        } catch (e: any) {
            setResult({ error: e.message || 'Error desconocido', ...e.details });
        } finally {
            setBusy(false);
        }
    };

    const handleVisualTest = async () => {
        setVisualBusy(true);
        setResult(null);
        try {
            if (!functions) throw new Error("Functions not initialized");
            const sendVisualTestEmailV1 = httpsCallable(functions, 'sendVisualTestEmailV1');
            const res = await sendVisualTestEmailV1({ template });
            setResult(res.data);
        } catch (e: any) {
            setResult({ error: e.message || 'Error desconocido', ...e.details });
        } finally {
            setVisualBusy(false);
        }
    };

    const templates = [
        "passenger_inactive_reminder",
        "driver_inactive_reminder",
        "passenger_how_to_use_vamo",
        "driver_how_to_operate_vamo",
        "passenger_shared_rides_intro",
        "passenger_vamo_pay_intro",
        "driver_wallet_intro"
    ];

    return (
        <div className="space-y-4">
            {/* Logic Test */}
            <div className="space-y-2">
                <button
                    disabled={busy}
                    onClick={handleTest}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/20 rounded-xl transition-all disabled:opacity-50"
                >
                    <VamoIcon name="mail" className="h-3.5 w-3.5" />
                    {busy ? 'Procesando prueba cron...' : 'Probar emails de retención (Lógica real, Max 5)'}
                </button>
                <p className="text-[10px] text-zinc-500">Evalúa inactividad y encola según reglas. Ignora cooldown de 15/30 días si se fuerza, pero respeta prefs.</p>
            </div>

            {/* Visual Test */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-zinc-700"
                    >
                        {templates.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                        disabled={visualBusy}
                        onClick={handleVisualTest}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 rounded-xl transition-all disabled:opacity-50"
                    >
                        <VamoIcon name="mail" className="h-3.5 w-3.5" />
                        {visualBusy ? 'Enviando...' : 'Enviar email visual de prueba'}
                    </button>
                </div>
                <p className="text-[10px] text-zinc-500">Inyecta directo un email de prueba con datos simulados (ignora lógica de usuarios).</p>
            </div>

            {/* Result Log */}
            {result && (
                <div className="text-xs p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono whitespace-pre-wrap mt-4">
                    {JSON.stringify(result, null, 2)}
                </div>
            )}
        </div>
    );
}
