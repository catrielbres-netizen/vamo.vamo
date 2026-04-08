'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { MunicipalProfile, MunicipalExpressStatus, normalizeCityKey } from '@/lib/types';
import Link from 'next/link';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';

const EXPIRED_STATUSES: MunicipalExpressStatus[] = [
    'suspended_expired_license',
    'suspended_expired_insurance',
    'suspended_unpaid_canon',
    'suspended_by_municipality',
    'renewal_under_review',
];

function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysVencido(ts: any): number | null {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function isExpired(ts: any): boolean {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.getTime() < Date.now();
}

function motivo(d: MunicipalProfile): string {
    if (d.municipalStatus === 'suspended_expired_license') return 'Licencia vencida';
    if (d.municipalStatus === 'suspended_expired_insurance') return 'Seguro vencido';
    if (d.municipalStatus === 'suspended_unpaid_canon') return 'Canon impago';
    if (d.municipalStatus === 'suspended_by_municipality') return 'Suspensión municipal';
    if (d.municipalStatus === 'renewal_under_review') return 'Renovación pendiente de revisión';
    // Fallback: check actual timestamps for active drivers
    if (isExpired(d.licenseExpiry)) return 'Licencia vencida';
    if (isExpired(d.insuranceExpiry)) return 'Seguro vencido';
    if (d.canonStatus === 'overdue') return 'Canon vencido';
    return 'Vencimiento';
}

// Also include active drivers with expired docs (mismatch)
function isVencido(d: MunicipalProfile): boolean {
    if (EXPIRED_STATUSES.includes(d.municipalStatus)) return true;
    if (d.municipalStatus === 'active') {
        return isExpired(d.licenseExpiry) || isExpired(d.insuranceExpiry) || d.canonStatus === 'overdue';
    }
    return false;
}

export default function MunicipalExpiredPage() {
    const firestore  = useFirestore();
    const { profile } = useUser();
    const [drivers, setDrivers] = useState<MunicipalProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const cityKey = profile?.city ? normalizeCityKey(profile.city) : null;

    useEffect(() => {
        if (!firestore || !cityKey) return;
        const q = query(
            collection(firestore, 'municipal_profiles'),
            where('cityKey', '==', cityKey),
            orderBy('createdAt', 'desc')
        );
        getDocs(q).then(snap => {
            const all = snap.docs.map(d => ({ ...d.data(), driverId: d.id } as MunicipalProfile));
            setDrivers(all.filter(isVencido));
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [firestore, cityKey]);

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-black text-white">Panel de Vencidos</h1>
                <p className="text-zinc-500 text-sm mt-1">Conductores con licencia, seguro o canon vencido · {profile?.city}</p>
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="w-8 h-8 border-4 border-red-500/20 border-t-red-400 rounded-full animate-spin" />
                </div>
            ) : drivers.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                    <VamoIcon name="check-circle" className="h-12 w-12 mx-auto text-emerald-600" />
                    <p className="text-zinc-500">No hay conductores con vencimientos pendientes. ✓</p>
                </div>
            ) : (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-white/5 bg-black/20">
                                <tr>
                                    <th className="px-5 py-3">Conductor</th>
                                    <th className="px-5 py-3">Código</th>
                                    <th className="px-5 py-3">Motivo</th>
                                    <th className="px-5 py-3">Vencimiento</th>
                                    <th className="px-5 py-3">Días vencido</th>
                                    <th className="px-5 py-3">Doc nueva</th>
                                    <th className="px-5 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {drivers.map(d => {
                                    const reason = motivo(d);
                                    const expTs  = d.municipalStatus === 'suspended_expired_license' ? d.licenseExpiry
                                                 : d.municipalStatus === 'suspended_expired_insurance' ? d.insuranceExpiry
                                                 : null;
                                    const dias   = expTs ? daysVencido(expTs) : null;
                                    const hasNewDoc = d.municipalStatus === 'renewal_under_review';
                                    return (
                                        <tr key={d.driverId} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-5 py-3">
                                                <p className="font-bold text-white">{d.driverName ?? '—'}</p>
                                                <p className="text-[10px] text-zinc-500">{d.driverPhone ?? '—'}</p>
                                            </td>
                                            <td className="px-5 py-3 font-mono text-xs text-zinc-300">{d.municipalCode}</td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs font-bold text-red-400">{reason}</span>
                                            </td>
                                            <td className="px-5 py-3 text-xs text-zinc-400">{expTs ? formatDate(expTs) : '—'}</td>
                                            <td className="px-5 py-3">
                                                {dias !== null && dias >= 0 ? (
                                                    <span className={cn('text-xs font-bold', dias > 30 ? 'text-red-400' : 'text-orange-400')}>
                                                        {dias}d
                                                    </span>
                                                ) : <span className="text-zinc-600">—</span>}
                                            </td>
                                            <td className="px-5 py-3">
                                                {hasNewDoc ? (
                                                    <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                                                        Sí — pendiente
                                                    </span>
                                                ) : <span className="text-zinc-700 text-[10px]">No</span>}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Link href={`/municipal/drivers/${d.driverId}`}>
                                                    <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors">
                                                        Ver →
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
            )}
        </div>
    );
}
