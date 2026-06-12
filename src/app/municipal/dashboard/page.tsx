'use client';

import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getCountFromServer, doc, setDoc, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import { MunicipalProfile, MunicipalExpressStatus, normalizeCityKey } from '@/lib/types';
import Link from 'next/link';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useSearchParams } from 'next/navigation';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isExpired(ts: any): boolean {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.getTime() < Date.now();
}

function isExpiredOrMissing(ts: any): boolean {
    if (!ts) return true;
    return isExpired(ts);
}

const BLOCKED_STATUSES: MunicipalExpressStatus[] = [
    'suspended_expired_license',
    'suspended_expired_insurance',
    'suspended_unpaid_canon',
    'suspended_by_municipality',
];

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, href }: { label: string; value: string | number; icon: string; color: string; href?: string }) {
    const searchParams = useSearchParams();
    const isDemo = searchParams.get('demo') === 'true';

    const finalHref = href ? (isDemo ? `${href}${href.includes('?') ? '&' : '?'}demo=true` : href) : undefined;

    const colorClasses: Record<string, string> = {
        amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        red: 'bg-red-500/10 border-red-500/20 text-red-400',
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
        zinc: 'bg-zinc-500/10 border-white/5 text-zinc-400',
    };

    const innerContent = (
        <div className={cn(
            "bg-white/5 border border-white/10 p-6 rounded-[2.5rem] relative overflow-hidden transition-all duration-300 group",
            href ? "cursor-pointer hover:bg-white/10 hover:scale-105 hover:shadow-[0_0_20px_rgba(29,124,255,0.15)] active:scale-95" : "hover:bg-white/10"
        )}>
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
                <VamoIcon name={icon as any} className="w-20 h-20" />
            </div>
            
            <div className="flex justify-between items-start mb-4">
                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110", colorClasses[color].split(' ')[0])}>
                    <VamoIcon name={icon as any} className={cn("h-5 w-5", colorClasses[color].split(' ').pop())} />
                </div>
            </div>

            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={cn(
                "text-3xl font-black italic tracking-tighter truncate",
                typeof value === 'string' && value.includes('$') ? 'text-white' : 'text-white'
            )}>{value}</p>
        </div>
    );

    if (finalHref) {
        return <Link href={finalHref} className="block">{innerContent}</Link>;
    }
    return innerContent;
}

// ─── First Steps Banner ───────────────────────────────────────────────────────
function FirstStepsBanner() {
    return (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-[2rem] p-8 mb-8 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
            <div className="flex-1 space-y-4 relative z-10">
                <div className="flex items-center gap-3 mb-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                    </span>
                    <span className="text-indigo-400 font-bold text-sm tracking-widest uppercase">Primeros Pasos</span>
                </div>
                <h3 className="text-3xl font-black italic text-white uppercase tracking-tighter">¡Te damos la bienvenida a VamO Muni!</h3>
                <p className="text-zinc-400 font-medium max-w-2xl text-lg">Tu panel de control está listo. Para empezar a operar en tu localidad, te sugerimos seguir estos pasos iniciales:</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-4">
                    <Link href="/municipal/team" className="block bg-black/40 border border-white/5 p-5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all group hover:-translate-y-1">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all">
                                <VamoIcon name="users" className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-white text-base">1. Crear Equipo</span>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">Añade a los operadores, auditores o tesoreros para que accedan con sus propias cuentas y permisos.</p>
                    </Link>

                    <Link href="/municipal/pricing" className="block bg-black/40 border border-white/5 p-5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all group hover:-translate-y-1">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                                <VamoIcon name="calculator" className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-white text-base">2. Ajustar Tarifas</span>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">Configura la bajada de bandera, valor de la ficha, tiempo de espera y esquema de comisiones para tu ciudad.</p>
                    </Link>

                    <Link href="/municipal/settings/config" className="block bg-black/40 border border-white/5 p-5 rounded-2xl hover:bg-white/10 hover:border-white/10 transition-all group hover:-translate-y-1">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all">
                                <VamoIcon name="settings" className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-white text-base">3. Configuraciones Generales</span>
                        </div>
                        <p className="text-sm text-zinc-500 leading-relaxed">Personaliza los parámetros operativos locales, los textos legales, y las opciones de despacho de paradas.</p>
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MunicipalDashboardPage() {
    const { cityKey, cityName, loading: contextLoading } = useMunicipalContext();
    
    const [stats, setStats] = useState<any>(null);
    const [recentPending, setRecentPending] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [quickSearch, setQuickSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [copiedLink, setCopiedLink] = useState('');

    const handleCopy = (type: 'passenger' | 'driver') => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://vamoapp.com.ar';
        const path = type === 'passenger' ? '/pasajero/onboarding' : '/driver/register';
        const url = `${baseUrl}${path}?city=${cityKey}`;
        navigator.clipboard.writeText(url);
        setCopiedLink(type);
        setTimeout(() => setCopiedLink(''), 2000);
    };

    // Paradas Digitales live states
    const [stationStats, setStationStats] = useState({
        totalRadio: 0,
        assignedByOperator: 0,
        releasedTimeout: 0,
        reassignedCount: 0
    });
    const [stationLogs, setStationLogs] = useState<any[]>([]);

    const db = useFirestore();

    // Listen to Paradas Digitales data in real-time
    useEffect(() => {
        if (!db || !cityKey) return;

        console.log("[STATION_DISPATCH_REALTIME_LISTEN] Subscribing for city:", cityKey);

        // 1. Live rides listener for KPIs
        const qRides = query(
            collection(db, 'rides'),
            where('cityKey', '==', cityKey),
            where('stationDispatch', '==', true)
        );

        const unsubscribeRides = onSnapshot(qRides, (snapshot) => {
            let totalRadio = 0;
            let assignedByOperator = 0;
            let releasedTimeout = 0;
            let reassignedCount = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                totalRadio++;
                
                const status = data.stationDispatchStatus;
                if (status === 'assigned_to_driver' || status === 'accepted_by_driver') {
                    assignedByOperator++;
                } else if (data.stationReleasedToGeneralMatching === true && data.stationReleaseReason === 'operator_timeout') {
                    releasedTimeout++;
                }

                if (data.stationReassignmentAttempts > 0) {
                    reassignedCount += data.stationReassignmentAttempts;
                }
            });

            setStationStats({
                totalRadio,
                assignedByOperator,
                releasedTimeout,
                reassignedCount
            });
        }, (err) => {
            console.error("Error listening to station rides:", err);
        });

        // 2. Live dispatch logs listener (sorted in-memory to bypass index requirement)
        const qLogs = query(
            collection(db, 'station_dispatch_logs'),
            where('cityKey', '==', cityKey)
        );

        const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
            const logs: any[] = [];
            snapshot.forEach(doc => {
                logs.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort by timestamp desc in-memory
            logs.sort((a, b) => {
                const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
                const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
                return tB - tA;
            });
            
            setStationLogs(logs.slice(0, 15));
        }, (err) => {
            console.error("Error listening to station logs:", err);
        });

        return () => {
            unsubscribeRides();
            unsubscribeLogs();
        };
    }, [db, cityKey]);

    const fetchDashboard = async (isSilent = false) => {
        if (!cityKey) return;
        if (!isSilent) setLoading(true);
        try {
            const fns = getFunctions(undefined, 'us-central1');
            const statsFn = httpsCallable(fns, 'getMunicipalDashboardStatsV1');
            const result = await statsFn({ cityKey });
            const data = result.data as any;
            
            setStats(data);
            setRecentPending(data.recentPending || []);
        } catch (e) {
            console.error('Error fetching dashboard stats:', e);
        } finally {
            if (!isSilent) setLoading(false);
        }
    };

    useEffect(() => {
        if (cityKey) {
            fetchDashboard(false);
            const interval = setInterval(() => {
                fetchDashboard(true);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [cityKey]);

    // Búsqueda Global en Backend
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (quickSearch.trim().length >= 2) {
                setSearching(true);
                try {
                    const fns = getFunctions(undefined, 'us-central1');
                    const searchFn = httpsCallable(fns, 'listMunicipalDriversV1');
                    const result = await searchFn({
                        cityKey,
                        query: quickSearch,
                        limit: 5
                    });
                    setSearchResults((result.data as any).drivers || []);
                } catch (e) {
                    console.error('Error in search:', e);
                } finally {
                    setSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [quickSearch, cityKey]);

    const [totalPassengers, setTotalPassengers] = useState<number>(0);
    const [onlinePassengers, setOnlinePassengers] = useState<number>(0);
    const [metricsLoading, setMetricsLoading] = useState(true);
    const [indexError, setIndexError] = useState(false);



    useEffect(() => {
        if (!db || !cityKey) return;

        console.log("[PASSENGER_METRICS_FETCH_START] City:", cityKey);
        
        const fetchMetrics = async () => {
            if (!db || !cityKey) return;
            
            try {
                // Query Total Passengers (Count Only - Cheap)
                const qTotal = query(
                    collection(db, 'users'),
                    where('role', '==', 'passenger'),
                    where('cityKey', '==', cityKey)
                );
                const totalSnap = await getCountFromServer(qTotal);
                setTotalPassengers(totalSnap.data().count);

                // Query Online Passengers (Active in last 2 mins)
                const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
                const qOnline = query(
                    collection(db, 'users'),
                    where('role', '==', 'passenger'),
                    where('cityKey', '==', cityKey),
                    where('isOnline', '==', true),
                    where('lastActiveAt', '>=', twoMinsAgo)
                );
                const onlineSnap = await getCountFromServer(qOnline);
                setOnlinePassengers(onlineSnap.data().count);
                
                setMetricsLoading(false);
                setIndexError(false);
                console.log("[PASSENGER_METRICS_INDEX_READY]");
            } catch (err: any) {
                if (err.message?.includes('index')) {
                    console.error("[PASSENGER_METRICS_INDEX_MISSING]");
                    setIndexError(true);
                } else {
                    console.error("[PASSENGER_METRICS_ERROR]", err);
                }
                setMetricsLoading(false);
            }
        };

        fetchMetrics();
        // Refresh every 2 minutes instead of onSnapshot (Cost Optimized)
        const interval = setInterval(fetchMetrics, 120000);
        return () => clearInterval(interval);
    }, [db, cityKey]);

    if (loading) return (
        <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
        </div>
    );

    // ── Métricas ───────────────────────────────────────────────────────────────
    // ── Métricas ───────────────────────────────────────────────────────────────
    const total       = stats?.total || 0;
    const pending     = stats?.pending || 0;
    const active      = stats?.active || 0;
    const suspended   = stats?.suspended || 0;
    const expired     = stats?.expired || 0; // Skipped for now
    const municipalParticipation = stats?.cityData?.stats?.totalMunicipalCommission || stats?.cityData?.stats?.totalMunicipalContribution || 0;

    const handleQuickSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuickSearch(e.target.value);
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-12">
                <span className="text-[#1D7CFF] font-black uppercase tracking-[0.3em] text-[10px]">Portal de Control Municipal</span>
                <h1 className="text-5xl font-black text-white mt-2 uppercase italic tracking-tighter leading-none">Dashboard <span className="text-[#1D7CFF]">{cityName}</span></h1>
                <p className="text-zinc-500 text-xs mt-4 uppercase font-black tracking-widest">
                    {total} Conductor{total !== 1 ? 'es' : ''} Express registrado{total !== 1 ? 's' : ''} en sistema
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-4 mb-6">
                <KpiCard 
                    label="Pasajeros Registrados" 
                    value={indexError ? "Calculando..." : totalPassengers} 
                    icon="users" 
                    color="indigo" 
                />
                <KpiCard 
                    label="Pasajeros Online Ahora" 
                    value={indexError ? "Calculando..." : onlinePassengers} 
                    icon="zap" 
                    color="emerald" 
                />
                <KpiCard 
                    label="Viajes Totales (Hoy)" 
                    value={stats?.cityData?.stats?.totalRidesToday || 0} 
                    icon="car" 
                    color="blue" 
                />
                <KpiCard 
                    label="Recaudación Ciudad" 
                    value={`$${(stats?.cityData?.stats?.totalCityRevenue || 0).toLocaleString('es-AR')}`} 
                    icon="trending-up" 
                    color="emerald" 
                />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
                <KpiCard label="Pendientes"    value={pending}   icon="clock"          color="amber"   href="/municipal/drivers?filter=pending" />
                <KpiCard label="Habilitados"   value={active}    icon="check-circle"   color="emerald" href="/municipal/drivers?filter=active" />
                <KpiCard label="Suspendidos"   value={suspended} icon="shield-off"     color="red"     href="/municipal/drivers?filter=suspended" />
                <KpiCard label="Vencidos"      value={expired}   icon="calendar"       color="red"     href="/municipal/vencimientos" />
                {/* <KpiCard label="Canon pte."    value={canonPend} icon="receipt"        color="amber"   /> */}
                <KpiCard 
                    label={`Participación Municipal (${cityKey === 'rawson' ? '5%' : '2%'})`} 
                    value={`$${municipalParticipation.toLocaleString('es-AR')}`} 
                    icon="coins" 
                    color="indigo" 
                    href="/municipal/treasury"
                />
                <KpiCard label="Total express" value={total}     icon="users"          color="zinc"    href="/municipal/drivers?filter=express" />
            </div>

            {total === 0 && (
                <div className="mt-8">
                    <FirstStepsBanner />
                </div>
            )}

            {/* Buscador Rápido */}
            <div className="relative">
                <VamoIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                <Input
                    placeholder={`Búsqueda rápida por código o nombre (Ej: ${cityKey?.substring(0, 3).toUpperCase()}-EXP-000001)`}
                    value={quickSearch}
                    onChange={handleQuickSearchChange}
                    className="h-14 pl-12 rounded-2xl bg-white/[0.05] border-white/10 text-white placeholder:text-zinc-300 font-medium text-lg shadow-inner"
                />
                
                {quickSearch.trim().length >= 2 && (
                    <div className="absolute top-full mt-2 w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-20">
                        {searching ? (
                            <div className="px-5 py-4 text-sm text-zinc-500 flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
                                Buscando...
                            </div>
                        ) : searchResults.length > 0 ? (
                            searchResults.map(d => (
                                <Link key={d.driverId} href={`/municipal/drivers/${d.driverId}`}>
                                    <div className="px-5 py-3 hover:bg-white/[0.05] flex items-center justify-between border-b border-white/5 last:border-0 cursor-pointer transition-colors">
                                        <div>
                                            <p className="text-sm font-bold text-white">{d.driverName ?? 'Sin Nombre'}</p>
                                            <p className="text-xs text-indigo-400 font-mono mt-0.5">{d.municipalCode}</p>
                                        </div>
                                        <VamoIcon name="chevron-right" className="h-4 w-4 text-zinc-600" />
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="px-5 py-4 text-sm text-zinc-500 italic">
                                No se encontraron conductores.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Enlaces de Registro Municipales */}
            <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-500">Enlaces Exclusivos de Registro</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-3xl p-6 relative overflow-hidden">
                        <VamoIcon name="user-plus" className="absolute -right-4 -bottom-4 w-24 h-24 text-indigo-500/10" />
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                                <VamoIcon name="user" className="w-5 h-5 text-indigo-400" />
                            </div>
                            <button 
                                onClick={() => handleCopy('passenger')}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                                    copiedLink === 'passenger' ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                                )}
                            >
                                {copiedLink === 'passenger' ? 'Copiado!' : 'Copiar Link'}
                            </button>
                        </div>
                        <h4 className="text-lg font-black text-white italic uppercase">Nuevos Pasajeros</h4>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold mt-1 max-w-[80%]">Enlace preconfigurado para asignar usuarios a {cityName}</p>
                    </div>

                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-3xl p-6 relative overflow-hidden">
                        <VamoIcon name="car" className="absolute -right-4 -bottom-4 w-24 h-24 text-amber-500/10" />
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                <VamoIcon name="car" className="w-5 h-5 text-amber-400" />
                            </div>
                            <button 
                                onClick={() => handleCopy('driver')}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                                    copiedLink === 'driver' ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                                )}
                            >
                                {copiedLink === 'driver' ? 'Copiado!' : 'Copiar Link'}
                            </button>
                        </div>
                        <h4 className="text-lg font-black text-white italic uppercase">Nuevos Conductores</h4>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold mt-1 max-w-[80%]">Enlace preconfigurado para asignar choferes a {cityName}</p>
                    </div>
                </div>
            </div>

            {/* 🚏 Paradas Digitales Panel */}
            <div className="space-y-6 bg-gradient-to-br from-indigo-950/20 via-zinc-900/40 to-zinc-900/10 border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl -z-10" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-emerald-400 font-black uppercase tracking-[0.25em] text-[10px]">MONITOR OPERATIVO EN VIVO</span>
                        </div>
                        <h2 className="text-2xl font-black text-white italic uppercase tracking-tight mt-1">Paradas Digitales VamO</h2>
                        <p className="text-zinc-500 text-xs mt-1">Prioridad de matching y control en tiempo real dentro del radio de 500m</p>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-5 hover:bg-white/[0.04] transition-all duration-300">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Viajes Generados en Radio</p>
                        <p className="text-3xl font-black text-white italic tracking-tighter mt-2">{stationStats.totalRadio}</p>
                        <p className="text-[9px] text-zinc-600 uppercase font-bold mt-1">Total dentro de 500m</p>
                    </div>
                    <div className="bg-emerald-500/[0.02] border border-emerald-500/10 rounded-3xl p-5 hover:bg-emerald-500/[0.04] transition-all duration-300">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Asignados por Operador</p>
                        <p className="text-3xl font-black text-emerald-400 italic tracking-tighter mt-2">{stationStats.assignedByOperator}</p>
                        <p className="text-[9px] text-emerald-600/70 uppercase font-bold mt-1">Despachados con éxito</p>
                    </div>
                    <div className="bg-amber-500/[0.02] border border-amber-500/10 rounded-3xl p-5 hover:bg-amber-500/[0.04] transition-all duration-300">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Liberados por Timeout</p>
                        <p className="text-3xl font-black text-amber-400 italic tracking-tighter mt-2">{stationStats.releasedTimeout}</p>
                        <p className="text-[9px] text-amber-600/70 uppercase font-bold mt-1">Liberados a matching general</p>
                    </div>
                    <div className="bg-blue-500/[0.02] border border-blue-500/10 rounded-3xl p-5 hover:bg-blue-500/[0.04] transition-all duration-300">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Reasignados</p>
                        <p className="text-3xl font-black text-blue-400 italic tracking-tighter mt-2">{stationStats.reassignedCount}</p>
                        <p className="text-[9px] text-blue-600/70 uppercase font-bold mt-1">Intentos de reasignación</p>
                    </div>
                </div>

                {/* Timeline Logs */}
                <div className="mt-8">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                        <VamoIcon name="activity" className="h-4 w-4 text-indigo-400" />
                        Registro de Trazabilidad en Tiempo Real
                    </h3>
                    
                    {stationLogs.length === 0 ? (
                        <div className="bg-white/[0.01] border border-white/5 rounded-3xl p-8 text-center text-zinc-600 text-sm italic">
                            No hay actividad reciente en las paradas de la ciudad.
                        </div>
                    ) : (
                        <div className="bg-black/20 border border-white/5 rounded-[2rem] overflow-hidden max-h-[300px] overflow-y-auto divide-y divide-white/5 font-mono text-xs text-zinc-300">
                            {stationLogs.map((log) => {
                                const actionColors: Record<string, string> = {
                                    'assigned_to_driver': 'text-emerald-400',
                                    'driver_accepted': 'text-emerald-500 font-bold',
                                    'released_to_general_matching': 'text-amber-400',
                                    'pending_reassignment': 'text-indigo-400',
                                };
                                const indicatorColors: Record<string, string> = {
                                    'assigned_to_driver': 'bg-emerald-400',
                                    'driver_accepted': 'bg-emerald-500 animate-pulse',
                                    'released_to_general_matching': 'bg-amber-400',
                                    'pending_reassignment': 'bg-indigo-400',
                                };
                                const colorClass = actionColors[log.action] || 'text-zinc-400';
                                const indicatorClass = indicatorColors[log.action] || 'bg-zinc-500';
                                const timeStr = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('es-AR') : new Date(log.timestamp).toLocaleTimeString('es-AR');
                                
                                return (
                                    <div key={log.id} className="p-4 hover:bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-2 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={cn("w-2 h-2 rounded-full", indicatorClass)} />
                                            <span className="text-[10px] text-zinc-500 font-bold">{timeStr}</span>
                                            <span className={cn("font-bold uppercase text-[10px]", colorClass)}>{log.action?.replace(/_/g, ' ')}</span>
                                            <span className="text-zinc-400">{log.details}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 self-end md:self-auto">
                                            {log.rideId && <span>Viaje: <span className="text-zinc-400">...{log.rideId.slice(-6)}</span></span>}
                                            {log.driverId && <span>Móvil: <span className="text-zinc-400">...{log.driverId.slice(-6)}</span></span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Pendientes recientes */}
            {recentPending.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">Pendientes de revisión</h2>
                        <Link href="/municipal/drivers?status=pending" className="text-xs text-indigo-400 hover:text-indigo-300 font-bold">
                            Ver todos →
                        </Link>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
                        {recentPending.map(d => (
                            <div key={d.driverId} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{d.driverName ?? '—'}</p>
                                    <p className="text-[10px] text-zinc-500 font-mono">{d.municipalCode}</p>
                                </div>
                                <div className={cn(
                                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                    d.municipalStatus === 'renewal_under_review' ? 'bg-indigo-500/10 text-indigo-400' :
                                    d.municipalStatus === 'municipal_observed' ? 'bg-orange-500/10 text-orange-400' :
                                    'bg-amber-500/10 text-amber-400'
                                )}>
                                    {d.municipalStatus === 'renewal_under_review' ? 'Renovación' : 
                                     d.municipalStatus === 'municipal_observed' ? 'Observado' : 'Pendiente'}
                                </div>
                                <Link href={`/municipal/drivers/${d.driverId}`}>
                                    <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded-lg hover:bg-indigo-500/10 transition-colors">
                                        Ver →
                                    </button>
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {total === 0 && !loading && (
                <div className="py-20 text-center space-y-3">
                    <VamoIcon name="users" className="h-12 w-12 mx-auto text-zinc-700" />
                    <p className="text-zinc-500">No hay conductores express registrados en {cityName}.</p>
                </div>
            )}
        </div>
    );
}
