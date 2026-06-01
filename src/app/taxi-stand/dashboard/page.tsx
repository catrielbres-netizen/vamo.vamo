'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { collection, query, where, doc, getDoc, onSnapshot, FieldValue, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { ThemeCustomizer } from '@/components/settings/ThemeCustomizer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Countdown Timer Component ───────────────────────────────────────────────
function RideCountdown({ expiresAt, onTimeout }: { expiresAt: any; onTimeout?: () => void }) {
    const [secondsLeft, setSecondsLeft] = useState<number>(30);

    useEffect(() => {
        if (!expiresAt) return;
        const targetMs = expiresAt.toMillis ? expiresAt.toMillis() : new Date(expiresAt).getTime();

        const updateTimer = () => {
            const diff = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
            setSecondsLeft(diff);
            if (diff === 0 && onTimeout) {
                onTimeout();
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [expiresAt, onTimeout]);

    const percentage = (secondsLeft / 30) * 100;
    
    let strokeColor = 'stroke-emerald-500';
    if (secondsLeft <= 10) strokeColor = 'stroke-rose-500';
    else if (secondsLeft <= 20) strokeColor = 'stroke-amber-500';

    return (
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 px-4 py-2 rounded-2xl">
            <div className="relative w-8 h-8">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="16" cy="16" r="14" className="stroke-white/5 fill-transparent" strokeWidth="2" />
                    <circle 
                        cx="16" 
                        cy="16" 
                        r="14" 
                        className={cn("fill-transparent transition-all duration-1000", strokeColor)} 
                        strokeWidth="2"
                        strokeDasharray={88}
                        strokeDashoffset={88 - (88 * percentage) / 100}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white font-mono">
                    {secondsLeft}s
                </span>
            </div>
            <div>
                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">Tiempo Restante</p>
                <p className="text-[10px] font-bold text-white uppercase">Prioridad de Parada</p>
            </div>
        </div>
    );
}

// Helper to get safe ride display fare from various possible fields (pricing snapshot, driver gross, etc.)
function getRideDisplayFare(ride: any): number | null {
    if (!ride) return null;
    
    // 1. ride.pricingSnapshot?.driverGrossAmount
    if (typeof ride.pricingSnapshot?.driverGrossAmount === 'number') return ride.pricingSnapshot.driverGrossAmount;
    // 2. ride.pricingSnapshot?.officialFare
    if (typeof ride.pricingSnapshot?.officialFare === 'number') return ride.pricingSnapshot.officialFare;
    // 3. ride.pricing?.driverGrossAmount
    if (typeof ride.pricing?.driverGrossAmount === 'number') return ride.pricing.driverGrossAmount;
    // 4. ride.pricing?.estimatedTotal
    if (typeof ride.pricing?.estimatedTotal === 'number') return ride.pricing.estimatedTotal;
    // 5. ride.pricing?.driverReceivesTotal
    if (typeof ride.pricing?.driverReceivesTotal === 'number') return ride.pricing.driverReceivesTotal;
    // 6. ride.estimatedFare
    if (typeof ride.estimatedFare === 'number') return ride.estimatedFare;
    // 7. ride.fare
    if (typeof ride.fare === 'number') return ride.fare;
    // 8. ride.totalFare
    if (typeof ride.totalFare === 'number') return ride.totalFare;
    
    console.warn(`[getRideDisplayFare] No fare found for ride ${ride.id}. Fields present:`, Object.keys(ride));
    return null;
}

let globalAudioCtx: AudioContext | null = null;

function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!globalAudioCtx) {
        globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
}

// Unlock audio context on first user interaction to satisfy browser autoplay policies
if (typeof window !== 'undefined') {
    const unlockAudio = () => {
        const ctx = getAudioContext();
        if (ctx) {
            ctx.resume().then(() => {
                if (ctx.state === 'running') {
                    window.removeEventListener('click', unlockAudio);
                    window.removeEventListener('keydown', unlockAudio);
                    window.removeEventListener('touchstart', unlockAudio);
                }
            }).catch(() => {});
        }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
}

// Play notification sound helper
function playNotificationSound() {
    try {
        const audioCtx = getAudioContext();
        if (!audioCtx) return;
        
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc.start(now);
        osc.stop(now + 0.4);
    } catch (e) {
        console.warn("[AUDIO_NOTIFICATION] Failed to play synthesized sound:", e);
    }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TaxiStandDashboardPage() {
    const auth = useAuth();
    const db = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [userProfile, setUserProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeRides, setActiveRides] = useState<any[]>([]);
    const [standDrivers, setStandDrivers] = useState<any[]>([]);
    const [dispatchLogs, setDispatchLogs] = useState<any[]>([]);
    const [assigningRideId, setAssigningRideId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    
    // Play sound on incoming new rides
    const prevRidesCountRef = useRef<number | null>(null);
    useEffect(() => {
        const currentCount = activeRides.length;
        if (currentCount > 0) {
            if (prevRidesCountRef.current === null || currentCount > prevRidesCountRef.current) {
                playNotificationSound();
            }
        }
        prevRidesCountRef.current = currentCount;
    }, [activeRides]);

    // Auth & Profile Guard (Race-Condition Free Reactive onAuthStateChanged + direct getDoc)
    useEffect(() => {
        if (!auth || !db) return;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                console.log("[STATION_DASHBOARD] No authenticated user. Redirecting to login...");
                router.replace('/taxi-stand/login');
                return;
            }

            try {
                const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
                if (!userSnap.exists()) {
                    console.warn("[STATION_DASHBOARD] User document does not exist in Firestore.");
                    await signOut(auth);
                    router.replace('/taxi-stand/login');
                    return;
                }

                const profile = userSnap.data();
                if (profile.role !== 'station_operator' || !profile.stationId) {
                    toast({
                        variant: 'destructive',
                        title: 'Acceso no autorizado',
                        description: 'Esta cuenta no posee el rol de operador de parada.'
                    });
                    await signOut(auth);
                    router.replace('/taxi-stand/login');
                    return;
                }

                setUserProfile(profile);
                setLoading(false);
            } catch (err) {
                console.error("[STATION_DASHBOARD_GUARD_ERROR]", err);
                router.replace('/taxi-stand/login');
            }
        });

        return () => unsubscribe();
    }, [auth, db, router]);

    // Live Real-Time Subscriptions
    useEffect(() => {
        if (!db || !userProfile?.stationId) return;

        const standId = userProfile.stationId;
        const cityKey = userProfile.cityKey;

        console.log(`[STATION_DASHBOARD_LISTENERS] Active for stand: ${standId}, city: ${cityKey}`);

        // 1. Subscribe to Pending rides under station priority
        const qRides = query(
            collection(db, 'rides'),
            where('stationId', '==', standId),
            where('stationDispatch', '==', true),
            where('status', '==', 'searching'),
            where('stationDispatchStatus', 'in', ['pending_assignment', 'pending_reassignment'])
        );

        const unsubscribeRides = onSnapshot(qRides, (snapshot) => {
            const rides: any[] = [];
            snapshot.forEach(doc => {
                rides.push({ id: doc.id, ...doc.data() });
            });
            // Sort by creation or expiration
            rides.sort((a, b) => {
                const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                return tA - tB;
            });
            setActiveRides(rides);
        }, (err) => {
            console.error("Error subscribing to stand rides:", err);
        });

        // 2. Subscribe to Stand Drivers with parallel leak-free listeners across 4 collections
        let driversList: any[] = [];
        let usersList: any[] = [];
        let locationsList: any[] = [];
        let mpList: any[] = [];

        const mergeAndSetDrivers = () => {
            const driversMap: Record<string, any> = {};

            // A. Start with drivers collection (main registry of stationId assignment)
            driversList.forEach(item => {
                driversMap[item.id] = {
                    id: item.id,
                    name: 'Conductor Profesional',
                    email: '',
                    vehicleModel: 'Vehículo',
                    vehiclePlate: '—',
                    driverStatus: 'offline',
                    isAvailable: false,
                    activeRideId: null,
                    approved: false,
                    isSuspended: false,
                    ...item
                };
            });

            // B. Add municipal_profiles to include any muni-only drivers
            mpList.forEach(item => {
                const id = item.id;
                if (!driversMap[id]) {
                    driversMap[id] = {
                        id,
                        name: 'Conductor Profesional',
                        email: '',
                        vehicleModel: 'Vehículo',
                        vehiclePlate: '—',
                        driverStatus: 'offline',
                        isAvailable: false,
                        activeRideId: null,
                        approved: false,
                        isSuspended: false
                    };
                }
                driversMap[id].name = item.driverName || driversMap[id].name;
                driversMap[id].email = item.driverEmail || driversMap[id].email;
                driversMap[id].vehiclePlate = item.municipalCode || driversMap[id].vehiclePlate;
                driversMap[id].approved = item.municipalStatus === 'active' || driversMap[id].approved;
                driversMap[id].isSuspended = item.isSuspended || driversMap[id].isSuspended;
            });

            // C. Merge users profile
            usersList.forEach(item => {
                const id = item.id;
                if (!driversMap[id]) return;
                
                driversMap[id].name = item.name || driversMap[id].name;
                driversMap[id].email = item.email || driversMap[id].email;
                driversMap[id].vehicleModel = item.vehicleModel || item.vehicle?.model || driversMap[id].vehicleModel;
                driversMap[id].vehiclePlate = item.plateNumber || item.vehiclePlate || driversMap[id].vehiclePlate;
                driversMap[id].driverStatus = item.driverStatus || driversMap[id].driverStatus;
                driversMap[id].activeRideId = item.activeRideId || driversMap[id].activeRideId;
                driversMap[id].isAvailable = item.isAvailable || driversMap[id].isAvailable;
                driversMap[id].approved = item.approved || driversMap[id].approved;
                driversMap[id].isSuspended = item.isSuspended || driversMap[id].isSuspended;
            });

            // D. Merge real-time locations and online status
            locationsList.forEach(item => {
                const id = item.id;
                if (!driversMap[id]) return;

                driversMap[id].driverStatus = item.driverStatus || driversMap[id].driverStatus;
                driversMap[id].isAvailable = item.isAvailable || driversMap[id].isAvailable;
                driversMap[id].activeRideId = item.activeRideId || driversMap[id].activeRideId;
                driversMap[id].location = item.location || item.currentLocation || null;
                driversMap[id].updatedAt = item.updatedAt || null;
            });

            setStandDrivers(Object.values(driversMap));
        };

        const unsubscribeDrivers = onSnapshot(
            query(collection(db, 'drivers'), where('stationId', '==', standId)),
            (snap) => {
                driversList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                mergeAndSetDrivers();
            },
            (err) => console.error("Error subscribing to drivers:", err)
        );

        const unsubscribeMp = onSnapshot(
            query(collection(db, 'municipal_profiles'), where('stationId', '==', standId)),
            (snap) => {
                mpList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                mergeAndSetDrivers();
            },
            (err) => console.error("Error subscribing to municipal_profiles:", err)
        );

        const unsubscribeUsers = onSnapshot(
            query(collection(db, 'users'), where('stationId', '==', standId)),
            (snap) => {
                usersList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                mergeAndSetDrivers();
            },
            (err) => console.error("Error subscribing to users:", err)
        );

        const unsubscribeLocations = onSnapshot(
            query(collection(db, 'drivers_locations'), where('stationId', '==', standId)),
            (snap) => {
                locationsList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                mergeAndSetDrivers();
            },
            (err) => console.error("Error subscribing to locations:", err)
        );

        // 3. Subscribe to Dispatch logs (sorted in-memory to bypass index requirement)
        const qLogs = query(
            collection(db, 'station_dispatch_logs'),
            where('standId', '==', standId)
        );

        const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
            const logs: any[] = [];
            snapshot.forEach(doc => {
                logs.push({ id: doc.id, ...doc.data() });
            });
            logs.sort((a, b) => {
                const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
                const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
                return tB - tA;
            });
            setDispatchLogs(logs.slice(0, 20));
        }, (err) => {
            console.error("Error subscribing to stand logs:", err);
        });

        return () => {
            unsubscribeRides();
            unsubscribeDrivers();
            unsubscribeMp();
            unsubscribeUsers();
            unsubscribeLocations();
            unsubscribeLogs();
        };
    }, [db, userProfile]);

    const handleSignOut = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            router.push('/taxi-stand/login');
        } catch (err) {
            console.error("Error signing out:", err);
        }
    };

    // Manual Driver Assignment Trigger
    const handleAssignDriver = async (rideId: string, driverId: string) => {
        setActionLoading(true);
        try {
            const fns = getFunctions(undefined, 'us-central1');
            const assignFn = httpsCallable(fns, 'assignStationRideToDriverV1');
            
            toast({
                title: "Asignando conductor",
                description: "Procesando asignación y enviando oferta..."
            });

            await assignFn({ rideId, driverId });
            
            toast({
                title: "Asignación exitosa",
                description: "La oferta de viaje ha sido enviada al conductor.",
                variant: "success" as any
            });

            setAssigningRideId(null);
        } catch (error: any) {
            console.error("Error assigning driver:", error);
            toast({
                variant: 'destructive',
                title: 'Error de asignación',
                description: error.message || 'No se pudo asignar el viaje al conductor.'
            });
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <VamoFullScreenLoader label="Cargando portal de parada..." />;
    }

    // Calculations (Filtering out suspended/unapproved drivers from matching)
    const activeDrivers = standDrivers.filter(d => d.approved && !d.isSuspended);
    const onlineDrivers = activeDrivers.filter(d => d.driverStatus === 'online');
    const availableDrivers = onlineDrivers.filter(d => !d.activeRideId);
    const busyDrivers = onlineDrivers.filter(d => d.activeRideId);

    return (
        <div className="min-h-screen bg-background text-foreground p-6 max-w-7xl mx-auto space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl -z-10" />

            {/* Premium Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-8">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-400 font-black uppercase tracking-[0.25em] text-[10px]">Parada Digital Activa</span>
                    </div>
                    <h1 className="text-4xl font-black italic uppercase tracking-tighter mt-1 text-foreground">
                        {userProfile.stationName || 'Mi Parada'}
                    </h1>
                    <p className="text-muted-foreground text-xs mt-1 uppercase font-bold tracking-wider">
                        Operador: <span className="text-foreground">{userProfile.name}</span> · Ciudad: <span className="text-foreground">{userProfile.cityKey?.toUpperCase()}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Dialog>
                        <DialogTrigger asChild>
                            <button className="bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/20 text-zinc-400 hover:text-indigo-400 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5">
                                <VamoIcon name="palette" className="w-3.5 h-3.5" />
                                <span>Diseño</span>
                            </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] lg:max-w-5xl rounded-[2.5rem] bg-zinc-950 border-zinc-800 text-white overflow-y-auto max-h-[85vh] p-6 sm:p-8">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Personalizar Panel de Parada</DialogTitle>
                                <DialogDescription className="text-zinc-500 text-xs uppercase font-black tracking-widest mt-1">Ajustá la paleta de colores, bordes y texturas de tu panel operativo.</DialogDescription>
                            </DialogHeader>
                            <div className="mt-6">
                                <ThemeCustomizer />
                            </div>
                        </DialogContent>
                    </Dialog>
                    <button 
                        onClick={handleSignOut}
                        className="bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-zinc-400 hover:text-rose-400 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </div>

            {/* Stats Dashboard Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border p-5 rounded-3xl relative overflow-hidden group hover:bg-muted/40 transition-all duration-300">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Pendientes de Asignación</p>
                    <p className="text-3xl font-black italic tracking-tighter mt-1 text-foreground">{activeRides.length}</p>
                    <span className="absolute right-4 bottom-4 text-foreground/5 font-black text-4xl group-hover:scale-110 transition-transform duration-300">🚏</span>
                </div>
                <div className="bg-emerald-500/[0.02] border border-emerald-500/10 p-5 rounded-3xl relative overflow-hidden group hover:bg-emerald-500/[0.04] transition-all duration-300">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Móviles Disponibles</p>
                    <p className="text-3xl font-black italic tracking-tighter mt-1 text-emerald-400">{availableDrivers.length}</p>
                    <span className="absolute right-4 bottom-4 text-emerald-500/5 font-black text-4xl group-hover:scale-110 transition-transform duration-300">🚗</span>
                </div>
                <div className="bg-amber-500/[0.02] border border-amber-500/10 p-5 rounded-3xl relative overflow-hidden group hover:bg-amber-500/[0.04] transition-all duration-300">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Móviles Ocupados</p>
                    <p className="text-3xl font-black italic tracking-tighter mt-1 text-amber-400">{busyDrivers.length}</p>
                    <span className="absolute right-4 bottom-4 text-amber-500/5 font-black text-4xl group-hover:scale-110 transition-transform duration-300">⏱️</span>
                </div>
                <div className="bg-card border border-border p-5 rounded-3xl relative overflow-hidden group hover:bg-muted/40 transition-all duration-300">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Conductores Registrados</p>
                    <p className="text-3xl font-black italic tracking-tighter mt-1 text-muted-foreground">{standDrivers.length}</p>
                    <span className="absolute right-4 bottom-4 text-foreground/5 font-black text-4xl group-hover:scale-110 transition-transform duration-300">📋</span>
                </div>
            </div>

            {/* Central Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Column 1 & 2: Pending Rides */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Viajes en Radio de Parada ({activeRides.length})
                        </h2>
                    </div>

                    {activeRides.length === 0 ? (
                        <div className="bg-card/40 border border-border rounded-[2rem] p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
                            <VamoIcon name="car" className="h-12 w-12 text-muted-foreground/30" />
                            <p className="text-sm font-bold uppercase tracking-wide">Sin solicitudes pendientes en radio</p>
                            <p className="text-xs text-muted-foreground/60">Los viajes dentro del radio de parada o derivados por apoyo cercano aparecerán aquí durante 30s.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {activeRides.map(ride => (
                                <div key={ride.id} className="bg-card border border-border rounded-3xl p-6 relative overflow-hidden hover:border-border/60 transition-all duration-300">
                                    {/* Expiration Tag & Countdown */}
                                    <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-[9px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider",
                                                ride.stationDispatchStatus === 'pending_reassignment' 
                                                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                                                    : ride.stationDispatchType === 'support_radius'
                                                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                            )}>
                                                {ride.stationDispatchStatus === 'pending_reassignment' 
                                                    ? 'Reasignación' 
                                                    : ride.stationDispatchType === 'support_radius'
                                                        ? 'Apoyo Cercano'
                                                        : 'Nueva Solicitud'}
                                            </span>
                                            <span className="text-[10px] font-mono text-muted-foreground">#{ride.id.slice(-6).toUpperCase()}</span>
                                        </div>
                                        <RideCountdown expiresAt={ride.stationDispatchExpiresAt} />
                                    </div>

                                    {/* Dispatch Type Banner */}
                                    {ride.stationDispatchType === 'support_radius' ? (
                                        <div className="mb-4 bg-rose-500/[0.03] border border-rose-500/10 rounded-2xl p-4 text-xs">
                                            <div className="flex items-center gap-2 text-rose-400 font-black uppercase tracking-wider mb-1">
                                                <span>⚠️</span>
                                                <span>Solicitud de apoyo cercana</span>
                                            </div>
                                            <p className="text-muted-foreground text-[10px] leading-relaxed">
                                                Este viaje está fuera del radio principal ({ride.stationDistanceMeters}m), pero VamO lo deriva por falta de disponibilidad cercana.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="mb-4 bg-emerald-500/[0.02] border border-emerald-500/10 rounded-2xl px-4 py-2.5 text-xs flex items-center gap-2 text-emerald-400 font-bold">
                                            <span>🚏</span>
                                            <span>Viaje dentro del radio de la parada ({ride.stationDistanceMeters}m)</span>
                                        </div>
                                    )}

                                    {/* Origin / Destination */}
                                    <div className="space-y-3 pl-3 border-l-2 border-indigo-500/20 relative">
                                        <div className="absolute top-1.5 left-[-5px] w-2 h-2 rounded-full bg-indigo-500" />
                                        <div className="absolute bottom-1.5 left-[-5px] w-2 h-2 rounded-full bg-pink-500" />
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Origen</p>
                                            <p className="text-sm font-bold text-foreground truncate">{ride.origin?.address || ride.origin?.name || 'Dirección de Origen'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Destino</p>
                                            <p className="text-sm font-bold text-foreground/90 truncate">{ride.destination?.address || ride.destination?.name || 'Dirección de Destino'}</p>
                                        </div>
                                    </div>

                                    {/* Passenger Name if exists */}
                                    {ride.passengerName && (
                                        <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-xl w-fit">
                                            <span className="text-[9px] font-black uppercase text-muted-foreground/80">Pasajero:</span>
                                            <span className="font-bold text-foreground">{ride.passengerName}</span>
                                        </div>
                                    )}

                                    {/* Financial & Social Details */}
                                    <div className="grid grid-cols-3 gap-4 border-t border-b border-border my-4 py-3 text-xs">
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Conductor Cobra</p>
                                            <p className="text-lg font-black text-foreground">
                                                {getRideDisplayFare(ride) !== null 
                                                    ? `$${Math.round(getRideDisplayFare(ride)!).toLocaleString('es-AR')}`
                                                    : 'Tarifa no disponible'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Tipo Viaje</p>
                                            <p className="text-sm font-bold uppercase text-indigo-400">{ride.rideType === 'shared' ? 'Compartido' : ride.rideType === 'express' ? 'Express' : 'Normal'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Pago</p>
                                            <p className="text-sm font-bold uppercase text-emerald-400">
                                                {ride.paymentMethod === 'cash' ? 'Efectivo' : 
                                                 ride.paymentMethod === 'wallet' ? 'Wallet' : 
                                                 ride.paymentMethod === 'credit' ? 'Crédito' : 
                                                 ride.paymentMethod === 'mixed' ? 'Mixto' : 'Efectivo'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Detailed Social Benefit / Wallet Coverage Breakdown */}
                                    {ride.pricing && (ride.pricing.walletCoveredAmount > 0 || ride.pricing.creditCoveredAmount > 0 || ride.pricing.expressDiscountAmount > 0) && (
                                        <div className="bg-card border border-border rounded-2xl p-3.5 mb-4 space-y-1.5 text-[11px]">
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Tarifa Oficial:</span>
                                                <span className="font-bold text-foreground">${Math.round(ride.pricing.originalTotal ?? (getRideDisplayFare(ride) || 0)).toLocaleString('es-AR')}</span>
                                            </div>
                                            {ride.pricing.expressDiscountAmount > 0 && (
                                                <div className="flex justify-between text-rose-400">
                                                    <span>Descuento Express:</span>
                                                    <span>-${Math.round(ride.pricing.expressDiscountAmount).toLocaleString('es-AR')}</span>
                                                </div>
                                            )}
                                            {((ride.pricing.walletCoveredAmount ?? 0) > 0 || (ride.pricing.creditCoveredAmount ?? 0) > 0) && (
                                                <div className="flex justify-between text-amber-400">
                                                     <span>Soporte VamO / Wallet:</span>
                                                     <span>-${Math.round((ride.pricing.walletCoveredAmount || 0) + (ride.pricing.creditCoveredAmount || 0)).toLocaleString('es-AR')}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between border-t border-border pt-1.5 font-bold text-foreground">
                                                <span>Paga Pasajero:</span>
                                                <span className="text-emerald-400">${Math.round(ride.pricing.passengerPaysTotal ?? ride.pricing.cashToCollect ?? 0).toLocaleString('es-AR')}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Control Section / Selection Dropdown */}
                                    <div className="flex flex-col gap-3">
                                        {assigningRideId === ride.id ? (
                                            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Seleccionar Móvil Disponible</p>
                                                    <button 
                                                        onClick={() => setAssigningRideId(null)}
                                                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-tighter"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                                {availableDrivers.length === 0 ? (
                                                    <p className="text-xs text-rose-400 italic">No hay móviles disponibles online en este momento.</p>
                                                ) : (
                                                    <div className="max-h-[150px] overflow-y-auto divide-y divide-border pr-1">
                                                        {availableDrivers.map(drv => (
                                                            <button
                                                                key={drv.id}
                                                                onClick={() => handleAssignDriver(ride.id, drv.id)}
                                                                disabled={actionLoading}
                                                                className="w-full py-2.5 text-left flex items-center justify-between hover:bg-muted/40 transition-colors"
                                                            >
                                                                <div>
                                                                    <p className="text-xs font-bold text-foreground">{drv.name}</p>
                                                                    <p className="text-[10px] text-muted-foreground">{drv.vehicleModel} · {drv.vehiclePlate}</p>
                                                                </div>
                                                                <span className="text-[10px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                                                                    Asignar
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <Button
                                                onClick={() => setAssigningRideId(ride.id)}
                                                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wider rounded-2xl shadow-xl shadow-indigo-600/10 active:scale-[0.98] transition-all"
                                            >
                                                ASIGNAR CONDUCTOR DE PARADA
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Column 3: Stand Drivers & Logs */}
                <div className="space-y-6">
                    {/* Drivers Availability */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                <VamoIcon name="users" className="h-5 w-5 text-indigo-400" />
                                Móviles ({standDrivers.length})
                            </h2>
                        </div>
                        <div className="bg-card border border-border rounded-[2rem] p-5 space-y-4 max-h-[350px] overflow-y-auto">
                            {standDrivers.length === 0 ? (
                                <p className="text-muted-foreground text-xs italic text-center py-8">No hay conductores registrados en esta parada.</p>
                            ) : (
                                <div className="divide-y divide-border space-y-3">
                                    {standDrivers.map(drv => (
                                        <div key={drv.id} className="pt-3 first:pt-0 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-foreground truncate">{drv.name}</p>
                                                <p className="text-[10px] text-muted-foreground truncate">{drv.vehicleModel || 'Vehículo'} · {drv.vehiclePlate || '—'}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {drv.isSuspended ? (
                                                    <span className="text-[9px] font-black uppercase bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full animate-pulse">
                                                        Suspendido
                                                    </span>
                                                ) : !drv.approved ? (
                                                    <span className="text-[9px] font-black uppercase bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full">
                                                        No Habilitado
                                                    </span>
                                                ) : drv.driverStatus === 'online' ? (
                                                    drv.activeRideId ? (
                                                        <span className="text-[9px] font-black uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                                                            En Viaje
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] font-black uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                                                            Disponible
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                                        Offline
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stand Activity Audit Logs */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                <VamoIcon name="activity" className="h-5 w-5 text-indigo-400" />
                                Historial de Despachos
                            </h2>
                        </div>
                        <div className="bg-card/40 border border-border rounded-[2rem] p-5 font-mono text-[10px] space-y-3 max-h-[300px] overflow-y-auto">
                            {dispatchLogs.length === 0 ? (
                                <p className="text-muted-foreground/60 italic text-center py-8">Sin logs registrados hoy.</p>
                            ) : (
                                dispatchLogs.map(log => {
                                    const timeStr = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('es-AR') : new Date(log.timestamp).toLocaleTimeString('es-AR');
                                    let clr = 'text-muted-foreground';
                                    if (log.action === 'assigned_to_driver') clr = 'text-emerald-500';
                                    else if (log.action === 'released_to_general_matching') clr = 'text-amber-500';
                                    else if (log.action === 'pending_reassignment') clr = 'text-indigo-500';

                                    return (
                                        <div key={log.id} className="pb-2.5 border-b border-border last:border-0 last:pb-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className={cn("font-bold uppercase tracking-tighter text-[9px]", clr)}>
                                                    {log.action?.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-muted-foreground/60 text-[8px]">{timeStr}</span>
                                            </div>
                                            <p className="text-muted-foreground leading-tight">{log.details}</p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

            </div>

        </div>
    );
}
