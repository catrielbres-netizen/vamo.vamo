'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { MunicipalProfile, MunicipalExpressStatus, normalizeCityKey } from '@/lib/types';
import Link from 'next/link';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useSearchParams } from 'next/navigation';
import { isDriverReadyForReview } from '@/lib/eligibility';

// ─── Types & Helpers ──────────────────────────────────────────────────────────
type FilterStatus = 'all' | 'pending' | 'active' | 'suspended' | 'expired';

function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function checklistProgress(mp: MunicipalProfile): { approved: number; total: number } {
    if (!mp.checklist) return { approved: 0, total: 7 };
    const keys = Object.keys(mp.checklist) as (keyof typeof mp.checklist)[];
    return {
        approved: keys.filter(k => mp.checklist[k]?.status === 'approved').length,
        total: keys.length,
    };
}

const STATUS_FILTER_MAP: Record<FilterStatus, MunicipalExpressStatus[]> = {
    all:      [],
    pending:  ['pending_municipal_review', 'municipal_observed', 'renewal_under_review'],
    active:   ['active', 'municipal_approved'],
    suspended:['suspended_expired_license','suspended_expired_insurance','suspended_unpaid_canon','suspended_by_municipality','rejected_by_municipality'],
    expired:  [], // Filtering logic in useMemo
};

function StatusBadge({ status }: { status: MunicipalExpressStatus }) {
    const map: Partial<Record<MunicipalExpressStatus, { label: string; color: string }>> = {
        pending_municipal_review: { label: 'Pendiente',   color: 'bg-amber-500/10 text-amber-400' },
        municipal_observed:       { label: 'Observado',   color: 'bg-orange-500/10 text-orange-400' },
        municipal_approved:       { label: 'En proceso',  color: 'bg-blue-500/10 text-blue-400' },
        active:                   { label: 'Habilitado',  color: 'bg-emerald-500/10 text-emerald-400' },
        renewal_under_review:     { label: 'Renovación — Revisar',  color: 'bg-indigo-500/10 text-indigo-400' },
        suspended_expired_license:   { label: 'Lic. vencida',  color: 'bg-red-500/10 text-red-400' },
        suspended_expired_insurance: { label: 'Seg. vencido',  color: 'bg-red-500/10 text-red-400' },
        suspended_unpaid_canon:      { label: 'Canon impago',  color: 'bg-red-500/10 text-red-400' },
        suspended_by_municipality:   { label: 'Suspendido',    color: 'bg-red-500/10 text-red-400' },
        rejected_by_municipality:    { label: 'Rechazado',     color: 'bg-zinc-500/10 text-zinc-400' },
    };
    const cfg = map[status] ?? { label: status, color: 'bg-zinc-500/10 text-zinc-400' };
    return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.color)}>{cfg.label}</span>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MunicipalDriversPage() {
    const firestore    = useFirestore();
    const { profile }  = useUser();
    const searchParams = useSearchParams();

    const initialFilter = (searchParams.get('status') as FilterStatus) || 'all';
    const [filter,  setFilter]  = useState<FilterStatus>(initialFilter);
    const [search,  setSearch]  = useState('');
    const [drivers, setDrivers] = useState<MunicipalProfile[]>([]);
    const [loading, setLoading] = useState(true);

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
            console.error('Error fetching municipal drivers:', e);
            setLoading(false);
        });
    }, [firestore, cityKey]);

    const displayed = useMemo(() => {
        let list = drivers;
        if (filter !== 'all') {
            if (filter === 'expired') {
                const isExpired = (ts: any) => {
                    if (!ts) return false;
                    const d = ts.toDate ? ts.toDate() : new Date(ts);
                    return d < new Date();
                };
                list = list.filter(d => 
                    isExpired(d.licenseExpiry) || 
                    isExpired(d.insuranceExpiry) || 
                    isExpired(d.backgroundCheckExpiry) || 
                    isExpired(d.canonExpiry)
                );
            } else if (filter === 'pending') {
                list = list.filter(isDriverReadyForReview);
            } else {
                const statuses = STATUS_FILTER_MAP[filter];
                list = list.filter(d => statuses.includes(d.municipalStatus));
            }
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(d =>
                (d.driverName ?? '').toLowerCase().includes(q) ||
                (d.municipalCode ?? '').toLowerCase().includes(q) ||
                (d.driverPhone ?? '').includes(q)
            );
        }
        return list;
    }, [drivers, filter, search]);

    const FILTERS: { key: FilterStatus; label: string }[] = [
        { key: 'all',       label: 'Todos' },
        { key: 'pending',   label: 'Pendientes' },
        { key: 'active',    label: 'Habilitados' },
        { key: 'suspended', label: 'Suspendidos' },
        { key: 'expired',   label: 'Vencidos' },
    ];

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white">Conductores Express</h1>
                    <p className="text-zinc-500 text-sm mt-1">Municipalidad de {profile?.city} · {drivers.length} registrados</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/5">
                    {FILTERS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={cn(
                                'px-3 h-8 rounded-lg text-xs font-bold transition-all',
                                filter === f.key ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1">
                    <VamoIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                    <Input
                        placeholder="Buscar por nombre, código o teléfono..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-10 bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-white/5 bg-black/20">
                            <tr>
                                <th className="px-5 py-3">Conductor</th>
                                <th className="px-5 py-3">Código</th>
                                <th className="px-5 py-3">Alta</th>
                                <th className="px-5 py-3">Estado municipal</th>
                                <th className="px-5 py-3">Docs</th>
                                <th className="px-5 py-3">Canon</th>
                                <th className="px-5 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan={7} className="px-5 py-12 text-center">
                                    <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin mx-auto" />
                                </td></tr>
                            ) : displayed.length === 0 ? (
                                <tr><td colSpan={7} className="px-5 py-16 text-center text-zinc-600 italic">
                                    No se encontraron conductores con estos filtros.
                                </td></tr>
                            ) : displayed.map(d => {
                                const { approved, total } = checklistProgress(d);
                                return (
                                    <tr key={d.driverId} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3">
                                            <p className="font-bold text-white">{d.driverName ?? '—'}</p>
                                            <p className="text-[10px] text-zinc-500">{d.driverPhone ?? d.driverEmail ?? '—'}</p>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="font-mono text-xs text-zinc-300">{d.municipalCode}</span>
                                        </td>
                                        <td className="px-5 py-3 text-xs text-zinc-500">{formatDate(d.createdAt)}</td>
                                        <td className="px-5 py-3">
                                            <StatusBadge status={d.municipalStatus} />
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={cn(
                                                'text-[10px] font-bold',
                                                approved === total ? 'text-emerald-400' : 'text-zinc-500'
                                            )}>
                                                {approved}/{total}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={cn(
                                                'text-[10px] font-bold',
                                                d.canonStatus === 'paid' ? 'text-emerald-400'
                                                : d.canonStatus === 'overdue' ? 'text-red-400'
                                                : 'text-amber-400'
                                            )}>
                                                {d.canonStatus === 'paid' ? 'Pagado' : d.canonStatus === 'overdue' ? 'Vencido' : 'Pendiente'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <Link href={`/municipal/drivers/${d.driverId}`}>
                                                <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors">
                                                    Ver detalle →
                                                </button>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
