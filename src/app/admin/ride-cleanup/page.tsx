'use client';

import React, { useState } from 'react';
import { useFirebaseApp, useUser } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function RideCleanupPage() {
    const firebaseApp = useFirebaseApp();
    const { profile } = useUser();
    const { toast } = useToast();
    
    const [query, setQuery] = useState('');
    const [reason, setReason] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [results, setResults] = useState<any>(null);

    // Authorization check
    if (profile && profile.role !== 'admin' && profile.role !== 'superadmin') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
                <VamoIcon name="lock" className="w-16 h-16 text-zinc-700 mb-4" />
                <h1 className="text-2xl font-black uppercase italic text-zinc-500">Acceso Restringido</h1>
                <p className="text-zinc-600 mt-2">Solo administradores pueden acceder a esta herramienta.</p>
            </div>
        );
    }

    const handleSearch = async () => {
        if (!query.trim() || !firebaseApp) return;
        setIsSearching(true);
        setResults(null);
        try {
            const forceClose = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'adminForceCloseRideV1');
            const res = await forceClose({ query: query.trim(), dryRun: true });
            setResults(res.data);
            toast({ title: 'Búsqueda completada', description: 'Revisá los candidatos encontrados.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error en búsqueda', description: e.message });
        } finally {
            setIsSearching(false);
        }
    };

    const handleForceClose = async () => {
        if (!query.trim() || !reason.trim() || !firebaseApp) {
            toast({ variant: 'destructive', title: 'Faltan datos', description: 'Query y Motivo son obligatorios.' });
            return;
        }
        setIsClosing(true);
        try {
            const forceClose = httpsCallable(getFunctions(firebaseApp, 'us-central1'), 'adminForceCloseRideV1');
            const res: any = await forceClose({ query: query.trim(), reason: reason.trim(), dryRun: false });
            if (res.data.ok) {
                toast({ title: 'Cierre exitoso', description: `Se cerraron ${res.data.closedRideIds.length} viajes.` });
                setResults(null);
                setQuery('');
                setReason('');
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error al cerrar', description: e.message });
        } finally {
            setIsClosing(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-40">
            <header className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                        <VamoIcon name="shield-alert" className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">Cierre Forzado de Viajes</h1>
                        <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest mt-1">Herramienta de limpieza operativa profunda</p>
                    </div>
                </div>
            </header>

            <Card className="bg-zinc-950 border-white/10 overflow-hidden shadow-2xl">
                <CardHeader className="bg-zinc-900/50 border-b border-white/5">
                    <CardTitle className="text-sm font-black uppercase italic tracking-wider text-white/80">Buscador profundo</CardTitle>
                    <CardDescription className="text-[10px] uppercase font-bold text-zinc-500">Buscá por RideID, GroupID, ShortID, Pasajero o Conductor</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="flex gap-4">
                        <Input 
                            placeholder="Ej: FMH6VY o shared_..." 
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-14 bg-white/5 border-white/10 rounded-2xl font-bold text-lg"
                        />
                        <Button 
                            onClick={handleSearch}
                            disabled={isSearching || !query.trim()}
                            className="h-14 px-8 bg-white hover:bg-zinc-200 text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl"
                        >
                            {isSearching ? <VamoIcon name="loader" className="animate-spin w-5 h-5" /> : "BUSCAR"}
                        </Button>
                    </div>
                    <p className="text-[9px] text-zinc-600 font-medium px-2 leading-relaxed italic">
                        “Esta herramienta busca documentos en Rides, Grupos Compartidos, Solicitudes, Ofertas y punteros activos en perfiles de usuario. No realiza transacciones financieras.”
                    </p>
                </CardContent>
            </Card>

            {results && results.candidates && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* SECCIÓN RIDES */}
                        <Card className="bg-zinc-950 border-white/10 shadow-xl">
                            <CardHeader className="bg-zinc-900/30 p-4 border-b border-white/5">
                                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                    <VamoIcon name="navigation" className="w-3 h-3" />
                                    Viajes (Rides) encontrados
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {results.candidates.rides.length === 0 ? (
                                    <p className="text-[10px] text-zinc-600 italic p-2">Sin coincidencias directas.</p>
                                ) : (
                                    results.candidates.rides.map((r: any) => (
                                        <div key={r.id} className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-indigo-400 font-mono">{r.id}</span>
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest",
                                                    r.status === 'searching' ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                                                )}>{r.status}</span>
                                            </div>
                                            <p className="text-[9px] font-bold text-zinc-400 truncate">{r.origin?.address} → {r.destination?.address}</p>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* SECCIÓN GRUPOS */}
                        <Card className="bg-zinc-950 border-white/10 shadow-xl">
                            <CardHeader className="bg-zinc-900/30 p-4 border-b border-white/5">
                                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                    <VamoIcon name="users" className="w-3 h-3" />
                                    Grupos compartidos
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {results.candidates.groups.length === 0 ? (
                                    <p className="text-[10px] text-zinc-600 italic p-2">Sin coincidencias directas.</p>
                                ) : (
                                    results.candidates.groups.map((g: any) => (
                                        <div key={g.id} className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-indigo-400 font-mono">{g.id}</span>
                                                <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[8px] font-black uppercase tracking-widest">{g.status}</span>
                                            </div>
                                            <p className="text-[9px] font-bold text-zinc-400">{g.passengerIds?.length || 0} Pasajeros • {formatCurrency(g.estimatedSharedTotal || 0)}</p>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* RESUMEN DE AFECTADOS */}
                    <Card className="bg-zinc-950 border-white/10 border-l-4 border-l-red-500 shadow-xl overflow-hidden">
                        <CardHeader className="p-6">
                            <CardTitle className="text-xl font-black uppercase italic tracking-tighter">Plan de Limpieza</CardTitle>
                            <CardDescription className="text-xs font-bold text-zinc-500 uppercase mt-1">Impacto estimado del cierre forzado</CardDescription>
                        </CardHeader>
                        <CardContent className="px-6 pb-6 space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase">Pasajeros</p>
                                    <p className="text-xl font-black text-white">{results.candidates.users.length}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase">Conductores</p>
                                    <p className="text-xl font-black text-white">{results.candidates.drivers.length}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase">Ofertas</p>
                                    <p className="text-xl font-black text-white">{results.candidates.offers.length}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase">Requests</p>
                                    <p className="text-xl font-black text-white">{results.candidates.requests.length}</p>
                                </div>
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-red-500 ml-1">Motivo del Cierre Forzado (Obligatorio)</label>
                                    <Input 
                                        placeholder="Ej: Viaje colgado por error de red, limpieza manual soporte técnico..." 
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="h-14 bg-white/5 border-red-500/20 focus:border-red-500 rounded-2xl font-medium"
                                    />
                                </div>

                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button 
                                            disabled={!reason.trim() || isClosing}
                                            className="w-full h-16 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-red-500/20 transition-all"
                                        >
                                            {isClosing ? <VamoIcon name="loader" className="animate-spin w-5 h-5" /> : "FORZAR CIERRE ATÓMICO"}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[2.5rem]">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-2xl font-black uppercase italic italic tracking-tighter text-white">¿ESTÁS SEGURO?</AlertDialogTitle>
                                            <AlertDialogDescription className="text-zinc-500 font-medium">
                                                Esta acción es <span className="text-red-500 font-bold uppercase">irreversible</span>. Se cancelarán todos los documentos relacionados y se limpiará la pantalla de los pasajeros y conductores afectados de forma inmediata.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 space-y-1 my-2">
                                            <p className="text-[10px] font-black text-red-500 uppercase">Query objetivo</p>
                                            <p className="text-lg font-black text-white font-mono">{query}</p>
                                        </div>
                                        <AlertDialogFooter className="mt-4 gap-2">
                                            <AlertDialogCancel className="h-14 flex-1 bg-zinc-900 border-white/5 text-zinc-400 font-bold uppercase rounded-2xl hover:bg-zinc-800">Cancelar</AlertDialogCancel>
                                            <AlertDialogAction 
                                                onClick={handleForceClose}
                                                className="h-14 flex-1 bg-red-600 hover:bg-red-500 text-white font-black uppercase rounded-2xl shadow-lg"
                                            >
                                                SÍ, CERRAR VIAJE
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
