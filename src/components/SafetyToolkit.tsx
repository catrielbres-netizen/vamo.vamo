'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VamoIcon } from './VamoIcon';
import { useRideRecorder } from '@/hooks/useRideRecorder';
import { cn } from '@/lib/utils';
import { Mic, Video, Shield, Square, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { Ride, WithId } from '@/lib/types';

interface SafetyToolkitProps {
    ride: WithId<Ride>;
    role: 'driver' | 'passenger';
    className?: string;
}

export function SafetyToolkit({ ride, role, className }: SafetyToolkitProps) {
    const { user } = useUser();
    const { toast } = useToast();
    const {
        isRecording,
        recordingType,
        recordingId,
        error,
        startRecording,
        stopRecording
    } = useRideRecorder(ride.id, user?.uid || '', role, ride.cityKey);

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        if (error) {
            toast({
                variant: 'destructive',
                title: 'Error de grabación',
                description: error
            });
        }
    }, [error, toast]);

    // Notify other party logic is handled inside useRideRecorder via Firestore updates
    // We can show a toast here when WE are being recorded by the other party
    useEffect(() => {
        const status = ride.recordingStatus;
        if (!status) return;

        if (role === 'driver' && status.isRecordingByPassenger) {
            toast({
                title: 'Viaje siendo grabado',
                description: 'El pasajero ha iniciado una grabación de seguridad.',
                duration: 5000,
            });
        } else if (role === 'passenger' && status.isRecordingByDriver) {
            toast({
                title: 'Viaje siendo grabado',
                description: 'El conductor ha iniciado una grabación de seguridad.',
                duration: 5000,
            });
        }
    }, [ride.recordingStatus, role, toast]);

    const handleStartRecording = async (type: 'audio' | 'video' | 'audio_video') => {
        try {
            await startRecording(type);
            setIsMenuOpen(false);
            toast({
                title: 'Grabación iniciada',
                description: `Se está capturando ${type === 'audio' ? 'audio' : 'video'} por seguridad.`
            });
        } catch (err) {
            // Error handled by hook
        }
    };

    return (
        <div className={cn("relative", className)}>
            {/* RECORDING STATUS INDICATOR */}
            {isRecording && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full animate-pulse z-50">
                    <div className="w-2 h-2 rounded-full bg-white" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">
                        Grabando {recordingType === 'audio' ? 'Audio' : 'Video'}
                    </span>
                </div>
            )}

            <Card className="bg-zinc-950/80 glass-morphism border-white/10 rounded-[2rem] overflow-hidden">
                <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                        <Shield className="w-3 h-3 text-primary" />
                        Toolkit de Seguridad
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                    {!isRecording ? (
                        <div className="space-y-3">
                            <div className="bg-indigo-500/10 p-4 rounded-2xl border border-indigo-500/20 flex gap-3 items-start animate-in fade-in zoom-in duration-700">
                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                                    <Shield className="w-4 h-4 text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">Protección Recomendada</p>
                                    <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                                        Este viaje puede contar con grabación de audio de seguridad para auditoría. Te recomendamos activarla.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    variant="secondary"
                                    className="h-14 rounded-2xl bg-zinc-900 border border-white/5 hover:bg-zinc-800 flex flex-col items-center justify-center gap-1 group"
                                    onClick={() => handleStartRecording('audio')}
                                >
                                    <Mic className="w-5 h-5 text-zinc-400 group-hover:text-primary transition-colors" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary">Activar Audio</span>
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="h-14 rounded-2xl bg-zinc-900 border border-white/5 hover:bg-zinc-800 flex flex-col items-center justify-center gap-1 group"
                                    onClick={() => handleStartRecording('video')}
                                >
                                    <Video className="w-5 h-5 text-zinc-400 group-hover:text-primary transition-colors" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Grabar Video</span>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="destructive"
                            className="w-full h-14 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white font-black uppercase tracking-widest flex items-center justify-center gap-2"
                            onClick={() => stopRecording()}
                        >
                            <Square className="w-5 h-5 fill-current" />
                            Detener Grabación
                        </Button>
                    )}

                    <div className="bg-primary/5 p-3 rounded-2xl border border-primary/10">
                        <p className="text-[8px] font-bold text-primary/70 uppercase tracking-widest text-center">
                            Las grabaciones son privadas y se almacenan bajo cifrado VamO PRO.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
