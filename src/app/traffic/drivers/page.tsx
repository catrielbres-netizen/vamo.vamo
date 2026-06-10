'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

export default function TrafficDriversList() {
    const { profile } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const telemetry = useTelemetry();
    const { cityKey, cityName } = useMunicipalContext();
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const fetchDrivers = async () => {
        if (!cityKey) return;
        setLoading(true);
        try {
            const functions = getFunctions(undefined, 'us-central1');
            const searchDrivers = httpsCallable(functions, 'searchTrafficDriversV1');
            const res = await searchDrivers({ 
                cityKey: cityKey,
                status: filterStatus || undefined,
                query: searchQuery || undefined,
                limit: 50 
            });
            setDrivers((res.data as any).drivers);
        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: 'Error de búsqueda', 
                description: 'No se pudo acceder a la base de conductores.' 
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (profile && cityKey) {
            fetchDrivers();
            telemetry.trackEvent({
                type: 'municipal_operation',
                eventName: 'traffic_drivers_list_loaded',
                metadata: {
                    cityKey: cityKey,
                    filterStatus: filterStatus || 'all'
                }
            });
        }
    }, [profile, cityKey, filterStatus]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchDrivers();
        telemetry.trackEvent({
            type: 'municipal_operation',
            eventName: 'traffic_drivers_searched',
            metadata: {
                query: searchQuery,
                cityKey: cityKey || null
            }
        });
    };

    if (!profile) return null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            {/* HEADER */}
            <div>
                <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Conductores Habilitados</h1>
                <p className="text-zinc-500 font-medium">Búsqueda y fiscalización de flota activa en {cityName}</p>
            </div>

            {/* SEARCH & FILTERS */}
            <Card className="rounded-[2.5rem] border-white/5 bg-zinc-950/50 backdrop-blur-xl overflow-hidden premium-shadow">
                <CardHeader className="p-8 border-b border-white/5">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                        <form onSubmit={handleSearch} className="relative flex-1">
                            <VamoIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                            <Input 
                                placeholder="Nombre, patente o código municipal..." 
                                className="pl-12 h-14 rounded-2xl bg-white/5 border-white/5 focus:border-indigo-500/50 transition-all text-white placeholder:text-zinc-700"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </form>
                        <div className="flex gap-2">
                            <FilterButton active={filterStatus === ''} onClick={() => setFilterStatus('')} label="Todos" />
                            <FilterButton active={filterStatus === 'active'} onClick={() => setFilterStatus('active')} label="Habilitados" color="emerald" />
                            <FilterButton active={filterStatus === 'pending'} onClick={() => setFilterStatus('pending')} label="Pendientes" color="amber" />
                            <FilterButton active={filterStatus === 'suspended'} onClick={() => setFilterStatus('suspended')} label="Suspendidos" color="red" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-zinc-900/30">
                            <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14 px-8">Identificación</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14">Estado Control</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14">Vehículo</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14">Categoría</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 h-14 text-right px-8">Gestión</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <TableRow key={i} className="border-white/5">
                                        <TableCell colSpan={5} className="p-8"><Skeleton className="h-8 w-full bg-zinc-900/30 rounded-lg" /></TableCell>
                                    </TableRow>
                                ))
                            ) : drivers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="p-20 text-center text-zinc-700 font-bold uppercase tracking-widest italic">
                                        No hay registros coincidentes
                                    </TableCell>
                                </TableRow>
                            ) : (
                                drivers.map((driver) => (
                                    <TableRow key={driver.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                        <TableCell className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-black text-zinc-500 group-hover:text-white group-hover:bg-indigo-600 transition-all">
                                                    {driver.name?.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-white text-sm">{driver.name}</span>
                                                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">ID: {driver.municipalCode || driver.id.slice(0,8)}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <StatusBadge opStatus={driver.operationalStatus} municipalStatus={driver.municipalStatus} />
                                                {(driver.isSuspended || driver.trafficSuspended || driver.municipalSuspended || driver.adminSuspended || driver.municipalStatus === 'suspended_by_traffic') && (
                                                    <Badge className="rounded-lg border-red-500/20 bg-red-500/10 text-[9px] font-black uppercase tracking-widest px-2 py-1 text-red-400">
                                                        {driver.adminSuspended ? 'Susp. Admin' : (driver.municipalSuspended ? 'Susp. Municipal' : 'Susp. Tránsito')}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-zinc-300">{driver.vehicleModel || 'N/A'}</span>
                                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{driver.plateNumber || 'SIN PATENTE'}</span>
                                            </div>
                                        </TableCell>
                                         <TableCell>
                                             <Badge variant="outline" className="rounded-lg border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-widest px-2 py-1 text-zinc-400">
                                                 {driver.driverSubtype === 'express' ? 'PARTICULAR' : driver.driverSubtype === 'professional' ? 'TAXI / REMIS' : 'PARTICULAR'}
                                             </Badge>
                                         </TableCell>
                                        <TableCell className="text-right px-8">
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                className="rounded-xl hover:bg-white/10 text-white font-bold text-xs"
                                                onClick={() => router.push(`/traffic/drivers/${driver.id}`)}
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
                </CardContent>
            </Card>
        </div>
    );
}

function StatusBadge({ opStatus, municipalStatus }: { opStatus: string, municipalStatus: string }) {
    if (opStatus === 'suspended') return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Suspendido</Badge>;
    if (opStatus === 'observed') return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Observado</Badge>;
    if (opStatus === 'enabled') return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Habilitado</Badge>;
    
    return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 rounded-lg font-black text-[9px] uppercase tracking-widest px-2 py-1">Pendiente</Badge>;
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
            className={`px-4 py-2 rounded-xl border border-transparent text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${colors[color]} ${!active ? 'text-zinc-600' : ''}`}
        >
            {label}
        </button>
    );
}
