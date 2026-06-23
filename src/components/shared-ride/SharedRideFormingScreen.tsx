import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SharedRideRequest, SharedRideGroup } from '@/lib/types';
import { Loader2, Users, Timer, Info, XCircle, CheckCircle2, TrendingDown } from 'lucide-react';
import { VamoIcon } from '@/components/VamoIcon';

interface SharedRideFormingScreenProps {
    request: SharedRideRequest;
    group?: SharedRideGroup;
    onCancel: () => void;
    onConfirm?: (price: number) => void;
    onLaunch?: () => void;
    isCancelling: boolean;
    isConfirming?: boolean;
}

export function SharedRideFormingScreen({ 
    request, 
    group, 
    onCancel, 
    onConfirm, 
    onLaunch,
    isCancelling,
    isConfirming 
}: SharedRideFormingScreenProps) {
    const [timeLeft, setTimeLeft] = useState(480); // Default 8m forming
    const [confirmTimeLeft, setConfirmTimeLeft] = useState(45);
    const [launchTimeLeft, setLaunchTimeLeft] = useState(60);

    // Timer Principal (Forming o Lanzamiento)
    useEffect(() => {
        const updateTimers = () => {
            const now = Date.now() / 1000;
            
            // 1. Timer de Formación (ExpiresAt)
            if (group?.expiresAt) {
                const expiresAt = (group.expiresAt as any)?.seconds || now + 480;
                setTimeLeft(Math.max(0, Math.floor(expiresAt - now)));
            }

            // 2. Timer de Lanzamiento (driverSearchStartsAt)
            if (group?.driverSearchStartsAt) {
                const searchStartsAt = (group.driverSearchStartsAt as any)?.seconds || now + 60;
                setLaunchTimeLeft(Math.max(0, Math.floor(searchStartsAt - now)));
            }
        };

        updateTimers();
        const timer = setInterval(updateTimers, 1000);
        return () => clearInterval(timer);
    }, [group?.expiresAt, group?.driverSearchStartsAt]);

    // [REGRESO UX] Lanzar búsqueda automáticamente al llegar a 0
    useEffect(() => {
        const currentReqCount = group?.requestCount ?? group?.passengerIds?.length ?? 1;
        if (((launchTimeLeft === 0 && group?.driverSearchStartsAt) || timeLeft === 0) && (group?.status === 'forming' || group?.status === 'pending_passenger_confirmation') && currentReqCount >= 2) {
            onLaunch?.();
        }
    }, [launchTimeLeft, timeLeft, group?.status, group?.requestCount, group?.passengerIds?.length, group?.driverSearchStartsAt, onLaunch]);

    // Timer para Confirmación (45s)
    useEffect(() => {
        if (request?.status !== 'pending_confirmation' || !group?.confirmationExpiresAt) return;
        
        const updateConfirmTimer = () => {
            const expiresAt = (group.confirmationExpiresAt as any)?.seconds || (Date.now() / 1000 + 45);
            const remaining = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
            setConfirmTimeLeft(remaining);
        };

        updateConfirmTimer();
        const timer = setInterval(updateConfirmTimer, 1000);
        return () => clearInterval(timer);
    }, [request?.status, group?.confirmationExpiresAt]);

    if (!request) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-white">
                 <div className="relative">
                     <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse" />
                     <Loader2 className="w-12 h-12 text-indigo-500 animate-spin relative" />
                 </div>
                 <div className="text-center space-y-1">
                     <span className="text-white font-black uppercase italic tracking-tighter text-lg block">Conectando...</span>
                     <span className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] block animate-pulse">Obteniendo datos del grupo</span>
                 </div>
            </div>
        );
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const isExpired = (request.status === 'forming' && timeLeft === 0) || request.status === 'expired';

    // [VamO PRO] Robust creator identification
    const isCreator = request.roleInGroup === 'creator' || (group ? group.creatorPassengerId === request.passengerId : true);
    const paxCount = group?.occupiedSeats || 1;
    const maxSeats = group?.maxSeats ?? 4;
    const maxRequests = group?.maxRequests ?? 2;
    const requestCount = group?.requestCount ?? group?.passengerIds?.length ?? 1;
    // El grupo está lleno cuando ambos usuarios registrados se sumaron (independiente de asientos)
    const isGroupFull = requestCount >= maxRequests || paxCount >= maxSeats;
    const isInitializing = !group;

    const renderHeader = () => {
        // [FIX] 'assigned' status is set when dispatch starts, so we must also check if the group really has a driver
        if (request.status === 'assigned' && (group?.status === 'driver_assigned' || group?.driverId || request.pickupStatus)) {
            return {
                title: "Conductor Asignado",
                subtitle: "¡Buenas noticias! Ya tenemos un conductor para el grupo.",
                icon: <CheckCircle2 className="w-10 h-10 text-emerald-400" />,
                glow: "bg-emerald-500",
                timerLabel: "Preparando",
                timerValue: "Ruta"
            };
        }

        if (request.status === 'pending_group' || request.status === 'grouped' || request.status === 'forming' || request.status === 'assigned') {
            if (isGroupFull || (launchTimeLeft === 0 && group?.driverSearchStartsAt) || (timeLeft === 0 && requestCount >= 2) || group?.status === 'ready_for_driver_dispatch') {
                return {
                    title: "Buscando Conductor",
                    subtitle: "Ya encontramos pasajeros compatibles. Estamos asignando un conductor al grupo.",
                    icon: <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />,
                    glow: "bg-emerald-500",
                    timerLabel: "Estado",
                    timerValue: "ESPERANDO"
                };
            }
            if (requestCount >= 2) {
                return {
                    title: "Grupo Mínimo Formado",
                    subtitle: "Esperando para buscar conductor...",
                    icon: <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />,
                    glow: "bg-emerald-500",
                    timerLabel: "Lanzamiento",
                    timerValue: formatTime(launchTimeLeft > 0 ? launchTimeLeft : timeLeft)
                };
            }
            return {
                title: isExpired ? 'Grupo Expirado' : 'Buscando Pasajeros',
                subtitle: isExpired ? 'No se encontraron compañeros' : 'Esperamos al menos 1 pasajero compatible más.',
                icon: <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />,
                glow: "bg-indigo-500",
                timerLabel: "Formando",
                timerValue: formatTime(timeLeft)
            };
        }
        
        if (group?.status === 'ready_for_driver' || group?.status === 'dispatched' || group?.status === 'searching_driver') {
            return {
                title: "Buscando Conductor",
                subtitle: "Ya encontramos pasajeros compatibles. Estamos asignando un conductor al grupo.",
                icon: <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />,
                glow: "bg-indigo-500",
                timerLabel: "Estado",
                timerValue: "ESPERANDO"
            };
        }

        if (request.status === 'pending_confirmation') {
            return {
                title: "¡Grupo Encontrado!",
                subtitle: "Confirmá tu lugar en el viaje",
                icon: <TrendingDown className="w-10 h-10 text-amber-400" />,
                glow: "bg-amber-500",
                timerLabel: "Confirmación",
                timerValue: formatTime(confirmTimeLeft)
            };
        }

        return {
            title: "Procesando",
            subtitle: "Actualizando estado...",
            icon: <Loader2 className="w-10 h-10 text-zinc-500 animate-spin" />,
            glow: "bg-zinc-500",
            timerLabel: "Espera",
            timerValue: "--:--"
        };
    };

    const header = renderHeader();

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-5 text-white"
        >
            <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="relative">
                    <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className={`absolute inset-0 ${header.glow} rounded-full blur-2xl`}
                    />
                    <div className={`relative w-20 h-20 rounded-full bg-zinc-900 border-2 border-white/10 flex items-center justify-center`}>
                        {header.icon}
                    </div>
                </div>
                
                <div className="space-y-1">
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                        {header.title}
                    </h2>
                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">
                        {header.subtitle}
                    </p>
                </div>
            </div>

            {/* PRECIO Y AHORRO */}
            {(request.status === 'pending_confirmation' || request.status === 'confirmed' || group?.status === 'ready_for_driver') && (
                <div className="bg-indigo-600 rounded-3xl p-5 shadow-xl border-t border-white/20 flex flex-col gap-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white/50 uppercase tracking-tight">Tu viaje individual costaba</span>
                        <span className="font-black text-white/60 line-through">
                            ${(request.individualFareReference || 0).toLocaleString('es-AR')}
                        </span>
                    </div>

                    <div className="flex justify-between items-center mt-1">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/60 italic">TU TARIFA COMPARTIDA</span>
                            {group?.occupiedSeats && group.occupiedSeats > 1 && (
                                <span className="text-[8px] font-bold text-indigo-300 uppercase mt-0.5">Precio mejorado ({group.occupiedSeats} pax)</span>
                            )}
                        </div>
                        <span className="text-3xl font-black tracking-tighter italic text-white">
                            ${(request.sharedFareEstimate || request.finalFareCash || group?.sharedFarePerPassenger || 0).toLocaleString('es-AR')}
                        </span>
                    </div>
                    
                    <div className="h-px bg-white/10 my-1" />
                    
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-emerald-300" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Ahorro por Compartir</span>
                        </div>
                        <span className="text-sm font-black text-emerald-300 italic">
                            -${(request.individualFareReference - (request.sharedFareEstimate || request.finalFareCash || group?.sharedFarePerPassenger || 0)).toLocaleString('es-AR')}
                        </span>
                    </div>

                    {group?.estimatedSharedTotal && (
                        <>
                            <div className="h-px bg-white/10 my-1" />
                            <div className="flex justify-between items-center bg-black/10 p-3 rounded-2xl border border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Total bruto del grupo</span>
                                    <span className="text-[8px] text-white/30 uppercase mt-0.5">Suma de aportes ({group?.occupiedSeats || 1} pax)</span>
                                </div>
                                <span className="text-lg font-black text-white/80 italic">
                                    ${(group.estimatedSharedTotal).toLocaleString('es-AR')}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-lg font-black tracking-tighter">
                        {header.timerValue}
                    </span>
                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                        {header.timerLabel}
                    </span>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-lg font-black tracking-tighter">
                        {paxCount}/{maxSeats}
                    </span>
                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Asientos</span>
                </div>
            </div>

            <div className="bg-zinc-900/50 border border-dashed border-white/10 rounded-2xl p-4 space-y-3 shadow-inner">
                <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-zinc-500 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                            {request.status === 'pending_confirmation' 
                                ? 'Encontramos un grupo compatible con tu recorrido. Confirmá tu lugar para sumarte al viaje compartido.'
                                : group?.status === 'ready_for_driver' || launchTimeLeft === 0
                                ? 'Ya se formó el grupo. Estamos contactando a los conductores más cercanos. Esto puede tomar unos minutos.'
                                : requestCount >= 2
                                ? 'Todavía pueden sumarse más pasajeros. Esperando el temporizador antes de buscar conductor.'
                                : requestCount === 1
                                ? 'No buscamos conductor todavía. Esperamos al menos 1 pasajero compatible más.'
                                : 'Tu solicitud equivale a 1 asiento. El sistema agrupa viajes con recorridos compatibles para reducir el costo.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="pt-2 flex flex-col gap-3">
                {request.status === 'pending_confirmation' ? (
                    <div className="flex flex-col gap-3">
                        <Button 
                            onClick={() => onConfirm?.(request.sharedFareEstimate || 0)}
                            disabled={isConfirming || confirmTimeLeft === 0}
                            className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-900/40 border border-white/20"
                        >
                            {isConfirming ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                            Confirmar Mi Lugar
                        </Button>
                        <p className="text-[9px] text-zinc-500 text-center uppercase font-bold tracking-tighter">
                            Al confirmar, esperaremos unos segundos por posibles pasajeros cercanos y luego buscaremos conductor.
                        </p>
                    </div>
                ) : isExpired ? (
                    <div className="flex flex-col gap-3">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-2">
                            <p className="text-[11px] text-amber-200/80 leading-relaxed italic text-center">
                                No se formó un grupo compatible a tiempo. Podés intentar de nuevo o pedir un viaje normal.
                            </p>
                            <p className="text-[9px] text-zinc-500 mt-2 text-center font-medium">
                                Recordá que en VamO el conductor te busca en tu dirección. Si necesitás llegar puntual, te recomendamos el servicio de viaje normal.
                            </p>
                        </div>
                         <Button 
                            onClick={async () => {
                                await onCancel();
                                window.location.reload();
                            }}
                            className="w-full h-14 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-500 font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-900/40 border border-white/10"
                        >
                            Intentar de nuevo compartido
                        </Button>
                        <Button 
                            onClick={async () => {
                                await onCancel();
                                window.location.href = '/dashboard/ride?serviceType=professional';
                            }}
                            className="w-full h-14 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500 font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-900/40 border border-white/10"
                        >
                            Pedir viaje normal
                        </Button>
                        <Button 
                            onClick={onCancel}
                            variant="ghost"
                            className="w-full h-12 text-zinc-400 hover:text-white font-bold uppercase tracking-widest text-[10px]"
                        >
                            Cancelar y salir
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {/* [VamO PRO] Botón principal más visible para el creador */}
                        <Button 
                            onClick={onCancel}
                            disabled={isCancelling}
                            className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-900/40 border border-white/10"
                        >
                            {isCancelling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                            Cancelar solicitud
                        </Button>
                        
                        {requestCount === 1 && (
                            <p className="text-[9px] text-zinc-500 text-center uppercase font-bold tracking-tight">
                                Podés cancelar para pedir un viaje normal si preferís no esperar.
                            </p>
                        )}
                    </div>
                )}
                
                {request.status === 'forming' && (
                    <p className="text-center text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                        VamO Compartido • Máximo tiempo de espera: 8 min • Solo Efectivo
                    </p>
                )}
            </div>
        </motion.div>
    );
}
