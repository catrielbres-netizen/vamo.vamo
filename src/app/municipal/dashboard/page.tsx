'use client';

import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getCountFromServer, doc, setDoc } from 'firebase/firestore';
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

    const fetchDashboard = async () => {
        if (!cityKey) return;
        setLoading(true);
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
            setLoading(false);
        }
    };

    useEffect(() => {
        if (cityKey) {
            fetchDashboard();
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

    const db = useFirestore();

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
    const municipalParticipation = stats?.cityData?.stats?.totalMunicipalContribution || 0;

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
