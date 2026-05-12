'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function TrafficDashboard() {
    const { profile } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const [lastId, setLastId] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [stats, setStats] = useState<any>(null);

    const fetchData = async (append = false) => {
        if (append) setLoadingMore(true);
        else setLoading(true);

        try {
            const functions = getFunctions(undefined, 'us-central1');
            
            // Fetch Stats (only on initial load)
            if (!append) {
                const getStats = httpsCallable(functions, 'getTrafficStatsV1');
                const statsRes = await getStats();
                setStats(statsRes.data);
            }

            // Fetch Drivers
            const searchDrivers = httpsCallable(functions, 'searchTrafficDriversV1');
            const driversRes = await searchDrivers({ 
                status: filterStatus || undefined,
                query: searchQuery || undefined,
                limit: 20,
                lastVisible: append ? lastId : undefined
            });
            
            const data = driversRes.data as any;
            if (append) {
                setDrivers(prev => [...prev, ...data.drivers]);
            } else {
                setDrivers(data.drivers);
            }
            
            setLastId(data.lastVisibleId);
            setHasMore(data.hasMore);

        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Error de carga', 
                description: error.message || 'No se pudieron obtener los datos de tránsito.' 
            });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (profile) {
            if (profile.role === 'traffic_municipal') {
                router.replace('/traffic');
                return;
            }
            // Reset pagination on filter change
            setLastId(null);
            setHasMore(false);
            fetchData(false);
        }
    }, [profile, filterStatus]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchData();
    };

    if (!profile) return null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Panel de Tránsito</h1>
                    <p className="text-zinc-500 font-medium">Control y ordenamiento de la flota municipal — {profile.city || 'Jurisdicción VamO'}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => fetchData()} className="rounded-xl border-white/5 bg-white/5 text-zinc-400 hover:text-white">
                        <VamoIcon name="refresh-cw" className="w-4 h-4 mr-2" />
                        Actualizar
                    </Button>
                </div>
            </div>

            {/* STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? (
                    Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl bg-zinc-900/50" />)
                ) : (
                    <>
                        <StatCard title="Conductores Habilitados" value={stats?.active} total={stats?.total} color="emerald" icon="check-circle" />
                        <StatCard title="Pendientes de Revisión" value={stats?.pending} color="amber" icon="clock" />
                        <StatCard title="Documentación Vencida" value={stats?.expired} color="red" icon="alert-triangle" />
                        <StatCard title="Conductores Suspendidos" value={stats?.suspended} color="zinc" icon="slash" />
                    </>
                )}
            </div>

            {/* SEARCH & FILTERS */}
            <Card className="rounded-[2.5rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden premium-shadow">
                <CardHeader className="p-8 border-b border-white/5">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                        <form onSubmit={handleSearch} className="relative flex-1">
                            <VamoIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                            <Input 
                                placeholder="Buscar por nombre, patente o código municipal..." 
                                className="pl-12 h-14 rounded-2xl bg-white/5 border-white/5 focus:border-indigo-500/50 transition-all text-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </form>
                        <div className="flex gap-2">
                            <FilterButton active={filterStatus === ''} onClick={() => setFilterStatus('')} label="Todos" />
                            <FilterButton active={filterStatus === 'approved'} onClick={() => setFilterStatus('approved')} label="Habilitados" color="emerald" />
                            <FilterButton active={filterStatus === 'pending_review'} onClick={() => setFilterStatus('pending_review')} label="Pendientes" color="amber" />
                            <FilterButton active={filterStatus === 'suspended'} onClick={() => setFilterStatus('suspended')} label="Suspendidos" color="red" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-zinc-900/30">
                            <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14 px-8">Conductor</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14">Estado Municipal</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14">Vehículo / Patente</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14">Subtipo</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14 text-right px-8">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && !loadingMore ? (
                                Array(5).fill(0).map((_, i) => (
                                    <TableRow key={i} className="border-white/5">
                                        <TableCell colSpan={5} className="p-8"><Skeleton className="h-8 w-full bg-zinc-900/30 rounded-lg" /></TableCell>
                                    </TableRow>
                                ))
                            ) : drivers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="p-20 text-center text-zinc-600 font-bold uppercase tracking-widest italic">
                                        No se encontraron conductores
                                    </TableCell>
                                </TableRow>
                            ) : (
                                drivers.map((driver) => (
                                    <TableRow key={driver.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                        <TableCell className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white">
                                                    {driver.name?.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-white text-sm">{driver.name}</span>
                                                    <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter">{driver.email}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={driver.municipalStatus} />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-zinc-300">{driver.vehicleModel || 'N/A'}</span>
                                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{driver.plateNumber || 'SIN PATENTE'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="rounded-lg border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-widest px-2 py-1 text-zinc-400">
                                                {driver.driverSubtype || 'express'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right px-8">
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                className="rounded-xl hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
                                                onClick={() => router.push(`/municipal/drivers/${driver.id}`)}
                                            >
                                                Ver Ficha
                                                <VamoIcon name="chevron-right" className="w-4 h-4 ml-2" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {hasMore && (
                        <div className="p-8 flex justify-center border-t border-white/5 bg-white/[0.01]">
                            <Button 
                                onClick={() => fetchData(true)} 
                                disabled={loadingMore}
                                variant="outline"
                                className="rounded-2xl border-white/10 bg-white/5 text-zinc-400 hover:text-white h-12 px-8 min-w-[200px]"
                            >
                                {loadingMore ? (
                                    <>
                                        <VamoIcon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                                        Cargando más...
                                    </>
                                ) : (
                                    <>
                                        Cargar más conductores
                                        <VamoIcon name="chevron-down" className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({ title, value, total, color, icon }: any) {
    const colors: any = {
        emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/20",
        amber: "from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/20",
        red: "from-red-500/20 to-red-500/5 text-red-500 border-red-500/20",
        zinc: "from-zinc-500/20 to-zinc-500/5 text-zinc-400 border-zinc-500/20"
    };

    return (
        <Card className={`rounded-[2rem] border bg-gradient-to-br ${colors[color]} premium-shadow overflow-hidden group`}>
            <CardContent className="p-8 relative">
                <VamoIcon name={icon} className={`absolute -right-4 -bottom-4 w-24 h-24 opacity-5 group-hover:scale-110 transition-transform duration-700`} />
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 italic">{title}</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black italic tracking-tighter">{value ?? 0}</span>
                        {total !== undefined && <span className="text-sm font-bold opacity-40">/ {total}</span>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'approved': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Habilitado</Badge>;
        case 'pending_review': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Pendiente</Badge>;
        case 'suspended': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Suspendido</Badge>;
        case 'expired': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Vencido</Badge>;
        default: return <Badge className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">No Registrado</Badge>;
    }
}

function FilterButton({ active, onClick, label, color = 'zinc' }: any) {
    const colors: any = {
        emerald: active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "hover:bg-emerald-500/5",
        amber: active ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "hover:bg-amber-500/5",
        red: active ? "bg-red-500/20 text-red-400 border-red-500/30" : "hover:bg-red-500/5",
        zinc: active ? "bg-white/10 text-white border-white/10" : "hover:bg-white/5"
    };

    return (
        <button 
            onClick={onClick}
            className={`px-4 py-2 rounded-xl border border-transparent text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${colors[color]} ${!active ? 'text-zinc-500' : ''}`}
        >
            {label}
        </button>
    );
}
