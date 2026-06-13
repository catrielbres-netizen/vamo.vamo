'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { featureFlags } from '@/config/features';

export default function DriverReservationsPage() {
    const { profile } = useUser();
    const firestore = useFirestore();
    const [reservations, setReservations] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const driverCity = profile?.operatingAreaId || profile?.cityKey || '';

    useEffect(() => {
        if (!firestore) return;

        console.log("🔍 [RESERVAS] Iniciando escucha. driverCity:", driverCity || "TODAS");

        // Query simple sin filtro de ciudad (evita requerir índice compuesto en Firestore)
        // El filtro de ciudad se aplica en el cliente
        const q = query(
            collection(firestore, 'rides'),
            where('status', 'in', ['scheduled', 'pending_driver_assignment', 'searching', 'driver_assigned', 'activating'])
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            try {
                let list = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as any))
                    .filter(ride => {
                        // Filtro de ciudad en el cliente
                        if (driverCity) {
                            const c = (ride.cityKey || '').toLowerCase();
                            const dc = driverCity.toLowerCase();
                            const cityOk = c === dc || c.includes(dc) || dc.includes(c);
                            if (!cityOk) return false;
                        }

                        // Excluir simulaciones
                        if (ride.isSimulation === true) return false;

                        // Si está asignado a otro, no lo muestro
                        if ((ride.status === 'driver_assigned' || ride.status === 'activating') && ride.driverId !== profile?.uid) {
                            return false;
                        }

                        // Si está en 'searching', solo mostrar si estoy interesado o es compartida
                        if (ride.status === 'searching' && !ride.isSharedRide && !ride.interestedDriverIds?.includes(profile?.id || profile?.uid || '')) {
                            return false;
                        }

                        return true;
                    });
                
                list.sort((a: any, b: any) => {
                    const timeA = typeof a.scheduledAt?.toMillis === 'function' ? a.scheduledAt.toMillis() : (a.scheduledAt?.seconds ? a.scheduledAt.seconds * 1000 : 0);
                    const timeB = typeof b.scheduledAt?.toMillis === 'function' ? b.scheduledAt.toMillis() : (b.scheduledAt?.seconds ? b.scheduledAt.seconds * 1000 : 0);
                    return timeA - timeB;
                });
                
                setReservations(list);
            } catch (error) {
                console.error("❌ [RESERVAS] Error:", error);
            } finally {
                setLoading(false);
            }
        }, (err) => {
            console.error("❌ [RESERVAS] Error de Firestore:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [driverCity, firestore, profile?.uid]);

    // Un conductor puede ver la bolsa si tiene cualquier forma de habilitación activa o si está en Plan B y está aprobado
    const isEligibleDriver = profile?.approved === true || (!featureFlags.vamoParticularModeEnabled && profile?.municipalStatus === 'active');
    if (!profile) return null;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-black uppercase italic tracking-tight">Próximos Viajes</h1>
                <p className="text-sm text-muted-foreground font-medium">Bolsa de reservas disponibles en tu ciudad.</p>
            </div>

            {!isEligibleDriver && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex gap-3 items-center">
                    <VamoIcon name="alert-triangle" className="w-5 h-5 text-amber-400 shrink-0" />
                    <p className="text-xs font-medium text-amber-300 leading-relaxed">
                        Podés ver las reservas, pero para anotarte necesitás tener tu cuenta aprobada y documentación vigente.
                    </p>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4">
                    <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Cargando bolsa...</p>
                </div>
            ) : reservations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-card border border-dashed border-border rounded-[2.5rem] text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <VamoIcon name="calendar" className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">No hay reservas</h3>
                    <p className="text-sm text-muted-foreground px-6">Por ahora no hay viajes programados. ¡Volvé a revisar más tarde!</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {reservations.map((ride) => (
                        <ReservationCard 
                            key={ride.id} 
                            ride={ride} 
                            isEligibleDriver={isEligibleDriver} 
                        />
                    ))}
                </div>
            )}

            <div className="p-6 rounded-[2rem] bg-indigo-600/10 border border-indigo-600/20">
                <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 flex items-center justify-center shrink-0">
                        <VamoIcon name="info" className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">¿Cómo funciona?</h4>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                            Estos viajes se activarán automáticamente 10 minutos antes de la hora pactada. 
                            Si estás cerca y online en ese momento, recibirás la oferta con **prioridad absoluta**.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReservationCard({ ride, isEligibleDriver }: { ride: Ride; isEligibleDriver: boolean }) {
    const { user } = useUser();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    
    const scheduledDate = ride.scheduledAt instanceof Timestamp ? ride.scheduledAt.toDate() : new Date(ride.scheduledAt as any);
    const timeUntil = formatDistanceToNow(scheduledDate, { locale: es, addSuffix: true });
    
    const handleAcceptReservation = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const functions = getFunctions(undefined, 'us-central1');
            const acceptReservation = httpsCallable(functions, 'acceptScheduledRideV1');
            await acceptReservation({ rideId: ride.id });
            toast({
                title: '¡Reserva Asignada!',
                description: 'La reserva ya es tuya. ¡No te olvides de estar online 15 mins antes!',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'No se pudo aceptar la reserva',
                description: error.message || 'Error al conectar con el servidor.',
            });
        } finally {
            setLoading(false);
        }
    };

    const isMine = ride.driverId === user?.uid;
    const isAvailable = ride.status === 'scheduled' || ride.status === 'pending_driver_assignment';

    return (
        <Card className={cn(
            "rounded-[2rem] overflow-hidden shadow-sm backdrop-blur-sm transition-all",
            isMine ? "bg-indigo-600/10 border-indigo-500/30" : "bg-card/50 border-border/50"
        )}>
            <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                        <div className="flex flex-wrap gap-2 mb-2">
                            <Badge variant="outline" className="w-fit bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-black text-[10px] uppercase">
                                {ride.serviceType === 'express' ? 'VamO Express' : 'VamO Profesional'}
                            </Badge>
                            {(ride.pricing as any)?.tariffMode && (
                                <Badge variant="outline" className={cn(
                                    "w-fit font-black text-[10px] uppercase",
                                    (ride.pricing as any).tariffMode === 'night' 
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                                        : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                )}>
                                    {(ride.pricing as any).tariffMode === 'night' ? 'Tarifa Nocturna' : 'Tarifa Diurna'}
                                </Badge>
                            )}
                        </div>
                        <h3 className="text-xl font-black text-white leading-none">
                            {scheduledDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                        </h3>
                        {ride.status === 'activating' ? (
                            <p className="text-xs font-black text-amber-400 mt-1 uppercase animate-pulse">Activando viaje...</p>
                        ) : ride.status === 'searching' ? (
                            <p className="text-xs font-black text-emerald-400 mt-1 uppercase animate-pulse">Buscando conductor...</p>
                        ) : isMine ? (
                            <p className="text-xs font-bold text-indigo-400 mt-1 uppercase tracking-widest">{timeUntil}</p>
                        ) : (
                            <p className="text-xs font-bold text-zinc-400 mt-1 uppercase tracking-widest">{timeUntil}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-black text-white italic tracking-tighter">${(ride.pricing?.estimated?.total || ride.pricing?.estimatedTotal || 0).toLocaleString('es-AR')}</span>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Est. Neto</p>
                    </div>
                </div>

                <div className="space-y-3 py-4 border-y border-border/50">
                    <div className="flex gap-3 items-center">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <p className="text-xs font-medium text-zinc-300 truncate">{ride.origin.address}</p>
                    </div>
                    <div className="flex gap-3 items-center">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <p className="text-xs font-medium text-zinc-300 truncate">{ride.destination.address}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button 
                        onClick={handleAcceptReservation}
                        disabled={!isAvailable || loading || !isEligibleDriver || isMine}
                        variant={isMine ? "secondary" : "default"}
                        className={cn(
                            "h-10 px-6 rounded-xl font-black text-xs uppercase tracking-widest transition-all w-full",
                            isMine 
                                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 opacity-100" 
                                : !isEligibleDriver || !isAvailable
                                    ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed hidden"
                                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                        )}
                    >
                        {loading ? (
                            <VamoIcon name="loader" className="w-4 h-4 animate-spin" />
                        ) : isMine ? (
                            <>
                                <VamoIcon name="check" className="w-3.5 h-3.5 mr-2" />
                                Asignada a vos
                            </>
                        ) : !isEligibleDriver ? (
                            'Habilitación Req.'
                        ) : (
                            'Aceptar Reserva'
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
