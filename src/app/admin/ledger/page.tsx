'use client';

import React, { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function AdminLedgerPage() {
    const firestore = useFirestore();
    const [filter, setFilter] = useState<string>('all');
    
    // 1. Unified Ledger Query (Platform Transactions)
    const ledgerQuery = useMemo(() => {
        if (!firestore) return null;
        let base = collection(firestore, 'platform_transactions');
        const constraints = [];
        
        if (filter !== 'all') {
            constraints.push(where('type', '==', filter));
        }
        
        return query(base, ...constraints, orderBy('createdAt', 'desc'), limit(100));
    }, [firestore, filter]);

    const { data: transactions, isLoading } = useCollection<any>(ledgerQuery);

    // 2. Global KPIs (Derived from current view or separate queries)
    const stats = useMemo(() => {
        if (!transactions) return { volume: 0, commissions: 0, bonuses: 0 };
        return {
            volume: transactions.reduce((acc, t) => acc + (t.type === 'wallet_credit' ? (t.amount || 0) : 0), 0),
            commissions: Math.abs(transactions.reduce((acc, t) => acc + (t.type === 'commission_debit' ? (t.amount || 0) : 0), 0)),
            bonuses: transactions.reduce((acc, t) => acc + (t.type === 'mission_bonus' ? (t.amount || 0) : 0), 0),
        };
    }, [transactions]);

    const typeConfig: Record<string, { label: string, color: string, icon: string }> = {
        commission_debit: { label: 'Comisión', color: 'text-zinc-400 bg-zinc-400/10 border-zinc-800', icon: 'percent' },
        wallet_credit: { label: 'Crédito VamO Pay', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: 'zap' },
        mission_bonus: { label: 'Bono Misión', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: 'sparkles' },
        withdrawal: { label: 'Extracción', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: 'landmark' },
        manual_adjustment: { label: 'Ajuste Manual', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: 'edit' },
    };

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                        <VamoIcon name="banknote" className="h-10 w-10 text-emerald-500" />
                        Libro Mayor Platform
                    </h1>
                    <p className="text-zinc-500 font-medium">Seguimiento financiero detallado de cada movimiento operativo.</p>
                </div>
                
                <div className="flex gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl">
                    {['all', 'wallet_credit', 'commission_debit', 'mission_bonus'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                filter === f ? "bg-zinc-800 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {f === 'all' ? 'Ver Todo' : typeConfig[f]?.label || f}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-zinc-800 bg-zinc-950/50 backdrop-blur-3xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <VamoIcon name="zap" className="h-24 w-24 text-emerald-500" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardDescription className="uppercase tracking-[0.2em] font-black text-[10px] text-zinc-500">Volumen VamO Pay (Muestra)</CardDescription>
                        <CardTitle className="text-4xl font-black text-emerald-500">${stats.volume.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-zinc-600 font-medium">Suma de créditos por billetera en los últimos 100 movimientos.</p>
                    </CardContent>
                </Card>

                <Card className="border-zinc-800 bg-zinc-950/50 backdrop-blur-3xl">
                    <CardHeader className="pb-2">
                        <CardDescription className="uppercase tracking-[0.2em] font-black text-[10px] text-zinc-500">Recaudación Fees (Comisiones)</CardDescription>
                        <CardTitle className="text-4xl font-black text-white">${stats.commissions.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-zinc-600 font-medium">Ingresos brutos retenidos por la plataforma.</p>
                    </CardContent>
                </Card>

                <Card className="border-zinc-800 bg-zinc-950/50 backdrop-blur-3xl">
                    <CardHeader className="pb-2">
                        <CardDescription className="uppercase tracking-[0.2em] font-black text-[10px] text-zinc-500">Inversión en Bonos (Coste)</CardDescription>
                        <CardTitle className="text-4xl font-black text-indigo-400">${stats.bonuses.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-zinc-600 font-medium">Dinero otorgado a conductores por misiones y logros.</p>
                    </CardContent>
                </Card>
            </div>

            {/* Ledger Table Section */}
            <Card className="border-zinc-800 bg-zinc-950/50 backdrop-blur-3xl overflow-hidden border-t-0 rounded-3xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-zinc-900/80 border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">ID Operación</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">Fecha y Hora</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">Tipo / Detalle</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">Sujeto (Driver)</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 italic text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <tr key={i}><td colSpan={5} className="px-6 py-4"><Skeleton className="h-6 w-full rounded-lg" /></td></tr>
                                ))
                            ) : transactions?.map((t: any) => {
                                const config = typeConfig[t.type] || { label: t.type, color: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20', icon: 'info' };
                                const isPositive = t.amount > 0;
                                
                                return (
                                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-mono font-bold text-zinc-600 group-hover:text-zinc-400 transition-colors uppercase">TX-{t.id?.substring(0, 12) || 'N/A'}</span>
                                                {t.rideId && <Link href={`/admin/live-rides`} className="text-[9px] text-indigo-500/60 font-black uppercase tracking-tight hover:text-indigo-400">Ver Viaje Relacionado</Link>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-white uppercase">{t.createdAt?.toDate ? format(t.createdAt.toDate(), "dd MMM / HH:mm", { locale: es }) : '...'}</span>
                                                <span className="text-[9px] text-zinc-600 font-medium">Servidor us-central1</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("p-2 rounded-xl border", config.color)}>
                                                    <VamoIcon name={config.icon} className="h-3.5 w-3.5" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black uppercase tracking-tight text-white">{config.label}</span>
                                                    <span className="text-[10px] text-zinc-500 font-medium line-clamp-1">{t.note || 'Sin observaciones'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-zinc-400">
                                            <div className="flex flex-col">
                                                <span className="uppercase tracking-widest text-[9px] text-zinc-600 mb-0.5">UID Driver</span>
                                                <span className="font-mono">{t.driverId?.substring(0, 8) || 'PLATFORM'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={cn(
                                                "text-lg font-black italic tracking-tighter",
                                                isPositive ? "text-emerald-400" : "text-zinc-500"
                                            )}>
                                                {isPositive ? '+' : ''}${t.amount?.toLocaleString()}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {transactions?.length === 0 && !isLoading && (
                        <div className="py-20 text-center flex flex-col items-center justify-center opacity-40">
                            <VamoIcon name="search-x" className="h-16 w-16 mb-4" />
                            <p className="text-sm font-black uppercase tracking-widest">No hay movimientos registrados</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Footer Tip */}
            <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-3xl flex items-start gap-4">
                <VamoIcon name="shield-check" className="h-6 w-6 text-indigo-500 shrink-0 mt-1" />
                <div>
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Auditoría Financiera Atómica</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed max-w-3xl font-medium mt-1">
                        Cada fila representa una entrada en el libro mayor inmutable. Los movimientos de billetera (Vamo Pay) y las comisiones se procesan en transacciones ACID dentro de Firebase, garantizando la integridad de los saldos de los conductores. Si detecta discrepancias, consulte el ID del viaje relacionado.
                    </p>
                </div>
            </div>
        </div>
    );
}
