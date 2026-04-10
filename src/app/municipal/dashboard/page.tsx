'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { MunicipalProfile, MunicipalExpressStatus, normalizeCityKey } from '@/lib/types';
import Link from 'next/link';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { isDriverReadyForReview } from '@/lib/eligibility';

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
function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
    return (
        <div className={cn(
            'rounded-2xl border p-4 space-y-3 bg-white/[0.02]',
            color === 'amber'  ? 'border-amber-500/20'
            : color === 'emerald' ? 'border-emerald-500/20'
            : color === 'red'     ? 'border-red-500/20'
            : color === 'blue'    ? 'border-blue-500/20'
                                  : 'border-white/5'
        )}>
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
                <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center',
                    color === 'amber'   ? 'bg-amber-500/10'
                    : color === 'emerald' ? 'bg-emerald-500/10'
                    : color === 'red'     ? 'bg-red-500/10'
                    : color === 'blue'    ? 'bg-blue-500/10'
                                          : 'bg-zinc-500/10'
                )}>
                    <VamoIcon name={icon as any} className={cn(
                        'h-4 w-4',
                        color === 'amber'   ? 'text-amber-400'
                        : color === 'emerald' ? 'text-emerald-400'
                        : color === 'red'     ? 'text-red-400'
                        : color === 'blue'    ? 'text-blue-400'
                                              : 'text-zinc-500'
                    )} />
                </div>
            </div>
            <p className="text-3xl font-black text-white">{value}</p>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MunicipalDashboardPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const [drivers, setDrivers]   = useState<MunicipalProfile[]>([]);
    const [loading, setLoading]   = useState(true);
    const [quickSearch, setQuickSearch] = useState('');

    const cityKey = profile?.city ? normalizeCityKey(profile.city) : null;

    useEffect(() => {
        if (!firestore || !cityKey) return;
        const q = query(
            collection(firestore, 'municipal_profiles'),
            where('cityKey', '==', cityKey)
        );
        getDocs(q).then(snap => {
            const fetched = snap.docs.map(d => ({ ...d.data(), driverId: d.id } as MunicipalProfile));
            fetched.sort((a, b) => {
                const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return tb - ta;
            });
            setDrivers(fetched);
            setLoading(false);
        }).catch((e) => {
            console.error('Error fetching municipal dashboard:', e);
            setLoading(false);
        });
    }, [firestore, cityKey]);

    if (loading) return (
        <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
        </div>
    );

    // ── Métricas ───────────────────────────────────────────────────────────────
    const total       = drivers.length;
    const pending     = drivers.filter(isDriverReadyForReview).length;
    const active      = drivers.filter(d => d.municipalStatus === 'active').length;
    const suspended   = drivers.filter(d => BLOCKED_STATUSES.includes(d.municipalStatus)).length;
    const expired     = drivers.filter(d => 
        isExpired(d.licenseExpiry) || 
        isExpired(d.insuranceExpiry) || 
        isExpired(d.backgroundCheckExpiry) || 
        isExpired(d.canonExpiry)
    ).length;
    const canonPend   = drivers.filter(d => d.canonStatus !== 'paid' || isExpired(d.canonExpiry)).length;

    const recentPending = drivers
        .filter(isDriverReadyForReview)
        .slice(0, 5);

    const handleQuickSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        const prefixStr = cityKey ? cityKey.substring(0, 3).toUpperCase() : '';
        
        if (prefixStr) {
            // Si parece que están intentando escribir el código sin guiones (ej. RAWEXP12)
            const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const targetClean = prefixStr + 'EXP';
            
            if (clean.startsWith(targetClean)) {
                const nums = clean.substring(targetClean.length);
                val = `${prefixStr}-EXP-${nums}`;
            }
        }
        setQuickSearch(val);
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black text-white">Dashboard Municipal</h1>
                <p className="text-zinc-500 text-sm mt-1">
                    Municipalidad de <span className="text-indigo-400 font-bold">{profile?.city}</span> · {total} conductor{total !== 1 ? 'es' : ''} express registrado{total !== 1 ? 's' : ''}
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard label="Pendientes"    value={pending}   icon="clock"          color="amber"   />
                <KpiCard label="Habilitados"   value={active}    icon="check-circle"   color="emerald" />
                <KpiCard label="Suspendidos"   value={suspended} icon="shield-off"     color="red"     />
                <KpiCard label="Vencidos"      value={expired}   icon="calendar"       color="red"     />
                <KpiCard label="Canon pte."    value={canonPend} icon="receipt"        color="amber"   />
                <KpiCard label="Total express" value={total}     icon="users"          color="zinc"    />
            </div>

            {/* Buscador Rápido */}
            <div className="relative">
                <VamoIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                <Input
                    placeholder="Búsqueda rápida por código o nombre (Ej: RAW-EXP-000001)"
                    value={quickSearch}
                    onChange={handleQuickSearchChange}
                    className="h-14 pl-12 rounded-2xl bg-white/[0.05] border-white/10 text-white placeholder:text-zinc-300 font-medium text-lg shadow-inner"
                />
                
                {quickSearch.trim().length > 2 && (
                    <div className="absolute top-full mt-2 w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden z-20">
                        {drivers.filter(d => {
                            const qClean = quickSearch.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const codeClean = (d.municipalCode ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
                            return codeClean.includes(qClean) || (d.driverName ?? '').toLowerCase().includes(quickSearch.toLowerCase());
                        }).slice(0, 5).map(d => (
                            <Link key={d.driverId} href={`/municipal/drivers/${d.driverId}`}>
                                <div className="px-5 py-3 hover:bg-white/[0.05] flex items-center justify-between border-b border-white/5 last:border-0 cursor-pointer transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-white">{d.driverName ?? 'Sin Nombre'}</p>
                                        <p className="text-xs text-indigo-400 font-mono mt-0.5">{d.municipalCode}</p>
                                    </div>
                                    <VamoIcon name="chevron-right" className="h-4 w-4 text-zinc-600" />
                                </div>
                            </Link>
                        ))}
                        {drivers.filter(d => 
                            (d.municipalCode ?? '').toLowerCase().includes(quickSearch.toLowerCase()) ||
                            (d.driverName ?? '').toLowerCase().includes(quickSearch.toLowerCase())
                        ).length === 0 && (
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
                    <p className="text-zinc-500">No hay conductores express registrados en {profile?.city}.</p>
                </div>
            )}
        </div>
    );
}
