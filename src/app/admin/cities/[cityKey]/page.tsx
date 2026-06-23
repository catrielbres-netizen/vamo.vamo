'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import Link from 'next/link';

export default function CityAuditDashboard() {
    const params = useParams();
    const cityKey = params?.cityKey as string;
    const { profile } = useUser();
    const functions = useFunctions();
    const { toast } = useToast();
    const router = useRouter();

    const [loadingMetrics, setLoadingMetrics] = useState(true);
    const [metrics, setMetrics] = useState<any>(null);

    // Rides state
    const [rides, setRides] = useState<any[]>([]);
    const [loadingRides, setLoadingRides] = useState(false);
    const [filterDriverId, setFilterDriverId] = useState('');
    const [filterPassengerId, setFilterPassengerId] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // Fap Claims state
    const [claims, setClaims] = useState<any[]>([]);
    const [loadingClaims, setLoadingClaims] = useState(false);

    // Financials state
    const [financials, setFinancials] = useState<any>(null);
    const [loadingFinancials, setLoadingFinancials] = useState(false);

    useEffect(() => {
        if (!functions || !cityKey || !profile || profile.role !== 'admin') return;

        const loadMetrics = async () => {
            try {
                const getMetricsFn = httpsCallable(functions, 'adminGetCityMetricsV1');
                const res = await getMetricsFn({ cityKey });
                setMetrics((res.data as any));
            } catch (error: any) {
                toast({ title: 'Error cargando métricas', description: error.message, variant: 'destructive' });
            } finally {
                setLoadingMetrics(false);
            }
        };

        loadMetrics();
        loadRides();
        loadClaims();
        loadFinancials();
    }, [functions, cityKey, profile]);

    const loadFinancials = async () => {
        if (!functions) return;
        setLoadingFinancials(true);
        try {
            const getFinancialsFn = httpsCallable(functions, 'adminGetCityFinancialsV1');
            const res = await getFinancialsFn({ cityKey });
            setFinancials(res.data);
        } catch (error: any) {
            toast({ title: 'Error cargando finanzas', description: error.message, variant: 'destructive' });
        } finally {
            setLoadingFinancials(false);
        }
    };

    const loadRides = async () => {
        if (!functions) return;
        setLoadingRides(true);
        try {
            const getRidesFn = httpsCallable(functions, 'adminGetCityRidesV1');
            const res = await getRidesFn({ 
                cityKey, 
                filterDriverId: filterDriverId.trim() || undefined,
                filterPassengerId: filterPassengerId.trim() || undefined,
                filterStatus,
                limit: 100 
            });
            setRides((res.data as any).rides || []);
        } catch (error: any) {
            toast({ title: 'Error cargando viajes', description: error.message, variant: 'destructive' });
        } finally {
            setLoadingRides(false);
        }
    };

    const loadClaims = async () => {
        if (!functions) return;
        setLoadingClaims(true);
        try {
            const getClaimsFn = httpsCallable(functions, 'adminGetCityFapClaimsV1');
            const res = await getClaimsFn({ cityKey, limit: 100 });
            setClaims((res.data as any).claims || []);
        } catch (error: any) {
            toast({ title: 'Error cargando reclamos', description: error.message, variant: 'destructive' });
        } finally {
            setLoadingClaims(false);
        }
    };

    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/expansion" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <VamoIcon name="arrow-left" className="w-5 h-5 text-zinc-400" />
                </Link>
                <div>
                    <h1 className="text-3xl font-black text-white capitalize">Auditoría: {cityKey.replace('-', ' ')}</h1>
                    <p className="text-zinc-500 text-sm mt-1">Superadmin City Dashboard</p>
                </div>
            </div>

            {/* Metrics */}
            {loadingMetrics ? (
                <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
            ) : metrics ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-white/[0.02] border-white/5">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-400">Conductores Activos</CardTitle></CardHeader>
                        <CardContent><div className="text-3xl font-black text-white">{metrics.totalDrivers}</div></CardContent>
                    </Card>
                    <Card className="bg-white/[0.02] border-white/5">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-400">Pasajeros</CardTitle></CardHeader>
                        <CardContent><div className="text-3xl font-black text-white">{metrics.totalPassengers}</div></CardContent>
                    </Card>
                    <Card className="bg-white/[0.02] border-white/5">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-400">Viajes Históricos</CardTitle></CardHeader>
                        <CardContent><div className="text-3xl font-black text-white">{metrics.totalRides}</div></CardContent>
                    </Card>
                    <Card className="bg-white/[0.02] border-emerald-500/20">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-500">F.A.P. Pagado</CardTitle></CardHeader>
                        <CardContent><div className="text-3xl font-black text-emerald-400">{formatCurrency(metrics.totalFapPaid)}</div></CardContent>
                    </Card>
                </div>
            ) : null}

            {/* Tabs */}
            <Tabs defaultValue="rides" className="w-full">
                <TabsList className="grid w-full max-w-2xl grid-cols-3 bg-black/40 border border-white/5">
                    <TabsTrigger value="rides">Historial de Viajes</TabsTrigger>
                    <TabsTrigger value="claims">Auditoría F.A.P.</TabsTrigger>
                    <TabsTrigger value="finances">Finanzas y Comisiones</TabsTrigger>
                </TabsList>

                {/* Rides Tab */}
                <TabsContent value="rides" className="space-y-4 mt-6">
                    <div className="flex flex-wrap gap-3 items-end bg-white/[0.02] p-4 rounded-xl border border-white/5">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1 block">ID Conductor</label>
                            <Input value={filterDriverId} onChange={e => setFilterDriverId(e.target.value)} placeholder="Ej: uid_del_conductor" className="bg-black/20" />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1 block">ID Pasajero</label>
                            <Input value={filterPassengerId} onChange={e => setFilterPassengerId(e.target.value)} placeholder="Ej: uid_del_pasajero" className="bg-black/20" />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1 block">Estado</label>
                            <select 
                                value={filterStatus} 
                                onChange={e => setFilterStatus(e.target.value)}
                                className="w-full h-10 px-3 bg-black/20 border border-input rounded-md text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-white"
                            >
                                <option value="all">Todos</option>
                                <option value="completed">Completados</option>
                                <option value="cancelled">Cancelados</option>
                                <option value="in_progress">En Progreso</option>
                            </select>
                        </div>
                        <Button onClick={loadRides} disabled={loadingRides} className="bg-indigo-600 hover:bg-indigo-700">
                            {loadingRides ? 'Buscando...' : 'Aplicar Filtros'}
                        </Button>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-black/40 border-b border-white/5">
                                <tr>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3">Estado</th>
                                    <th className="px-4 py-3">Conductor</th>
                                    <th className="px-4 py-3">Pasajero</th>
                                    <th className="px-4 py-3">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {rides.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No se encontraron viajes con estos filtros.</td></tr>
                                ) : rides.map(r => (
                                    <tr key={r.id} className="hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 text-zinc-300 text-xs">{formatDate(r.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest",
                                                r.status === 'completed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                r.status === 'cancelled' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                                "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                            )}>{r.status}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-white font-bold">{r.driverName || 'N/A'}</p>
                                            <p className="text-[10px] text-zinc-500 font-mono">{r.driverId || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-white font-bold">{r.passengerName || 'N/A'}</p>
                                            <p className="text-[10px] text-zinc-500 font-mono">{r.passengerId || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-emerald-400">
                                            {formatCurrency(r.pricing?.finalTotal || r.pricing?.estimatedTotal || 0)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* Claims Tab */}
                <TabsContent value="claims" className="space-y-4 mt-6">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-zinc-400">Viendo reclamos F.A.P. originados en esta ciudad.</p>
                        <Button variant="outline" size="sm" onClick={() => router.push('/admin/claims')} className="bg-white/5 border-white/10 hover:bg-white/10 text-white">
                            Ir al Panel Global de Pagos F.A.P. <VamoIcon name="external-link" className="ml-2 w-4 h-4" />
                        </Button>
                    </div>
                    
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-black/40 border-b border-white/5">
                                <tr>
                                    <th className="px-4 py-3">Fecha/Caso</th>
                                    <th className="px-4 py-3">Estado</th>
                                    <th className="px-4 py-3">Pasajero</th>
                                    <th className="px-4 py-3">Monto Solicitado</th>
                                    <th className="px-4 py-3">Motivo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {claims.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No hay reclamos registrados para esta ciudad.</td></tr>
                                ) : claims.map(c => (
                                    <tr key={c.id} className="hover:bg-white/[0.02]">
                                        <td className="px-4 py-3">
                                            <p className="text-zinc-300 text-xs">{formatDate(c.createdAt)}</p>
                                            <p className="text-[10px] text-indigo-400 font-mono font-bold mt-1">{c.caseId}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest",
                                                c.status === 'paid' || c.status === 'approved' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                c.status === 'rejected' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                                "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                            )}>{c.status}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-white font-bold">{c.passengerNameSnapshot || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-amber-400">
                                            {formatCurrency(c.requestedAmount || 0)}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-zinc-400 truncate max-w-[200px]" title={c.description}>
                                            {c.description}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* Finances Tab */}
                <TabsContent value="finances" className="space-y-4 mt-6">
                    {loadingFinancials ? (
                        <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"/></div>
                    ) : financials ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Panel de Comisiones */}
                            <Card className="bg-white/[0.02] border-white/5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-5">
                                    <VamoIcon name="briefcase" className="w-24 h-24 text-white" />
                                </div>
                                <CardHeader>
                                    <CardTitle className="text-xl font-black text-white">Comisiones Generadas</CardTitle>
                                    <p className="text-zinc-500 text-sm">Ingresos brutos retenidos por VamO en esta ciudad.</p>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Comisión VamO (Total Histórico)</p>
                                        <p className="text-4xl font-black text-white tracking-tighter">{formatCurrency(financials.totalPlatformCommission)}</p>
                                    </div>
                                    <div className="pt-4 border-t border-white/5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Participación Municipal (Si aplica)</p>
                                        <p className="text-xl font-black text-indigo-400 tracking-tighter">{formatCurrency(financials.totalMunicipalCommission)}</p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Panel del Pozo Semanal */}
                            <Card className="bg-indigo-500/10 border-indigo-500/20 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-5">
                                    <VamoIcon name="gift" className="w-24 h-24 text-indigo-400" />
                                </div>
                                <CardHeader>
                                    <CardTitle className="text-xl font-black text-indigo-400">Pozo Semanal Actual</CardTitle>
                                    <p className="text-indigo-300/60 text-sm">Fondos acumulados para repartir esta semana.</p>
                                </CardHeader>
                                <CardContent>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400/60">Monto del Pozo</p>
                                        <p className="text-4xl font-black text-indigo-400 tracking-tighter">{formatCurrency(financials.weeklyPoolAmount)}</p>
                                    </div>
                                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30">
                                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                        <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Acumulando...</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Vamo Pay vs Cash */}
                            <Card className="bg-white/[0.02] border-white/5 md:col-span-2">
                                <CardHeader>
                                    <CardTitle className="text-xl font-black text-white">Métodos de Pago (Viajes Completados)</CardTitle>
                                    <p className="text-zinc-500 text-sm">Distribución de volumen de dinero transaccionado en la plataforma.</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                                <span className="text-sm font-bold text-white uppercase tracking-widest">VamO Pay / Billetera</span>
                                            </div>
                                            <p className="text-3xl font-black text-emerald-400 tracking-tighter pl-5">{formatCurrency(financials.totalVamoPay)}</p>
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase pl-5">{financials.vamoPayRidesCount} viajes procesados</p>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-amber-500" />
                                                <span className="text-sm font-bold text-white uppercase tracking-widest">Efectivo / Transferencia Directa</span>
                                            </div>
                                            <p className="text-3xl font-black text-amber-400 tracking-tighter pl-5">{formatCurrency(financials.totalCash)}</p>
                                        </div>
                                    </div>
                                    
                                    {/* Barra de Proporción */}
                                    {financials.totalVamoPay + financials.totalCash > 0 && (
                                        <div className="mt-6 h-4 w-full bg-white/5 rounded-full overflow-hidden flex">
                                            <div 
                                                className="h-full bg-emerald-500" 
                                                style={{ width: `${(financials.totalVamoPay / (financials.totalVamoPay + financials.totalCash)) * 100}%` }}
                                            />
                                            <div 
                                                className="h-full bg-amber-500" 
                                                style={{ width: `${(financials.totalCash / (financials.totalVamoPay + financials.totalCash)) * 100}%` }}
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-zinc-500">No hay datos financieros disponibles.</div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
