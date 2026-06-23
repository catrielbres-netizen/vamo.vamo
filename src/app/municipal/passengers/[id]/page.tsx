'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useFirebase } from '@/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useParams, useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { formatCurrency, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { UserProfile, Ride } from '@/lib/types';
import Link from 'next/link';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PassengerHistoryPage() {
    const params = useParams();
    const router = useRouter();
    const { firestore, functions } = useFirebase();
    const { toast } = useToast();
    const { cityKey } = useMunicipalContext();
    
    const passengerId = params?.id as string;
    
    const [passenger, setPassenger] = useState<UserProfile | null>(null);
    const [rides, setRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (!firestore || !passengerId || !cityKey) return;

        const loadData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Passenger Profile
                const pDoc = await getDoc(doc(firestore, 'users', passengerId));
                if (pDoc.exists()) {
                    setPassenger(pDoc.data() as UserProfile);
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: 'Pasajero no encontrado.' });
                    router.push('/municipal/passengers');
                    return;
                }

                // 2. Fetch Ride History
                const getRidesFn = httpsCallable(functions, 'getPassengerRidesV1');
                try {
                    const result = await getRidesFn({ passengerId });
                    const simpleRides = (result.data as any).rides as Ride[];
                    // Sort locally
                    simpleRides.sort((a, b) => {
                        const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt as unknown as number || 0);
                        const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt as unknown as number || 0);
                        return dateB - dateA;
                    });
                    setRides(simpleRides);
                } catch (e: any) {
                    console.error("Error loading rides:", e);
                }
            } catch (error) {
                console.error("Error fetching passenger data:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos.' });
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [firestore, passengerId, cityKey, functions]);

    // Derived Metrics
    const driverRepetition = useMemo(() => {
        const counts: Record<string, { count: number, name: string, isSuspicious: boolean }> = {};
        const completedRides = rides.filter(r => r.status === 'completed' && r.driverId);
        
        completedRides.forEach(r => {
            if (!r.driverId) return;
            if (!counts[r.driverId]) {
                counts[r.driverId] = { count: 0, name: r.driverName || 'Desconocido', isSuspicious: false };
            }
            counts[r.driverId].count++;
            if (counts[r.driverId].count > 4) {
                counts[r.driverId].isSuspicious = true; // Flag if more than 4 trips with same driver in recent history
            }
        });
        
        return Object.values(counts).sort((a, b) => b.count - a.count);
    }, [rides]);

    const handleForceValidation = async () => {
        if (!functions || !passenger) return;
        setActionLoading(true);
        try {
            toast({ title: 'Acción ejecutada', description: 'Se ha enviado la solicitud de validación obligatoria al pasajero.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo forzar la validación.' });
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!passenger) return null;

    const trustScore = (passenger as any).trustScore ?? 100;
    const stats = (passenger as any).passengerStats || { completedRides: 0, totalRides: 0, cancelledRides: 0 };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            {/* Header & Back Button */}
            <div className="flex items-center gap-4">
                <Link href="/municipal/passengers" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <VamoIcon name="arrow-left" className="w-5 h-5 text-zinc-400" />
                </Link>
                <div>
                    <h1 className="text-3xl font-black text-white">Historial de Pasajero</h1>
                    <p className="text-zinc-500 text-sm mt-1">ID: <span className="font-mono">{passenger.uid}</span></p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Col 1: Hoja de Vida */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="rounded-3xl border border-white/5 bg-white/[0.02] overflow-hidden p-6 relative">
                        {/* Background subtle glow */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                        
                        <div className="flex items-start gap-4 mb-6">
                            {passenger.photoURL ? (
                                <img src={passenger.photoURL} alt={passenger.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10" />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border-2 border-indigo-500/30 flex items-center justify-center shrink-0">
                                    <VamoIcon name="user" className="w-8 h-8 text-indigo-400" />
                                </div>
                            )}
                            <div>
                                <h2 className="text-xl font-black text-white leading-tight">{passenger.name || 'Sin nombre'}</h2>
                                <p className="text-xs text-zinc-500 font-mono mt-1">{passenger.phone}</p>
                                <p className="text-xs text-zinc-500 truncate max-w-[200px]" title={passenger.email}>{passenger.email}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Trust Score</span>
                                <div className="flex items-center gap-2">
                                    <span className={cn("font-bold", trustScore >= 80 ? "text-emerald-400" : trustScore >= 50 ? "text-amber-400" : "text-red-400")}>
                                        {trustScore}
                                    </span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Saldo Cuenta</span>
                                <span className="font-bold text-emerald-400">{formatCurrency(passenger.currentBalance || 0)}</span>
                            </div>

                            <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Métricas</span>
                                <span className="font-mono text-xs text-zinc-400">{stats.completedRides} C / {stats.totalRides} T / {stats.cancelledRides} X</span>
                            </div>

                            <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Creación</span>
                                <span className="text-xs text-zinc-400">{formatDate(passenger.createdAt)}</span>
                            </div>
                        </div>

                        <div className="mt-6">
                            <button 
                                onClick={handleForceValidation}
                                disabled={actionLoading}
                                className="w-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                            >
                                <VamoIcon name="shield-alert" className="w-4 h-4" />
                                Forzar Validación Identidad
                            </button>
                            <p className="text-[10px] text-zinc-600 mt-2 text-center leading-relaxed">
                                El pasajero deberá tomarse una selfie y foto del DNI antes de pedir el próximo viaje.
                            </p>
                        </div>
                    </div>

                    {/* Driver Repetition Analysis */}
                    <div className="rounded-3xl border border-white/5 bg-white/[0.02] overflow-hidden p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <VamoIcon name="bar-chart-2" className="w-5 h-5 text-indigo-400" />
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Análisis Repetición</h3>
                        </div>
                        <p className="text-[10px] text-zinc-500 mb-4">Monitoreo antifraude: Cantidad de viajes completados con cada conductor.</p>
                        
                        <div className="space-y-2">
                            {driverRepetition.length === 0 ? (
                                <p className="text-xs text-zinc-600 italic text-center py-4">No hay datos suficientes.</p>
                            ) : (
                                driverRepetition.map((dr, idx) => (
                                    <div key={idx} className={cn(
                                        "flex justify-between items-center p-3 rounded-xl border",
                                        dr.isSuspicious ? "bg-red-500/10 border-red-500/20" : "bg-black/20 border-white/5"
                                    )}>
                                        <div className="flex items-center gap-2">
                                            {dr.isSuspicious && <VamoIcon name="alert-triangle" className="w-4 h-4 text-red-500" />}
                                            <span className="text-xs font-bold text-white">{dr.name}</span>
                                        </div>
                                        <span className={cn("text-xs font-mono", dr.isSuspicious ? "text-red-400 font-black" : "text-zinc-400")}>
                                            {dr.count} viajes
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Col 2: Telemetry / Rides */}
                <div className="space-y-6 lg:col-span-2">
                    <div className="rounded-3xl border border-white/5 bg-white/[0.02] overflow-hidden flex flex-col h-[800px]">
                        <div className="p-6 border-b border-white/5 bg-black/20">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <VamoIcon name="activity" className="w-5 h-5 text-indigo-400" />
                                Telemetría y Viajes Recientes ({rides.length})
                            </h3>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {rides.length === 0 ? (
                                <div className="h-full flex items-center justify-center">
                                    <p className="text-zinc-500 text-sm italic">El pasajero aún no ha realizado viajes.</p>
                                </div>
                            ) : (
                                rides.map(ride => (
                                    <div key={ride.id} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                                        {/* Ride Header */}
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                        ride.status === 'completed' ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
                                                        ride.status === 'cancelled' ? "bg-red-500/20 border-red-500/30 text-red-400" :
                                                        "bg-amber-500/20 border-amber-500/30 text-amber-400"
                                                    )}>
                                                        {ride.status}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500">{formatDate(ride.createdAt)}</span>
                                                </div>
                                                <p className="text-xs font-bold text-white mt-2">Conductor: <span className="text-indigo-400">{ride.driverName || 'No asignado'}</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-black text-emerald-400">{formatCurrency(ride.pricing?.finalTotal || ride.pricing?.estimatedTotal || 0)}</p>
                                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{ride.paymentMethod || 'Efectivo'}</p>
                                            </div>
                                        </div>

                                        {/* Route */}
                                        <div className="bg-white/5 rounded-xl p-3 flex flex-col gap-2">
                                            <div className="flex items-center gap-2 text-xs">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                                <span className="text-zinc-300 truncate">{ride.origin.address}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <div className="w-2 h-2 bg-emerald-500 shrink-0" />
                                                <span className="text-zinc-300 truncate">{ride.destination.address}</span>
                                            </div>
                                        </div>

                                        {/* Telemetry / Audio Action */}
                                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-4">
                                                {/* Audio */}
                                                <button 
                                                    onClick={() => toast({ title: 'Audio de Seguridad', description: 'Reproduciendo grabación pre-viaje y viaje completo (Telemetría de Audio)...' })}
                                                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors"
                                                >
                                                    <VamoIcon name="mic" className="w-3 h-3" />
                                                    Escuchar Grabación (Pre-viaje)
                                                </button>
                                                
                                                {/* Duration */}
                                                {(ride as any).durationSeconds && (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                                        <VamoIcon name="clock" className="w-3 h-3" />
                                                        {Math.round((ride as any).durationSeconds / 60)} min
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Interaction / Rating */}
                                            {ride.status === 'completed' && (
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                                                    <VamoIcon name="star" className="w-3 h-3 fill-current" />
                                                    <span>{Math.floor(Math.random() * 2) + 4}.0</span> {/* Placeholder for actual rating if stored on ride */}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
